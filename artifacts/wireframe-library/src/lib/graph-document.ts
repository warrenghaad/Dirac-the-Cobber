import { z } from "zod";
import type { AxisCoords, Composition, LibraryComponent } from "@/lib/library";
import type { DiagramPlan, Placement } from "@/lib/diagram-types";

export const GRAPH_CANVAS = { width: 960, height: 600 } as const;
export const DEFAULT_AXES: AxisCoords = { a1: 1, a2: 0, a3: 2, a4: 0, a5: 2 };

const AxisSchema = z.object({
  a1: z.number().min(0).max(4),
  a2: z.number().min(0).max(4),
  a3: z.number().min(0).max(4),
  a4: z.number().min(0).max(4),
  a5: z.number().min(0).max(4),
});

const PositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  typeTag: z.string(),
  properties: z.array(z.string()),
  componentId: z.string().min(1),
  axes: AxisSchema,
  position: PositionSchema,
  hueIndex: z.number().int().min(0).max(4).optional(),
  role: z.string().optional(),
  focal: z.boolean().optional(),
});

export const GraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  target: z.string(),
  label: z.string(),
  componentId: z.string().min(1),
  axes: AxisSchema,
  hueIndex: z.number().int().min(0).max(4).optional(),
});

export const GraphTemplateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  family: z.string().min(1),
  sourceId: z.string().optional(),
  visualLanguage: z.string().optional(),
  mappingStatus: z.enum(["approved", "reference-fallback", "pending-review"]).optional(),
});

export const GraphVisualSettingsSchema = z.object({
  visualLanguage: z.string().min(1),
  tokenMode: z.string().min(1),
  showGrid: z.boolean(),
  detail: z.enum(["overview", "detail"]),
  zoom: z.number().min(0.5).max(2),
  pan: z.object({ x: z.number(), y: z.number() }),
});

export const EditableGraphDocumentSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  family: z.enum(["knowledge-graph", "workflow"]),
  template: GraphTemplateSchema,
  visualSettings: GraphVisualSettingsSchema,
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  origin: z.object({
    kind: z.enum(["blank", "template", "generated"]),
    sourceFingerprint: z.string().optional(),
    planTitle: z.string().optional(),
  }),
  updatedAt: z.string().min(1),
  archived: z.boolean().optional(),
});

export const GraphWorkspaceCollectionSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(EditableGraphDocumentSchema),
  activeId: z.string().nullable(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphTemplate = z.infer<typeof GraphTemplateSchema>;
export type GraphVisualSettings = z.infer<typeof GraphVisualSettingsSchema>;
export type EditableGraphDocument = z.infer<typeof EditableGraphDocumentSchema>;
export type GraphWorkspaceCollection = z.infer<typeof GraphWorkspaceCollectionSchema>;
export type GraphWorkspaceCollectionRecovery = {
  collection: GraphWorkspaceCollection;
  rejectedCount: number;
  malformed: boolean;
};

export type GraphValidationIssue = {
  severity: "error" | "warning";
  message: string;
  elementId?: string;
};

export type GraphValidationReport = {
  valid: boolean;
  issues: GraphValidationIssue[];
};

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function axesForPlacement(placement: Placement): AxisCoords {
  return { ...DEFAULT_AXES, ...placement.axes };
}

function spreadPosition(index: number, count: number, family: EditableGraphDocument["family"]) {
  if (family === "workflow") {
    return {
      x: 120 + (index % Math.max(1, count)) * Math.min(220, 720 / Math.max(1, count)),
      y: GRAPH_CANVAS.height / 2,
    };
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return {
    x: 150 + (index % columns) * 230,
    y: 160 + Math.floor(index / columns) * 180,
  };
}

function templateForComposition(composition: Composition): GraphTemplate {
  return {
    id: composition.id,
    label: composition.label,
    family: composition.family === "tier1" ? "workflow" : composition.family,
    sourceId: composition.sourceMetadata?.sourceId ?? "figma.visual-logic-primitives",
    visualLanguage: composition.family === "workflow" ? "workflow" : composition.family === "knowledge-graph" ? "knowledge graph" : "wireframe",
    mappingStatus: "approved",
  };
}

type ExplicitCompositionRelationship = {
  edgeRole: string;
  sourceRole: string;
  targetRole: string;
};

type ExplicitCompositionGraphMapping = {
  nodeRoles: string[];
  relationships: ExplicitCompositionRelationship[];
  omittedRoles: string[];
};

const COMPOSITION_GRAPH_MAPPINGS: Record<string, ExplicitCompositionGraphMapping> = {
  "mol.task-card": {
    nodeRoles: ["container"],
    relationships: [],
    omittedRoles: ["label", "status-badge"],
  },
  "mol.kg-entity-labeled": {
    nodeRoles: ["subject", "literal"],
    relationships: [{ edgeRole: "edge", sourceRole: "subject", targetRole: "literal" }],
    omittedRoles: [],
  },
  "org.workflow-decision-branch": {
    nodeRoles: ["decision", "task-left", "task-right"],
    relationships: [
      { edgeRole: "branch-left", sourceRole: "decision", targetRole: "task-left" },
      { edgeRole: "branch-right", sourceRole: "decision", targetRole: "task-right" },
    ],
    omittedRoles: [],
  },
  "org.kg-class-hierarchy": {
    nodeRoles: ["parent-class", "entity-left", "entity-right"],
    relationships: [
      { edgeRole: "subclass-left", sourceRole: "entity-left", targetRole: "parent-class" },
      { edgeRole: "subclass-right", sourceRole: "entity-right", targetRole: "parent-class" },
    ],
    omittedRoles: [],
  },
  "tpl.simple-workflow": {
    nodeRoles: ["start", "task", "decision", "end-yes", "end-no"],
    relationships: [
      { edgeRole: "flow-1", sourceRole: "start", targetRole: "task" },
      { edgeRole: "flow-2", sourceRole: "task", targetRole: "decision" },
      { edgeRole: "branch-yes", sourceRole: "decision", targetRole: "end-yes" },
      { edgeRole: "branch-no", sourceRole: "decision", targetRole: "end-no" },
    ],
    omittedRoles: [],
  },
  "tpl.knowledge-graph-overview": {
    nodeRoles: ["class", "entity-1", "entity-2", "entity-3"],
    relationships: [
      { edgeRole: "relation-1", sourceRole: "class", targetRole: "entity-1" },
      { edgeRole: "relation-2", sourceRole: "class", targetRole: "entity-2" },
      { edgeRole: "relation-3", sourceRole: "class", targetRole: "entity-3" },
      { edgeRole: "property-1", sourceRole: "entity-1", targetRole: "entity-2" },
      { edgeRole: "property-2", sourceRole: "entity-2", targetRole: "entity-3" },
    ],
    omittedRoles: ["group"],
  },
};

export function hasExplicitGraphMapping(composition: Composition) {
  const mapping = COMPOSITION_GRAPH_MAPPINGS[composition.id];
  if (!mapping) return false;
  const slotRoles = composition.slots.map((slot) => slot.role);
  const edgeRoles = mapping.relationships.map((relationship) => relationship.edgeRole);
  const classifiedRoles = [...mapping.nodeRoles, ...edgeRoles, ...mapping.omittedRoles];
  if (new Set(classifiedRoles).size !== classifiedRoles.length) return false;
  if (classifiedRoles.length !== slotRoles.length || classifiedRoles.some((role) => !slotRoles.includes(role))) return false;
  return mapping.relationships.every(
    (relationship) =>
      mapping.nodeRoles.includes(relationship.sourceRole) &&
      mapping.nodeRoles.includes(relationship.targetRole),
  );
}

function makeDocument(
  input: Pick<EditableGraphDocument, "title" | "family" | "template" | "nodes" | "edges" | "origin">,
): EditableGraphDocument {
  const source = {
    title: input.title,
    family: input.family,
    template: input.template.id,
    nodes: input.nodes,
    edges: input.edges,
  };
  return {
    version: 1,
    id: `graph-${fingerprint(source)}`,
    title: input.title,
    family: input.family,
    template: input.template,
    visualSettings: {
      visualLanguage: input.template.visualLanguage ?? (input.family === "workflow" ? "workflow" : "knowledge graph"),
      tokenMode: "Light",
      showGrid: true,
      detail: "overview",
      zoom: 1,
      pan: { x: 0, y: 0 },
    },
    nodes: input.nodes,
    edges: input.edges,
    origin: input.origin,
    updatedAt: new Date().toISOString(),
  };
}

export function blankGraphDocument(
  family: EditableGraphDocument["family"] = "knowledge-graph",
  template: GraphTemplate = {
    id: "blank.graph",
    label: "Blank graph",
    family,
    sourceId: "figma.visual-logic-primitives",
    visualLanguage: family === "workflow" ? "workflow" : "knowledge graph",
    mappingStatus: "approved",
  },
): EditableGraphDocument {
  return makeDocument({ title: "Untitled graph", family, template, nodes: [], edges: [], origin: { kind: "blank" } });
}

export function graphDocumentFromPlan(plan: DiagramPlan, template?: GraphTemplate): EditableGraphDocument {
  const placements = plan.placements;
  const nodes = placements
    .filter((placement) => placement.content.from === undefined)
    .map((placement, index, all) => ({
      id: placement.id,
      label: placement.content.label ?? placement.id,
      typeTag: placement.content.typeTag ?? placement.content.role ?? "",
      properties: placement.content.properties ?? [],
      componentId: placement.componentId,
      axes: axesForPlacement(placement),
      position: spreadPosition(index, all.length, plan.family),
      hueIndex: placement.content.hueIndex,
      role: placement.content.role,
      focal: placement.content.focal,
    }));
  const edges = placements
    .filter((placement) => placement.content.from !== undefined || placement.content.to !== undefined)
    .map((placement) => ({
      id: placement.id,
      source: placement.content.from ?? "",
      target: placement.content.to ?? "",
      label: placement.content.label ?? "",
      componentId: placement.componentId,
      axes: axesForPlacement(placement),
      hueIndex: placement.content.hueIndex,
    }));
  return makeDocument({
    title: plan.title || "Generated graph",
    family: plan.family,
    template: template ?? {
      id: "generated.plan",
      label: "Generated plan",
      family: plan.family,
      sourceId: "figma.visual-logic-primitives",
      visualLanguage: plan.family === "workflow" ? "workflow" : "knowledge graph",
      mappingStatus: "approved",
    },
    nodes,
    edges,
    origin: {
      kind: "generated",
      sourceFingerprint: fingerprint({ nodes, edges }),
      planTitle: plan.title,
    },
  });
}

export function graphDocumentFromComposition(composition: Composition): EditableGraphDocument {
  if (!hasExplicitGraphMapping(composition)) {
    throw new Error(`Composition "${composition.id}" does not define a complete explicit graph mapping.`);
  }
  const graphMapping = COMPOSITION_GRAPH_MAPPINGS[composition.id];
  const candidates = graphMapping.nodeRoles.map((role) => composition.slots.find((slot) => slot.role === role)!);
  const nodes = candidates.map((slot, index) => ({
    id: `${composition.id}-${slot.role}`,
    label: graphMapping.nodeRoles.length === 1 ? composition.label : slot.role.replace(/[-_]/g, " "),
    typeTag: slot.componentId.split(".").pop() ?? "node",
    properties: [],
    componentId: slot.componentId,
    axes: { ...DEFAULT_AXES, ...slot.axes },
    role: slot.role,
    position: {
      x: Math.max(70, Math.min(GRAPH_CANVAS.width - 70, slot.position.x * GRAPH_CANVAS.width)),
      y: Math.max(70, Math.min(GRAPH_CANVAS.height - 70, slot.position.y * GRAPH_CANVAS.height)),
    },
  }));
  const nodesByRole = new Map(candidates.map((slot, index) => [slot.role, nodes[index]]));
  const edges = graphMapping.relationships.map((mapping, index) => {
      const slot = composition.slots.find((candidate) => candidate.role === mapping.edgeRole)!;
      return {
        id: `${composition.id}-edge-${index + 1}`,
        source: nodesByRole.get(mapping.sourceRole)!.id,
        target: nodesByRole.get(mapping.targetRole)!.id,
        label: slot.role.replace(/[-_]/g, " "),
        componentId: slot.componentId,
        axes: { ...DEFAULT_AXES, ...slot.axes, a5: 1 },
      };
    });
  return makeDocument({
    title: composition.label,
    family: composition.family === "knowledge-graph" ? "knowledge-graph" : "workflow",
    template: templateForComposition(composition),
    nodes,
    edges,
    origin: { kind: "template" },
  });
}

export function graphDocumentFingerprint(document: Pick<EditableGraphDocument, "nodes" | "edges">) {
  return fingerprint({ nodes: document.nodes, edges: document.edges });
}

export function isGraphDocumentDiverged(document: EditableGraphDocument) {
  return document.origin.kind === "generated" &&
    !!document.origin.sourceFingerprint &&
    document.origin.sourceFingerprint !== graphDocumentFingerprint(document);
}

export function validateGraphDocument(
  document: EditableGraphDocument,
  components: LibraryComponent[] = [],
): GraphValidationReport {
  const issues: GraphValidationIssue[] = [];
  const ids = new Set<string>();
  document.nodes.forEach((node) => {
    if (ids.has(node.id)) issues.push({ severity: "error", elementId: node.id, message: "Node IDs must be unique." });
    ids.add(node.id);
    if (!node.label.trim()) issues.push({ severity: "error", elementId: node.id, message: "Every node needs a label." });
    if (!components.some((component) => component.id === node.componentId)) {
      issues.push({ severity: "warning", elementId: node.id, message: `Visual "${node.componentId}" is unavailable; a fallback shape is shown.` });
    }
  });
  const edgeIds = new Set<string>();
  document.edges.forEach((edge) => {
    if (edgeIds.has(edge.id)) issues.push({ severity: "error", elementId: edge.id, message: "Edge IDs must be unique." });
    edgeIds.add(edge.id);
    if (!edge.source || !edge.target) issues.push({ severity: "error", elementId: edge.id, message: "Choose both a source and target for this connection." });
    if (edge.source === edge.target && edge.source) issues.push({ severity: "error", elementId: edge.id, message: "A connection must join two different nodes." });
    if (edge.source && !ids.has(edge.source)) issues.push({ severity: "error", elementId: edge.id, message: `Source node "${edge.source}" does not exist.` });
    if (edge.target && !ids.has(edge.target)) issues.push({ severity: "error", elementId: edge.id, message: `Target node "${edge.target}" does not exist.` });
    if (!edge.label.trim()) issues.push({ severity: "warning", elementId: edge.id, message: "This connection has no relationship label." });
    if (!components.some((component) => component.id === edge.componentId)) {
      issues.push({ severity: "warning", elementId: edge.id, message: `Visual "${edge.componentId}" is unavailable; a fallback line is shown.` });
    }
  });
  if (document.nodes.length === 0) issues.push({ severity: "warning", message: "Add a node to start building this graph." });
  return { valid: issues.every((issue) => issue.severity !== "error"), issues };
}

export function parseStoredGraphDocument(value: string | null): EditableGraphDocument | null {
  if (!value) return null;
  try {
    const parsed = EditableGraphDocumentSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseStoredWorkspaceCollection(value: string | null): GraphWorkspaceCollection | null {
  if (!value) return null;
  try {
    const parsed = GraphWorkspaceCollectionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function recoverStoredWorkspaceCollection(value: string | null): GraphWorkspaceCollectionRecovery {
  const empty: GraphWorkspaceCollection = { version: 1, workspaces: [], activeId: null };
  if (!value) return { collection: empty, rejectedCount: 0, malformed: false };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || !("workspaces" in parsed) || !Array.isArray(parsed.workspaces)) {
      return { collection: empty, rejectedCount: 0, malformed: true };
    }
    const envelope = parsed as { version?: unknown; activeId?: unknown; workspaces: unknown[] };
    const workspaces = envelope.workspaces.flatMap((workspace) => {
      const result = EditableGraphDocumentSchema.safeParse(workspace);
      return result.success ? [result.data] : [];
    });
    const rejectedCount = envelope.workspaces.length - workspaces.length;
    const requestedActiveId = typeof envelope.activeId === "string" ? envelope.activeId : null;
    return {
      collection: {
        version: 1,
        workspaces,
        activeId: workspaces.some((workspace) => workspace.id === requestedActiveId) ? requestedActiveId : null,
      },
      rejectedCount,
      malformed: envelope.version !== 1 || rejectedCount > 0,
    };
  } catch {
    return { collection: empty, rejectedCount: 0, malformed: true };
  }
}