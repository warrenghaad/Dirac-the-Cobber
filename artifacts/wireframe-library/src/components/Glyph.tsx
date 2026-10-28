import {
  STATIC_TOKENS,
  dashOf,
  sizeOf,
  strokeOf,
  tint,
  type AxisCoords,
  type DesignTokens,
  type LibraryComponent,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";

// Renders any manifest component at arbitrary axis coordinates.
// A1 governs silhouette fidelity: 0 = generic rounded-rect, 1 = role family, >=2 = category shape.
// A2 governs color: 0 mono ink, 1 accent, >=2 hue from the categorical palette, >=3 deeper tint.
// A3 = size step, A4 = stroke weight/dash, A5 = label density.

type GlyphProps = {
  component: LibraryComponent;
  axes: AxisCoords;
  hueIndex?: number;
  name?: string;
  typeTag?: string;
  props?: string[];
  scale?: number;
};

function resolveShape(c: LibraryComponent, a1: number): string {
  // Edge / line shapes — always render as their specific edge type
  if (c.shape === "line-plain") return "line-plain";
  if (c.shape === "arrow-bidir") return "arrow-bidir";
  if (c.shape.startsWith("arrow") || c.shape.startsWith("line")) return "arrow";
  if (a1 <= 0) return c.shape === "dot" ? "dot" : "rounded-rect";
  if (a1 === 1) {
    if (c.shape === "ellipse") return "ellipse";
    if (c.shape === "pill") return "pill";
    if (c.shape === "diamond") return "diamond";
    if (c.shape === "hexagon") return "hexagon";
    if (c.shape === "parallelogram") return "parallelogram";
    if (c.shape === "cylinder") return "cylinder";
    if (c.shape.includes("container") || c.shape === "rect-outline" || c.shape === "rectangle") return "rectangle";
    if (c.shape === "dot") return "dot";
    return "rounded-rect";
  }
  return c.shape === "rect-outline" ? "rectangle" : c.shape.replace("container-header", "container");
}

export function glyphColors(
  axes: AxisCoords,
  hueIndex: number,
  tokens: DesignTokens = STATIC_TOKENS,
) {
  if (axes.a2 <= 0) return { stroke: tokens.ink, fill: "white" };
  const subtleTint = tokens.tintSteps.at(-1) ?? 0;
  if (axes.a2 === 1) {
    return { stroke: tokens.accent, fill: tint(tokens.accent, subtleTint) };
  }
  const hue = tokens.palette[hueIndex % tokens.palette.length];
  const strongerTint = tokens.tintSteps.at(-2) ?? subtleTint;
  return { stroke: hue, fill: tint(hue, axes.a2 >= 3 ? strongerTint : subtleTint) };
}

export function Glyph({ component, axes, hueIndex = 0, name, typeTag, props, scale = 1 }: GlyphProps) {
  const { manifest } = useManifest();
  const tokens = manifest.tokens;
  const { w, h } = sizeOf(axes.a3, tokens);
  const W = w * scale;
  const H = h * scale;
  const sw = strokeOf(axes.a4, tokens);
  const dashy = component.shape.includes("dash") || component.id.includes("subclass");
  const dash = axes.a4 >= 2 && dashy ? dashOf("dashed", tokens) : undefined;
  const { stroke, fill } = glyphColors(axes, hueIndex, tokens);
  const shape = resolveShape(component, axes.a1);
  const label = axes.a5 >= 1 ? (name ?? component.id.split(".").pop()) : undefined;
  const tag = axes.a5 >= 2 ? (typeTag ?? component.family) : undefined;
  const propLines = axes.a5 >= 3 ? (props ?? ["name: string", "type: node"]).slice(0, axes.a5 >= 4 ? 4 : 2) : [];

  if (shape === "arrow" || shape === "line-plain" || shape === "arrow-bidir") {
    const len = W + 40;
     const edgeColor = axes.a2 > 0 ? stroke : tokens.ink;
    const markerId = `m-${component.id.replace(/\W/g, "")}-${axes.a4}-${hueIndex}-${axes.a2}`;
    const markerStartId = `ms-${component.id.replace(/\W/g, "")}-${axes.a4}-${hueIndex}-${axes.a2}`;
    const dashArr =
      axes.a4 >= 2 && dashy
        ? dashOf("dashed", tokens)
        : axes.a4 >= 3
          ? dashOf("dashed", tokens)
          : undefined;
    return (
      <svg width={len} height={40} viewBox={`0 0 ${len} 40`}>
        <defs>
          <marker id={markerId} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 z" fill={edgeColor} />
          </marker>
          {shape === "arrow-bidir" && (
            <marker id={markerStartId} markerWidth="9" markerHeight="9" refX="1" refY="4.5" orient="auto">
              <path d="M9,0 L0,4.5 L9,9 z" fill={edgeColor} />
            </marker>
          )}
        </defs>
        {label && (
          <text x={len / 2} y={12} textAnchor="middle" fontSize={10} fontStyle="italic" fill="#6B7280">
            {label}
          </text>
        )}
        <line
          x1={shape === "arrow-bidir" ? 14 : 2} y1={26}
          x2={shape === "line-plain" ? len - 2 : len - 12} y2={26}
          stroke={edgeColor} strokeWidth={sw} strokeDasharray={dashArr}
          markerEnd={shape !== "line-plain" ? `url(#${markerId})` : undefined}
          markerStart={shape === "arrow-bidir" ? `url(#${markerStartId})` : undefined}
        />
      </svg>
    );
  }

  if (shape === "dot") {
    return (
      <svg width={W + 4} height={H + 4} viewBox={`-2 -2 ${W + 4} ${H + 4}`}>
         <circle cx={W / 2} cy={H / 2} r={5 + axes.a3} fill={axes.a2 > 0 ? stroke : tokens.ink} />
      </svg>
    );
  }

  const cx = W / 2;
  const cy = H / 2;
  const common = { fill: shape === "container" ? "transparent" : fill, stroke, strokeWidth: sw, strokeDasharray: dash } as const;
  const extraH = propLines.length * 12;
  const totH = H + extraH;

  return (
    <svg width={W + 6} height={totH + 6} viewBox={`-3 -3 ${W + 6} ${totH + 6}`}>
      {shape === "rounded-rect" && <rect width={W} height={totH} rx={8 * scale} {...common} />}
      {(shape === "rectangle" || shape === "container") && <rect width={W} height={totH} {...common} />}
      {shape === "ellipse" && <ellipse cx={cx} cy={totH / 2} rx={cx} ry={totH / 2} {...common} />}
      {shape === "pill" && <rect width={W} height={totH} rx={totH / 2} {...common} />}
      {shape === "diamond" && <polygon points={`${cx},0 ${W},${totH / 2} ${cx},${totH} 0,${totH / 2}`} {...common} />}
      {shape === "hexagon" && (
        <polygon points={`${W * 0.2},0 ${W * 0.8},0 ${W},${totH / 2} ${W * 0.8},${totH} ${W * 0.2},${totH} 0,${totH / 2}`} {...common} />
      )}
      {shape === "parallelogram" && <polygon points={`${W * 0.18},0 ${W},0 ${W * 0.82},${totH} 0,${totH}`} {...common} />}
      {shape === "cylinder" && (() => {
        const ry = Math.max(6, totH * 0.14);
        return (
          <g>
            <rect x={0} y={ry} width={W} height={totH - ry} {...common} />
            <ellipse cx={cx} cy={ry} rx={cx} ry={ry} {...common} />
            <ellipse cx={cx} cy={totH} rx={cx} ry={ry} fill={common.fill} stroke={common.stroke} strokeWidth={common.strokeWidth} />
          </g>
        );
      })()}
      {label && (
         <text x={cx} y={propLines.length ? 16 : tag ? cy - 2 : cy + 4} textAnchor="middle" fontSize={Math.max(10, 12 * scale)} fontWeight={600} fill={tokens.ink}>
          {label}
        </text>
      )}
      {tag && !propLines.length && (
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="#6B7280">
          {tag}
        </text>
      )}
      {tag && propLines.length > 0 && (
        <text x={cx} y={28} textAnchor="middle" fontSize={9} fill="#6B7280">
          {tag}
        </text>
      )}
      {propLines.map((p, i) => (
        <text key={p} x={cx} y={42 + i * 11} textAnchor="middle" fontSize={8.5} fill="#6B7280">
          {p}
        </text>
      ))}
    </svg>
  );
}
