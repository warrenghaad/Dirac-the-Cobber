/**
 * Self-contained SVG renderer for a DiagramPlan.
 * Uses design tokens from the live manifest context.
 */
import type { DiagramPlan, Placement } from "@workspace/api-client-react";
import type { RefObject } from "react";
import {
  dashOf,
  sizeOf,
  strokeOf,
  type DesignTokens,
  type Composition,
  type LibraryComponent,
} from "@/lib/library";
import { CompositionCanvas } from "@/components/CompositionCanvas";
import { Glyph } from "@/components/Glyph";
import { useManifest } from "@/lib/manifest-context";

type Pt = { x: number; y: number; w: number; h: number };

function isEdge(p: Placement) {
  return p.content.from !== undefined && p.content.to !== undefined;
}

function nodeSize(p: Placement, hasComposition: boolean, tokens: DesignTokens) {
  if (hasComposition) {
    return { w: 240, h: 180 };
  }
  return sizeOf(p.axes.a3, tokens);
}

function layout(
  plan: DiagramPlan,
  compositionsById: ReadonlyMap<string, Composition>,
  tokens: DesignTokens,
): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const nodes = plan.placements.filter(
    (p) =>
      !isEdge(p) &&
      !p.componentId.includes("group") &&
      !p.componentId.includes("lane"),
  );

  if (plan.family === "workflow" || plan.visualLanguage === "flowchart") {
    let x = 60;
    for (const n of nodes) {
      const { w, h } = nodeSize(
        n,
        Boolean(n.content.compositionId && compositionsById.has(n.content.compositionId)),
        tokens,
      );
      pos.set(n.id, { x, y: 220 - h / 2, w, h });
      x += w + 90;
    }
    return pos;
  }

  // Knowledge graph: classes top, entities middle (by role), literals bottom.
  const classes = nodes.filter((n) => n.componentId === "kg.class");
  const literals = nodes.filter((n) => n.componentId === "kg.literal");
  const entities = nodes.filter((n) => !classes.includes(n) && !literals.includes(n));
  const roleOf = (placement: Placement) =>
    placement.content.className ?? placement.content.typeTag ?? placement.content.role ?? "";
  const roles = [...new Set(entities.map(roleOf))];
  let x = 60;
  const roleSpan: Record<string, { min: number; max: number }> = {};
  for (const role of roles) {
    const span = { min: x, max: x };
    entities
      .filter((e) => roleOf(e) === role)
      .forEach((n, i) => {
        const { w, h } = nodeSize(
          n,
          Boolean(n.content.compositionId && compositionsById.has(n.content.compositionId)),
          tokens,
        );
        pos.set(n.id, { x, y: (i % 2 === 0 ? 250 : 400) - h / 2, w, h });
        span.max = x + w;
        x += w + 70;
      });
    roleSpan[role] = span;
    x += 50;
  }
  for (const c of classes) {
    const { w, h } = nodeSize(
      c,
      Boolean(c.content.compositionId && compositionsById.has(c.content.compositionId)),
      tokens,
    );
    const span = roleSpan[roleOf(c)];
    const cx = span ? (span.min + span.max) / 2 : x + w / 2;
    pos.set(c.id, { x: cx - w / 2, y: 50, w, h });
    if (!span) x += w + 70;
  }
  let lx = 120;
  for (const l of literals) {
    const { w, h } = nodeSize(
      l,
      Boolean(l.content.compositionId && compositionsById.has(l.content.compositionId)),
      tokens,
    );
    pos.set(l.id, { x: lx, y: 430, w, h });
    lx += w + 70;
  }
  return pos;
}

function center(pt: Pt) {
  return { cx: pt.x + pt.w / 2, cy: pt.y + pt.h / 2 };
}

function NodeShape({
  p,
  pt,
  component,
  composition,
  tokens,
}: {
  p: Placement;
  pt: Pt;
  component?: LibraryComponent;
  composition?: Composition;
  tokens: DesignTokens;
}) {
  const { cx } = center(pt);
  if (composition) {
    const scale = Math.min(pt.w / 640, pt.h / 480);
    const hueMap = Object.fromEntries(
      composition.slots.map((_, index) => [index, p.content.hueIndex ?? 0]),
    );
    return (
      <g data-composition-id={composition.id}>
        <g transform={`translate(${pt.x}, ${pt.y})`}>
          <CompositionCanvas
            composition={composition}
            instanceId={p.id}
            hueMap={hueMap}
            scale={scale}
          />
        </g>
        {p.axes.a5 >= 1 && (
          <text
            x={cx}
            y={pt.y + pt.h - 8}
            textAnchor="middle"
            fontSize={12.5}
            fontWeight={600}
            fill={tokens.ink}
            fontFamily="Inter, sans-serif"
          >
            {p.content.label}
          </text>
        )}
      </g>
    );
  }

  if (!component) return null;
  return (
    <g transform={`translate(${pt.x}, ${pt.y})`} data-component-id={component.id}>
      <Glyph
        component={component}
        axes={p.axes}
        hueIndex={p.content.hueIndex}
        name={p.content.label}
        typeTag={p.content.typeTag}
        props={p.content.properties}
      />
    </g>
  );
}

function EdgeShape({
  p,
  pos,
  tokens,
}: {
  p: Placement;
  pos: Map<string, Pt>;
  tokens: DesignTokens;
}) {
  const a = pos.get(p.content.from!);
  const b = pos.get(p.content.to!);
  if (!a || !b) return null;
  const ac = center(a), bc = center(b);
  const dx = bc.cx - ac.cx, dy = bc.cy - ac.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ar = Math.min(a.w, a.h) / 2 + 6;
  const br = Math.min(b.w, b.h) / 2 + 14;
  const x1 = ac.cx + (dx / len) * ar, y1 = ac.cy + (dy / len) * ar;
  const x2 = bc.cx - (dx / len) * br, y2 = bc.cy - (dy / len) * br;
  const hue =
    p.content.hueIndex !== undefined ? tokens.palette[p.content.hueIndex] : tokens.ink;
  const dashed =
    p.componentId === "kg.subclass-edge" || p.axes.a4 >= 2;
  const sw = strokeOf(p.axes.a4, tokens);
  const t = 0.38;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const mx = x1 + (x2 - x1) * t + nx * 10;
  const my = y1 + (y2 - y1) * t + ny * 10;
  const markerId = `arrow-${p.id}`;
  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L9,4.5 L0,9 z" fill={hue} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={hue}
        strokeWidth={sw}
        strokeDasharray={dashed ? dashOf("dashed", tokens) : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {p.axes.a5 >= 1 && p.content.label && (
        <>
          <rect
            x={mx - (p.content.label.length * 3.2 + 4)}
            y={my - 17}
            width={p.content.label.length * 6.4 + 8}
            height={14}
            rx={4}
            fill={tokens.paper}
          />
          <text
            x={mx}
            y={my - 6}
            textAnchor="middle"
            fontSize={10}
            fontStyle="italic"
            fill="#4B5563"
            fontFamily="Inter, sans-serif"
          >
            {p.content.label}
          </text>
        </>
      )}
    </g>
  );
}

/** Serializes the rendered diagram and triggers a vector image download. */
export function downloadSVG(
  svgRef: RefObject<SVGSVGElement | null>,
  filename = "diagram.svg",
) {
  const svg = svgRef.current;
  if (!svg) return;

  const svgString = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DiagramRenderer({
  plan,
  svgRef,
}: {
  plan: DiagramPlan;
  svgRef?: RefObject<SVGSVGElement | null>;
}) {
  const { manifest } = useManifest();
  const tokens = manifest.tokens;
  const componentsById = new Map(
    manifest.components.map((component) => [component.id, component]),
  );
  const compositionsById = new Map(
    manifest.compositions.map((composition) => [composition.id, composition]),
  );
  const pos = layout(plan, compositionsById, tokens);
  const pts = [...pos.values()];
  const width = Math.max(720, ...pts.map((p) => p.x + p.w + 80));
  const height = Math.max(360, ...pts.map((p) => p.y + p.h + 80));
  const edges = plan.placements.filter(isEdge);
  const nodes = plan.placements.filter((p) => !isEdge(p) && pos.has(p.id));
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: tokens.paper, borderRadius: 12 }}
    >
      {edges.map((e) => (
        <EdgeShape key={e.id} p={e} pos={pos} tokens={tokens} />
      ))}
      {nodes.map((n) => (
        <NodeShape
          key={n.id}
          p={n}
          pt={pos.get(n.id)!}
          component={componentsById.get(n.componentId)}
          tokens={tokens}
          composition={
            n.content.compositionId
              ? compositionsById.get(n.content.compositionId)
              : undefined
          }
        />
      ))}
    </svg>
  );
}

export default DiagramRenderer;
