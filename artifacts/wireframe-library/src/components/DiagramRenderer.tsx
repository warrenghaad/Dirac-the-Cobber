/**
 * Self-contained SVG renderer for a DiagramPlan.
 * Uses design tokens from lib/library.ts (same source as manifest.json).
 */
import type { DiagramPlan, Placement } from "@/lib/diagram-types";
import { INK, PAPER, PALETTE, SIZE_WIDTHS, ASPECT, tint } from "@/lib/library";

type Pt = { x: number; y: number; w: number; h: number };

const STROKE_W = [1, 2, 2, 3, 4]; // a4 level → px
const DASHED = "6 4";

function isEdge(p: Placement) {
  return p.content.from !== undefined && p.content.to !== undefined;
}

function nodeSize(p: Placement) {
  const w = SIZE_WIDTHS[p.axes.a3] ?? SIZE_WIDTHS[2];
  return { w, h: Math.round(w * ASPECT) };
}

function layout(plan: DiagramPlan): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const nodes = plan.placements.filter(
    (p) =>
      !isEdge(p) &&
      !p.componentId.includes("group") &&
      !p.componentId.includes("lane"),
  );

  if (plan.family === "workflow") {
    let x = 60;
    for (const n of nodes) {
      const { w, h } = nodeSize(n);
      pos.set(n.id, { x, y: 220 - h / 2, w, h });
      x += w + 90;
    }
    return pos;
  }

  // Knowledge graph: classes top, entities middle (by role), literals bottom.
  const classes = nodes.filter((n) => n.componentId === "kg.class");
  const literals = nodes.filter((n) => n.componentId === "kg.literal");
  const entities = nodes.filter((n) => !classes.includes(n) && !literals.includes(n));
  const roles = [...new Set(entities.map((n) => n.content.role ?? ""))];
  let x = 60;
  const roleSpan: Record<string, { min: number; max: number }> = {};
  for (const role of roles) {
    const span = { min: x, max: x };
    entities
      .filter((e) => (e.content.role ?? "") === role)
      .forEach((n, i) => {
        const { w, h } = nodeSize(n);
        pos.set(n.id, { x, y: (i % 2 === 0 ? 250 : 400) - h / 2, w, h });
        span.max = x + w;
        x += w + 70;
      });
    roleSpan[role] = span;
    x += 50;
  }
  for (const c of classes) {
    const { w, h } = nodeSize(c);
    const span = roleSpan[c.content.role ?? ""];
    const cx = span ? (span.min + span.max) / 2 : x + w / 2;
    pos.set(c.id, { x: cx - w / 2, y: 50, w, h });
    if (!span) x += w + 70;
  }
  let lx = 120;
  for (const l of literals) {
    const { w, h } = nodeSize(l);
    pos.set(l.id, { x: lx, y: 430, w, h });
    lx += w + 70;
  }
  return pos;
}

function center(pt: Pt) {
  return { cx: pt.x + pt.w / 2, cy: pt.y + pt.h / 2 };
}

function NodeShape({ p, pt }: { p: Placement; pt: Pt }) {
  const hue =
    p.content.hueIndex !== undefined ? PALETTE[p.content.hueIndex] : undefined;
  const stroke = hue ?? INK;
  const fill = hue
    ? tint(hue, p.content.focal ? 0.25 : 0.15)
    : "white";
  const sw = STROKE_W[p.axes.a4] ?? 1;
  const { cx, cy } = center(pt);
  const common = { fill, stroke, strokeWidth: sw } as const;
  const shape = (() => {
    switch (p.componentId) {
      case "kg.class":
        return <rect x={pt.x} y={pt.y} width={pt.w} height={pt.h} {...common} />;
      case "kg.literal":
        return (
          <ellipse cx={cx} cy={cy} rx={pt.w / 2} ry={pt.h / 2} {...common} />
        );
      case "wf.start-end":
        return (
          <rect
            x={pt.x}
            y={pt.y}
            width={pt.w}
            height={pt.h}
            rx={pt.h / 2}
            {...common}
          />
        );
      case "wf.decision":
        return (
          <polygon
            points={`${cx},${pt.y} ${pt.x + pt.w},${cy} ${cx},${pt.y + pt.h} ${pt.x},${cy}`}
            {...common}
          />
        );
      case "wf.parallel": {
        const q = pt.w * 0.22;
        return (
          <polygon
            points={`${pt.x + q},${pt.y} ${pt.x + pt.w - q},${pt.y} ${pt.x + pt.w},${cy} ${pt.x + pt.w - q},${pt.y + pt.h} ${pt.x + q},${pt.y + pt.h} ${pt.x},${cy}`}
            {...common}
          />
        );
      }
      case "wf.data": {
        const s = pt.w * 0.15;
        return (
          <polygon
            points={`${pt.x + s},${pt.y} ${pt.x + pt.w},${pt.y} ${pt.x + pt.w - s},${pt.y + pt.h} ${pt.x},${pt.y + pt.h}`}
            {...common}
          />
        );
      }
      default:
        return (
          <rect x={pt.x} y={pt.y} width={pt.w} height={pt.h} rx={10} {...common} />
        );
    }
  })();

  const showTag = p.axes.a5 >= 2 && p.content.typeTag;
  return (
    <g>
      {shape}
      {p.axes.a5 >= 1 && (
        <text
          x={cx}
          y={showTag ? cy : cy + 4}
          textAnchor="middle"
          fontSize={12.5}
          fontWeight={600}
          fill={INK}
          fontFamily="Inter, sans-serif"
        >
          {p.content.label}
        </text>
      )}
      {showTag && (
        <text
          x={cx}
          y={cy + 15}
          textAnchor="middle"
          fontSize={10}
          fill="#6B7280"
          fontFamily="Inter, sans-serif"
        >
          {p.content.typeTag}
        </text>
      )}
      {p.axes.a5 >= 3 &&
        (p.content.properties ?? []).map((prop, i) => (
          <text
            key={prop}
            x={cx}
            y={pt.y + pt.h + 14 + i * 13}
            textAnchor="middle"
            fontSize={9.5}
            fill="#6B7280"
            fontFamily="Inter, sans-serif"
          >
            {prop}
          </text>
        ))}
    </g>
  );
}

function EdgeShape({
  p,
  pos,
}: {
  p: Placement;
  pos: Map<string, Pt>;
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
    p.content.hueIndex !== undefined ? PALETTE[p.content.hueIndex] : INK;
  const dashed =
    p.componentId === "kg.subclass-edge" || p.axes.a4 >= 2;
  const sw = STROKE_W[p.axes.a4] ?? 1;
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
        strokeDasharray={dashed ? DASHED : undefined}
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
            fill={PAPER}
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

export function DiagramRenderer({ plan }: { plan: DiagramPlan }) {
  const pos = layout(plan);
  const pts = [...pos.values()];
  const width = Math.max(720, ...pts.map((p) => p.x + p.w + 80));
  const height = Math.max(360, ...pts.map((p) => p.y + p.h + 80));
  const edges = plan.placements.filter(isEdge);
  const nodes = plan.placements.filter((p) => !isEdge(p) && pos.has(p.id));
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ background: PAPER, borderRadius: 12 }}
    >
      {edges.map((e) => (
        <EdgeShape key={e.id} p={e} pos={pos} />
      ))}
      {nodes.map((n) => (
        <NodeShape key={n.id} p={n} pt={pos.get(n.id)!} />
      ))}
    </svg>
  );
}

export default DiagramRenderer;
