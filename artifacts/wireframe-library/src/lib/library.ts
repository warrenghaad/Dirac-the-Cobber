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
  visualLanguages?: VisualLanguage[];
  semanticRoles?: string[];
};

export type VisualLanguage =
  | "knowledge-graph"
  | "uml"
  | "database"
  | "mui-ui"
  | "flowchart"
  | "workflow"
  | "information-architecture"
  | "mind-map";
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
    dashVocabulary: {
      solid: number[];
      dashed: number[];
      dotted: number[];
      double: string;
    };
  };
  axes: Axis[];
  tiers: { tier: number; rule: string; profile?: Record<string, unknown> }[];
  librarianRules: { start: string; axisPriority: string[]; constraints: string[] };
  visualLanguages: VisualLanguageDefinition[];
  componentFamilies: ComponentFamilyDefinition[];
  components: LibraryComponent[];
  compositions: Composition[];
  sourceCatalog?: SourceCatalog;
};

/**
 * Bundled static copy of the manifest — used as initial/fallback data.
 * Components should pass `useManifest().manifest.tokens` to token-aware
 * utilities so a refreshed API manifest is reflected without a rebuild.
 */
export const MANIFEST = manifest as unknown as ManifestData;

export type DesignTokens = ManifestData["tokens"];

/** Static token defaults retained for non-React callers and the loading state. */
export const STATIC_TOKENS = MANIFEST.tokens;

export const { ink: INK, paper: PAPER, accent: ACCENT, palette: PALETTE } = STATIC_TOKENS;
export const SIZE_WIDTHS = STATIC_TOKENS.sizeScale.widths;
export const ASPECT = STATIC_TOKENS.sizeScale.aspect;

export const AXIS_IDS = ["a1", "a2", "a3", "a4", "a5"] as const;

export function sizeOf(level: number, tokens: DesignTokens = STATIC_TOKENS) {
  const widths = tokens.sizeScale.widths;
  const w = widths[level] ?? widths[2];
  return { w, h: Math.round(w * tokens.sizeScale.aspect) };
}

export function strokeOf(level: number, tokens: DesignTokens = STATIC_TOKENS) {
  return tokens.strokeScale[level] ?? tokens.strokeScale.at(-1);
}

export function dashOf(
  kind: "solid" | "dashed" | "dotted",
  tokens: DesignTokens = STATIC_TOKENS,
) {
  const pattern = tokens.dashVocabulary[kind];
  return pattern.length > 0 ? pattern.join(" ") : undefined;
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

export type VisualLanguageDefinition = {
  id: VisualLanguage;
  label: string;
  description: string;
  cues: string[];
  baseFamily: "knowledge-graph" | "workflow";
  semanticRoles: string[];
  componentFamilies: string[];
};

export type ComponentFamilyDefinition = {
  id: string;
  label: string;
  visualLanguages: VisualLanguage[];
  semanticRoles: string[];
};
