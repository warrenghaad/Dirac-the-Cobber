import manifest from "./manifest.json";

export type AxisCoords = { a1: number; a2: number; a3: number; a4: number; a5: number };

export type LibraryComponent = {
  id: string;
  family: string;
  tier: number;
  shape: string;
  axes: AxisCoords;
  maxAxes: AxisCoords;
  figmaNodeId: string | null;
};

export type Axis = { id: keyof AxisCoords; name: string; levels: string[] };

export const MANIFEST = manifest as unknown as {
  name: string;
  version: string;
  tokens: {
    ink: string;
    paper: string;
    accent: string;
    palette: string[];
    tintSteps: number[];
    sizeScale: { widths: number[]; aspect: number; ratio: number };
    strokeScale: number[];
  };
  axes: Axis[];
  tiers: { tier: number; rule: string; profile?: Record<string, unknown> }[];
  librarianRules: { start: string; axisPriority: string[]; constraints: string[] };
  components: LibraryComponent[];
};

export const { ink: INK, paper: PAPER, accent: ACCENT, palette: PALETTE } = MANIFEST.tokens;
export const SIZE_WIDTHS = MANIFEST.tokens.sizeScale.widths;
export const ASPECT = MANIFEST.tokens.sizeScale.aspect;

export const AXIS_IDS = ["a1", "a2", "a3", "a4", "a5"] as const;

export function sizeOf(level: number) {
  const w = SIZE_WIDTHS[level] ?? SIZE_WIDTHS[2];
  return { w, h: Math.round(w * ASPECT) };
}

export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function emphasis(axes: AxisCoords) {
  return axes.a1 + axes.a2 + axes.a3 + axes.a4 + axes.a5;
}

export function effectiveTier(axes: AxisCoords) {
  return Math.max(1, ...AXIS_IDS.map((k) => axes[k]));
}

export function clampAxes(c: LibraryComponent, axes: AxisCoords): AxisCoords {
  const out = { ...axes };
  for (const k of AXIS_IDS) out[k] = Math.min(Math.max(out[k], 0), c.maxAxes[k]);
  return out;
}

export const FAMILIES = [
  { key: "tier1", label: "Tier 1 Primitives" },
  { key: "knowledge-graph", label: "Knowledge Graph" },
  { key: "workflow", label: "Workflow" },
];

export function componentsByFamily(family: string) {
  return MANIFEST.components.filter((c) => c.family === family);
}
