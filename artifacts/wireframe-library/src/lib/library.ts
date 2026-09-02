// The fallback retains renderer-critical primitives only. The full catalog is
// deliberately loaded from the canonical API so the browser does not bundle
// tens of thousands of Figma nodes into its initial JavaScript payload.
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
  fileKey?: string | null;
  sourceMetadata?: SourceMetadata;
  capabilityTags?: string[];
  mappingStatus?: "approved" | "reference-fallback" | "pending-review";
};

export type Axis = { id: keyof AxisCoords; name: string; levels: string[] };

export type CompositionSlot = {
  componentId: string;
  role: string;
  position: { x: number; y: number };
  axes?: Partial<AxisCoords>;
};

export type Composition = {
  id: string;
  atomicLevel: string;
  label: string;
  description: string;
  family: string;
  slots: CompositionSlot[];
  sourceMetadata?: SourceMetadata;
  capabilityTags?: string[];
};

export type SourceMetadata = {
  sourceId?: string;
  fileKey?: string;
  url?: string;
  localPath?: string;
  nodeId?: string;
  page?: string;
  variant?: string;
  properties?: Record<string, string | number | boolean | null>;
  tokenMode?: string;
  previewRef?: string;
};

export type SourceAsset = {
  id: string;
  sourceId: string;
  label: string;
  assetType: string;
  capabilityClasses: string[];
  capabilityTags?: string[];
  mappingStatus: "approved" | "unmatched" | "excluded" | "blocked" | "reference-only";
  tokenCount?: number;
  previewRef?: string;
  provenance: SourceMetadata;
};

export type SourceCoverage = {
  total: number;
  approved: number;
  unmatched: number;
  excluded: number;
  blocked: number;
};

export type SourceCatalogEntry = {
  id: string;
  label: string;
  kind: string;
  status: "accessible" | "local-only" | "pending-registration" | "inaccessible" | "reference-only";
  accessNote?: string;
  provenance: SourceMetadata;
  capabilityClasses: string[];
  visualLanguages?: string[];
  tokenModes?: string[];
  inventory: { pages: string[]; components: number; componentSets: number; variants: number; tokenBundles: number };
  coverage: SourceCoverage;
};

export type SourceTemplateCandidate = {
  id: string;
  label: string;
  sourceId: string;
  capabilityClasses: string[];
  capabilityTags?: string[];
  mappingStatus: SourceAsset["mappingStatus"];
  provenance: SourceMetadata;
};

export type SourceMapping = {
  assetId: string;
  targetType: "component" | "composition" | "token";
  targetId: string;
  status: "approved" | "reference-fallback" | "pending-review";
  rationale: string;
};

export type SourceCatalog = {
  catalogVersion: string;
  capabilityClasses: string[];
  sources: SourceCatalogEntry[];
  assets?: SourceAsset[];
  templateCandidates: SourceTemplateCandidate[];
  mappings?: SourceMapping[];
  coverage: SourceCoverage;
  intakeReport?: {
    generatedAt: string;
    sourcesInspected: number;
    accessFailures: string[];
    unmatchedAssetIds: string[];
    excludedAssetIds: string[];
  };
};

/** Full shape of the wireframe-library manifest. */
export type ManifestData = {
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
  compositions: Composition[];
  sourceCatalog?: SourceCatalog;
};

/**
 * Bundled static copy of the manifest — used as initial/fallback data and for
 * pure token utilities (INK, PAPER, sizeOf, tint, …) that are evaluated at
 * module load time.  For live data prefer the `useManifest()` hook which
 * fetches from GET /api/librarian/manifest.
 */
export const MANIFEST = manifest as unknown as ManifestData;

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

export function componentsByFamily(components: LibraryComponent[], family: string) {
  return components.filter((c) => c.family === family);
}
