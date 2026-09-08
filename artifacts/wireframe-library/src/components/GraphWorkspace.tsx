import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Glyph } from "@/components/Glyph";
import { useManifest } from "@/lib/manifest-context";
import {
  DEFAULT_AXES,
  GRAPH_CANVAS,
  blankGraphDocument,
  graphDocumentFromComposition,
  graphDocumentFingerprint,
  hasExplicitGraphMapping,
  isGraphDocumentDiverged,
  parseStoredGraphDocument,
  validateGraphDocument,
  type EditableGraphDocument,
  type GraphEdge,
  type GraphNode,
} from "@/lib/graph-document";
import type { Composition, LibraryComponent } from "@/lib/library";
import { AlertCircle, CheckCircle2, CirclePlus, Link2, MousePointer2, Move, Trash2, ZoomIn, ZoomOut } from "lucide-react";

const STORAGE_KEY = "tiered-wireframe-library.graph-workspace.v1";
const PICK_CONNECTION_SOURCE = "__pick_connection_source__";
const NODE_WIDTH = 138;
const NODE_HEIGHT = 92;

function updateDocument(
  setDocument: React.Dispatch<React.SetStateAction<EditableGraphDocument>>,
  updater: (document: EditableGraphDocument) => EditableGraphDocument,
) {
  setDocument((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
}

function firstComponent(components: LibraryComponent[], family: EditableGraphDocument["family"], edge = false) {
  const preferred = edge
    ? family === "workflow" ? ["wf.flow-edge", "prim.edge.plain"] : ["kg.relation-edge", "kg.property-edge", "prim.edge.plain"]
    : family === "workflow" ? ["wf.task", "prim.node.generic"] : ["kg.entity", "prim.node.generic"];
  return preferred.map((id) => components.find((component) => component.id === id)).find(Boolean) ?? components.find((component) => component.family === family && !component.shape.includes("edge")) ?? components[0];
}

function NodeVisual({
  node,
  component,
  selected,
  invalid,
  onPointerDown,
  onClick,
}: {
  node: GraphNode;
  component?: LibraryComponent;
  selected: boolean;
  invalid: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onClick: () => void;
}) {
  const x = node.position.x - NODE_WIDTH / 2;
  const y = node.position.y - NODE_HEIGHT / 2;
  return (
    <g
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-label={`${node.label || "Unnamed node"}${node.typeTag ? `, ${node.typeTag}` : ""}`}
      aria-selected={selected}
      data-testid={`graph-node-${node.id}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
      style={{ cursor: "grab", outline: "none" }}
    >
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={10}
        fill={selected ? "rgba(37, 99, 235, 0.10)" : invalid ? "rgba(220, 38, 38, 0.08)" : "white"}
        stroke={selected ? "#2563EB" : invalid ? "#DC2626" : "#CBD5E1"}
        strokeWidth={selected ? 3 : 1.5}
        strokeDasharray={component ? undefined : "5 4"}
      />
      {component ? (
        <foreignObject x={4} y={4} width={NODE_WIDTH - 8} height={NODE_HEIGHT - 8} pointerEvents="none">
          <div className="flex h-full flex-col items-center justify-center overflow-hidden text-center">
            <Glyph
              component={component}
              axes={node.axes}
              hueIndex={node.hueIndex ?? 0}
              name={node.label}
              typeTag={node.typeTag}
              props={node.properties}
              scale={0.62}
            />
          </div>
        </foreignObject>
      ) : (
        <>
          <text x={NODE_WIDTH / 2} y={40} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1A1D23">
            {node.label || "Unnamed node"}
          </text>
          <text x={NODE_WIDTH / 2} y={60} textAnchor="middle" fontSize={10} fill="#64748B">
            unavailable visual
          </text>
        </>
      )}
      {invalid && <circle cx={NODE_WIDTH - 12} cy={12} r={5} fill="#DC2626" />}
    </g>
  );
}

function GraphCanvas({
  document,
  components,
  selectedId,
  connectingFrom,
  onSelect,
  onMoveNode,
  onConnect,
  onViewportChange,
}: {
  document: EditableGraphDocument;
  components: LibraryComponent[];
  selectedId: string | null;
  connectingFrom: string | null;
  onSelect: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (id: string) => void;
  onViewportChange: (viewport: EditableGraphDocument["visualSettings"]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interaction = useRef<
    | { type: "drag"; id: string; startX: number; startY: number; nodeX: number; nodeY: number }
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | null
  >(null);
  const report = validateGraphDocument(document, components);
  const invalidIds = new Set(report.issues.filter((issue) => issue.severity === "error" && issue.elementId).map((issue) => issue.elementId));
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
  const componentById = new Map(components.map((component) => [component.id, component]));

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement | SVGGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * GRAPH_CANVAS.width,
      y: ((event.clientY - rect.top) / rect.height) * GRAPH_CANVAS.height,
    };
  };

  const startNodeInteraction = (event: React.PointerEvent<SVGGElement>, node: GraphNode) => {
    event.stopPropagation();
    onSelect(node.id);
    if (connectingFrom) {
      return;
    }
    const point = pointFromEvent(event);
    interaction.current = {
      type: "drag",
      id: node.id,
      startX: point.x,
      startY: point.y,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    interaction.current = {
      type: "pan",
      startX: point.x,
      startY: point.y,
      panX: document.visualSettings.pan.x,
      panY: document.visualSettings.pan.y,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const movePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = interaction.current;
    if (!current) return;
    const point = pointFromEvent(event);
    if (current.type === "drag") {
      const x = Math.max(70, Math.min(GRAPH_CANVAS.width - 70, current.nodeX + (point.x - current.startX) / document.visualSettings.zoom));
      const y = Math.max(55, Math.min(GRAPH_CANVAS.height - 55, current.nodeY + (point.y - current.startY) / document.visualSettings.zoom));
      onMoveNode(current.id, x, y);
    } else {
      onViewportChange({
        ...document.visualSettings,
        pan: { x: current.panX + point.x - current.startX, y: current.panY + point.y - current.startY },
      });
    }
  };

  const finishPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    interaction.current = null;
    if (svgRef.current?.hasPointerCapture?.(event.pointerId)) svgRef.current.releasePointerCapture?.(event.pointerId);
  };

  const zoom = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const next = Math.max(0.5, Math.min(2, document.visualSettings.zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    onViewportChange({ ...document.visualSettings, zoom: Number(next.toFixed(2)) });
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white" data-testid="graph-canvas-shell">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${GRAPH_CANVAS.width} ${GRAPH_CANVAS.height}`}
        className="h-[520px] w-full touch-none"
        role="application"
        aria-label="Interactive graph canvas. Drag nodes to reposition them. Use Connect nodes to make a relationship."
        onPointerDown={startPan}
        onPointerMove={movePointer}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={zoom}
      >
        <defs>
          <pattern id="graph-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#E2E8F0" strokeWidth="1" />
          </pattern>
          <marker id="graph-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 z" fill="#64748B" />
          </marker>
        </defs>
        {document.visualSettings.showGrid && <rect width={GRAPH_CANVAS.width} height={GRAPH_CANVAS.height} fill="url(#graph-grid)" />}
        <g transform={`translate(${document.visualSettings.pan.x} ${document.visualSettings.pan.y}) scale(${document.visualSettings.zoom})`}>
          {document.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) return null;
            const invalid = invalidIds.has(edge.id);
            const color = invalid ? "#DC2626" : "#64748B";
            return (
              <g key={edge.id} data-testid={`graph-edge-${edge.id}`} onClick={(event) => { event.stopPropagation(); onSelect(edge.id); }}>
                <line x1={source.position.x} y1={source.position.y} x2={target.position.x} y2={target.position.y} stroke="transparent" strokeWidth={16} />
                <line
                  x1={source.position.x}
                  y1={source.position.y}
                  x2={target.position.x}
                  y2={target.position.y}
                  stroke={selectedId === edge.id ? "#2563EB" : color}
                  strokeWidth={selectedId === edge.id ? 4 : 2}
                  strokeDasharray={invalid ? "6 4" : undefined}
                  markerEnd="url(#graph-arrow)"
                />
                {edge.label && (
                  <text x={(source.position.x + target.position.x) / 2} y={(source.position.y + target.position.y) / 2 - 8} textAnchor="middle" fontSize={11} fontStyle="italic" fill={color}>
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {document.nodes.map((node) => (
            <NodeVisual
              key={node.id}
              node={node}
              component={componentById.get(node.componentId)}
              selected={selectedId === node.id}
              invalid={invalidIds.has(node.id)}
              onPointerDown={(event) => startNodeInteraction(event, node)}
              onClick={() => {
                onSelect(node.id);
                if (connectingFrom) onConnect(node.id);
              }}
            />
          ))}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="bg-white/90 text-[10px] shadow-sm"><Move className="mr-1 h-3 w-3" />Drag to move</Badge>
        <Badge variant="secondary" className="bg-white/90 text-[10px] shadow-sm"><MousePointer2 className="mr-1 h-3 w-3" />Scroll to zoom</Badge>
        {connectingFrom && <Badge className="bg-primary/90 text-[10px]">Select a target node</Badge>}
      </div>
      <div className="absolute right-3 top-3 flex gap-1 rounded-md border border-border bg-white/90 p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Zoom out" onClick={() => onViewportChange({ ...document.visualSettings, zoom: Math.max(0.5, Number((document.visualSettings.zoom - 0.1).toFixed(2))) })}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="flex w-10 items-center justify-center text-[10px] text-muted-foreground">{Math.round(document.visualSettings.zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Zoom in" onClick={() => onViewportChange({ ...document.visualSettings, zoom: Math.min(2, Number((document.visualSettings.zoom + 0.1).toFixed(2))) })}><ZoomIn className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function NodeTable({
  document,
  components,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
}: {
  document: EditableGraphDocument;
  components: LibraryComponent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<GraphNode>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const nodeComponents = components.filter((component) => !component.shape.startsWith("arrow") && !component.shape.startsWith("line") && !component.id.includes("edge"));
  return (
    <Card className="overflow-hidden" data-testid="panel-node-data">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><h3 className="text-sm font-semibold">Nodes</h3><p className="text-[11px] text-muted-foreground">Labels and properties stay in sync with the canvas.</p></div>
        <Button size="sm" onClick={onAdd} data-testid="button-add-node"><CirclePlus className="mr-1.5 h-3.5 w-3.5" />Add node</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Node</th><th className="px-3 py-2">Label</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Properties</th><th className="px-3 py-2">Visual</th><th className="w-10 px-3 py-2" /></tr></thead>
          <tbody>
            {document.nodes.map((node) => (
              <tr key={node.id} className={`border-t border-border align-top ${selectedId === node.id ? "bg-primary/5" : ""}`} data-testid={`node-row-${node.id}`}>
                <td className="px-3 py-2"><button className="font-mono text-[10px] text-primary hover:underline" onClick={() => onSelect(node.id)}>{node.id}</button></td>
                <td className="px-3 py-2"><input aria-label={`Label for ${node.id}`} value={node.label} onChange={(event) => onUpdate(node.id, { label: event.target.value })} className="w-28 rounded border border-input bg-background px-2 py-1.5" /></td>
                <td className="px-3 py-2"><input aria-label={`Type for ${node.id}`} value={node.typeTag} onChange={(event) => onUpdate(node.id, { typeTag: event.target.value })} className="w-24 rounded border border-input bg-background px-2 py-1.5" /></td>
                <td className="px-3 py-2"><input aria-label={`Properties for ${node.id}`} value={node.properties.join(", ")} onChange={(event) => onUpdate(node.id, { properties: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="w-36 rounded border border-input bg-background px-2 py-1.5" placeholder="status, owner" /></td>
                <td className="px-3 py-2"><select aria-label={`Visual for ${node.id}`} value={node.componentId} onChange={(event) => onUpdate(node.id, { componentId: event.target.value })} className="w-36 rounded border border-input bg-background px-2 py-1.5"><option value={node.componentId}>{node.componentId}</option>{nodeComponents.filter((component) => component.id !== node.componentId).map((component) => <option key={component.id} value={component.id}>{component.id}</option>)}</select></td>
                <td className="px-3 py-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete ${node.id}`} onClick={() => onDelete(node.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
            {document.nodes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No nodes yet. Add one or choose a baseline template.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EdgeTable({
  document,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAdd,
}: {
  document: EditableGraphDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<GraphEdge>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card className="overflow-hidden" data-testid="panel-edge-data">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><h3 className="text-sm font-semibold">Relationships</h3><p className="text-[11px] text-muted-foreground">Reconnect rows here or use Connect nodes on the canvas.</p></div>
        <Button size="sm" variant="outline" onClick={onAdd} disabled={document.nodes.length < 2} data-testid="button-add-edge"><Link2 className="mr-1.5 h-3.5 w-3.5" />Add relationship</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Relationship</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Label</th><th className="w-10 px-3 py-2" /></tr></thead>
          <tbody>
            {document.edges.map((edge) => (
              <tr key={edge.id} className={`border-t border-border align-top ${selectedId === edge.id ? "bg-primary/5" : ""}`} data-testid={`edge-row-${edge.id}`}>
                <td className="px-3 py-2"><button className="font-mono text-[10px] text-primary hover:underline" onClick={() => onSelect(edge.id)}>{edge.id}</button></td>
                <td className="px-3 py-2"><select aria-label={`Source for ${edge.id}`} value={edge.source} onChange={(event) => onUpdate(edge.id, { source: event.target.value })} className="w-32 rounded border border-input bg-background px-2 py-1.5"><option value="">Choose source</option>{document.nodes.map((node) => <option key={node.id} value={node.id}>{node.label || node.id}</option>)}</select></td>
                <td className="px-3 py-2"><select aria-label={`Target for ${edge.id}`} value={edge.target} onChange={(event) => onUpdate(edge.id, { target: event.target.value })} className="w-32 rounded border border-input bg-background px-2 py-1.5"><option value="">Choose target</option>{document.nodes.map((node) => <option key={node.id} value={node.id}>{node.label || node.id}</option>)}</select></td>
                <td className="px-3 py-2"><input aria-label={`Label for ${edge.id}`} value={edge.label} onChange={(event) => onUpdate(edge.id, { label: event.target.value })} className="w-32 rounded border border-input bg-background px-2 py-1.5" placeholder="works at" /></td>
                <td className="px-3 py-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete ${edge.id}`} onClick={() => onDelete(edge.id)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
            {document.edges.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No relationships yet. Add one after creating two nodes.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function GraphWorkspace({ seedDocument }: { seedDocument?: EditableGraphDocument | null }) {
  const { manifest } = useManifest();
  const [document, setDocument] = useState<EditableGraphDocument>(() => {
    const restored = typeof window !== "undefined" ? parseStoredGraphDocument(window.localStorage.getItem(STORAGE_KEY)) : null;
    return restored ?? seedDocument ?? blankGraphDocument();
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [templateChoice, setTemplateChoice] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!seedDocument || seedDocument.id === document.id) return;
    setDocument(seedDocument);
    setSelectedId(null);
    setStatus(`Loaded ${seedDocument.title} into the editable workspace.`);
  }, [seedDocument?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
    } catch {
      setStatus("This browser blocked local saving; your changes remain available until this tab closes.");
    }
  }, [document]);

  const report = useMemo(() => validateGraphDocument(document, manifest.components), [document, manifest.components]);
  const diverged = isGraphDocumentDiverged(document);
  const invalidIds = new Set(report.issues.filter((issue) => issue.severity === "error" && issue.elementId).map((issue) => issue.elementId));
  const source = manifest.sourceCatalog?.sources.find((item) => item.id === document.template.sourceId);
  const visualLanguages = [...new Set((manifest.sourceCatalog?.sources.flatMap((item) => item.visualLanguages ?? []) ?? []).concat(document.visualSettings.visualLanguage))];
  const tokenModes = [...new Set((source?.tokenModes ?? ["Light", "Dark", "Monochrome LT"]).concat(document.visualSettings.tokenMode))];
  const templates = manifest.compositions.filter(
    (composition) =>
      ["molecule", "organism", "template"].includes(composition.atomicLevel) &&
      hasExplicitGraphMapping(composition),
  );

  const changeSettings = (settings: EditableGraphDocument["visualSettings"]) => updateDocument(setDocument, (current) => ({ ...current, visualSettings: settings }));
  const select = (id: string) => setSelectedId(id);

  const addNode = () => {
    const component = firstComponent(manifest.components, document.family);
    let index = document.nodes.length + 1;
    while (document.nodes.some((node) => node.id === `node-${index}`)) index += 1;
    const node: GraphNode = {
      id: `node-${index}`,
      label: `New node ${index}`,
      typeTag: document.family === "workflow" ? "step" : "entity",
      properties: [],
      componentId: component?.id ?? "prim.node.generic",
      axes: component?.axes ?? DEFAULT_AXES,
      position: { x: 150 + ((index - 1) % 4) * 200, y: 140 + Math.floor((index - 1) / 4) * 170 },
    };
    updateDocument(setDocument, (current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setStatus(`Added ${node.id}.`);
  };

  const addEdge = (from?: string, to?: string) => {
    const component = firstComponent(manifest.components, document.family, true);
    const sourceId = from ?? document.nodes[0]?.id ?? "";
    const targetId = to ?? document.nodes.find((node) => node.id !== sourceId)?.id ?? "";
    let index = document.edges.length + 1;
    while (document.edges.some((edge) => edge.id === `edge-${index}`)) index += 1;
    const edge: GraphEdge = {
      id: `edge-${index}`,
      source: sourceId,
      target: targetId,
      label: "",
      componentId: component?.id ?? "prim.edge.plain",
      axes: component?.axes ?? DEFAULT_AXES,
    };
    updateDocument(setDocument, (current) => ({ ...current, edges: [...current.edges, edge] }));
    setSelectedId(edge.id);
    setConnectingFrom(null);
    setStatus(`Added ${edge.id}. Check its endpoints before continuing.`);
  };

  const connectNode = (id: string) => {
    if (!connectingFrom || connectingFrom === PICK_CONNECTION_SOURCE) {
      setConnectingFrom(id);
      setSelectedId(id);
      setStatus(`Connecting from ${id}. Select a target node.`);
      return;
    }
    if (connectingFrom === id) {
      setStatus("A relationship needs two different nodes.");
      return;
    }
    addEdge(connectingFrom, id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateDocument(setDocument, (current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== selectedId),
      edges: current.edges.filter((edge) => edge.id !== selectedId && edge.source !== selectedId && edge.target !== selectedId),
    }));
    setStatus(`Removed ${selectedId}.`);
    setSelectedId(null);
  };

  const applyTemplate = (composition: Composition) => {
    const next = graphDocumentFromComposition(composition);
    setDocument(next);
    setTemplateChoice(composition.id);
    setSelectedId(null);
    setStatus(`Loaded approved baseline ${composition.label}.`);
  };

  const resetBlank = () => {
    const next = blankGraphDocument(document.family);
    setDocument(next);
    setSelectedId(null);
    setStatus("Started a blank graph.");
  };

  return (
    <div className="space-y-5" data-testid="graph-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Editable graph workspace</div>
          <h2 className="mt-1 text-xl font-bold">{document.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Edit graph data and layout independently from the Librarian plan. Changes are saved in this browser.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">{document.family}</Badge>
          <Badge variant={report.valid ? "default" : "destructive"} data-testid="badge-graph-validity">{report.valid ? "Valid graph" : "Needs attention"}</Badge>
          {diverged && <Badge variant="outline" className="border-amber-400 text-amber-700">Edited from generated plan</Badge>}
        </div>
      </div>

      <Card className="space-y-4 border-primary/20 bg-primary/[0.03] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="graph-template" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Start from approved baseline</label>
            <select id="graph-template" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Choose a template…</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.label} · {template.family}</option>)}
            </select>
          </div>
          <Button variant="outline" disabled={!templateChoice} onClick={() => { const composition = templates.find((item) => item.id === templateChoice); if (composition) applyTemplate(composition); }} data-testid="button-apply-template">Apply template</Button>
          <Button variant="outline" onClick={resetBlank} data-testid="button-new-blank-graph">New blank graph</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <span>Active template: <strong className="font-medium text-foreground">{document.template.label}</strong></span>
          <span>Source: <strong className="font-medium text-foreground">{source?.label ?? document.template.sourceId ?? "Local fallback"}</strong></span>
          <span>Mapping: <strong className="font-medium text-foreground capitalize">{document.template.mappingStatus ?? "approved"}</strong></span>
          <span data-testid="text-persistence-status"><CheckCircle2 className="mr-1 inline h-3 w-3 text-green-600" />Saved locally</span>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={connectingFrom ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (connectingFrom) {
                    setConnectingFrom(null);
                    setStatus("Connection mode cancelled.");
                  } else {
                    setConnectingFrom(PICK_CONNECTION_SOURCE);
                    setStatus("Select a source node, then a target node.");
                  }
                }}
                data-testid="button-connect-nodes"
              >
                <Link2 className="mr-1.5 h-3.5 w-3.5" />{connectingFrom ? "Cancel connection" : "Connect nodes"}
              </Button>
              <Button variant="outline" size="sm" disabled={!selectedId} onClick={deleteSelected} data-testid="button-delete-selected"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete selected</Button>
            </div>
            <span className="text-[11px] text-muted-foreground">{document.nodes.length} nodes · {document.edges.length} relationships</span>
          </div>
          <GraphCanvas document={document} components={manifest.components} selectedId={selectedId} connectingFrom={connectingFrom} onSelect={select} onConnect={connectNode} onMoveNode={(id, x, y) => updateDocument(setDocument, (current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, position: { x, y } } : node) }))} onViewportChange={changeSettings} />
          <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite" data-testid="graph-status">{status || "Select a node to inspect it, or drag the canvas background to pan."}</p>
        </div>

        <Card className="h-fit space-y-4 p-4" data-testid="panel-graph-settings">
          <div><h3 className="text-sm font-semibold">Visual settings</h3><p className="mt-1 text-[11px] text-muted-foreground">The active source language stays visible while you edit.</p></div>
          <div><label htmlFor="visual-language" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visual language</label><select id="visual-language" value={document.visualSettings.visualLanguage} onChange={(event) => changeSettings({ ...document.visualSettings, visualLanguage: event.target.value })} className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs">{visualLanguages.map((language) => <option key={language} value={language}>{language}</option>)}</select></div>
          <div><label htmlFor="token-mode" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Token mode</label><select id="token-mode" value={document.visualSettings.tokenMode} onChange={(event) => changeSettings({ ...document.visualSettings, tokenMode: event.target.value })} className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs">{tokenModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></div>
          <div><label htmlFor="graph-detail" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Label density</label><select id="graph-detail" value={document.visualSettings.detail} onChange={(event) => changeSettings({ ...document.visualSettings, detail: event.target.value as "overview" | "detail" })} className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"><option value="overview">Overview</option><option value="detail">Detail</option></select></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={document.visualSettings.showGrid} onChange={(event) => changeSettings({ ...document.visualSettings, showGrid: event.target.checked })} /> Show canvas grid</label>
          <div className="border-t border-border pt-3 text-[11px] text-muted-foreground"><div className="font-semibold text-foreground">Document status</div><div className="mt-1">{document.origin.kind === "generated" ? `From Librarian plan${document.origin.planTitle ? ` “${document.origin.planTitle}”` : ""}` : document.origin.kind === "template" ? "From approved baseline template" : "Started blank"}</div><div className="mt-1 font-mono text-[9px]">fingerprint {graphDocumentFingerprint(document)}</div></div>
        </Card>
      </div>

      <NodeTable document={document} components={manifest.components} selectedId={selectedId} onSelect={select} onAdd={addNode} onUpdate={(id, patch) => updateDocument(setDocument, (current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }))} onDelete={(id) => { updateDocument(setDocument, (current) => ({ ...current, nodes: current.nodes.filter((node) => node.id !== id), edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id) })); if (selectedId === id) setSelectedId(null); }} />
      <EdgeTable document={document} selectedId={selectedId} onSelect={select} onAdd={() => addEdge()} onUpdate={(id, patch) => updateDocument(setDocument, (current) => ({ ...current, edges: current.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge) }))} onDelete={(id) => { updateDocument(setDocument, (current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== id) })); if (selectedId === id) setSelectedId(null); }} />

      {report.issues.length > 0 && (
        <Card className="border-amber-300/50 bg-amber-50/40 p-4" data-testid="panel-graph-validation">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertCircle className="h-4 w-4" />Validation feedback</div>
          <ul className="mt-2 space-y-1.5">{report.issues.map((issue, index) => <li key={`${issue.elementId ?? "document"}-${index}`} className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-amber-900"}`}><span className="mr-1 font-semibold uppercase">{issue.severity}</span>{issue.elementId && <span className="mr-1 font-mono">[{issue.elementId}]</span>}{issue.message}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

export default GraphWorkspace;