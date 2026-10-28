/**
 * Types for the Tiered Wireframe Library librarian.
 * Mirrors docs/wireframe-library/SPEC.md + manifest.json (v0.2.0).
 */

export interface AxisCoords {
  a1: number; // shape semantics
  a2: number; // color
  a3: number; // size
  a4: number; // stroke & line
  a5: number; // label density
}

export const AXIS_IDS = ["a1", "a2", "a3", "a4", "a5"] as const;
export type AxisId = (typeof AXIS_IDS)[number];

export interface ManifestComponent {
  id: string;

  family: string;

  tier: number;

  shape: string;

  axes: AxisCoords;

  maxAxes: AxisCoords;

  figmaNodeId: string | null;
  /** Visual languages in which this component family is valid. */

  fileKey?: string | null;

  sourceMetadata?: SourceMetadata;

  capabilityTags?: string[];

  mappingStatus?: "approved" | "reference-fallback" | "pending-review";

  visualLanguages?: VisualLanguage[];
  /** Semantic roles this component can represent in those languages. */

  semanticRoles?: string[];
}

export interface SourceMetadata {
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
}

export type SourceCapability =
  | "graph-primitive"
  | "graph-template"
  | "data-surface"
  | "ui-building-block"
  | "reference-only";

export interface SourceCoverage {
  total: number;
  approved: number;
  unmatched: number;
  excluded: number;
  blocked: number;
}

export interface SourceCatalogEntry {
  id: string;
  label: string;
  kind: "figma-design" | "figjam" | "local-fig" | "token-export" | "reference";
  status: "accessible" | "local-only" | "pending-registration" | "inaccessible" | "reference-only";
  accessNote?: string;
  provenance: SourceMetadata;
  capabilityClasses: SourceCapability[];
  visualLanguages?: string[];
  tokenModes?: string[];
  inventory: {
    pages: string[];
    components: number;
    componentSets: number;
    variants: number;
    tokenBundles: number;
  };
  coverage: SourceCoverage;
}

export interface SourceAsset {
  id: string;
  sourceId: string;
  label: string;
  assetType: "page" | "node" | "component" | "component-set" | "variant" | "template" | "token-bundle" | "token-mode" | "reference";
  capabilityClasses: SourceCapability[];
  capabilityTags?: string[];
  provenance: SourceMetadata;
  mappingStatus: "approved" | "unmatched" | "excluded" | "blocked" | "reference-only";
  previewRef?: string;
  tokenCount?: number;
}

export interface SourceTemplateCandidate {
  id: string;
  label: string;
  sourceId: string;
  capabilityClasses: SourceCapability[];
  capabilityTags?: string[];
  mappingStatus: SourceAsset["mappingStatus"];
  provenance: SourceMetadata;
}

export interface SourceMapping {
  assetId: string;
  targetType: "component" | "composition" | "token";
  targetId: string;
  status: "approved" | "reference-fallback" | "pending-review";
  rationale: string;
}

export interface SourceCatalog {
  catalogVersion: string;
  capabilityClasses: SourceCapability[];
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
}

export interface ManifestTokens {
  ink: string;
  paper: string;
  accent: string;
  palette: string[];
  tintSteps: number[];
  sizeScale: { widths: number[]; aspect: number; ratio: number };
  strokeScale: number[];
  dashVocabulary: Record<string, unknown>;
}

export const VISUAL_LANGUAGE_IDS = [
  "knowledge-graph",
  "uml",
  "database",
  "mui-ui",
  "flowchart",
  "workflow",
  "information-architecture",
  "mind-map",
] as const;
export type AtomicLevel = "molecule" | "organism" | "template";

export type CompositionFamily =
  | "tier1"
  | "knowledge-graph"
  | "workflow"
  | "cross-family";

export interface CompositionSlot {
  /** Must reference a valid component id in the same manifest. */
  componentId: string;
  /** Semantic role this slot plays (e.g. "container", "label", "edge"). */
  role: string;
  /** Unit-fraction position relative to a 1×1 bounding box. */
  position: { x: number; y: number };
  /** Optional partial axis overrides; unset axes inherit the component default. */
  axes?: Partial<AxisCoords>;
}

export interface Composition {
  id: string;
  atomicLevel: AtomicLevel;
  label: string;
  description?: string;
  family: CompositionFamily;
  /** Languages this composition may bridge. Cross-family compositions may list more than one. */
  visualLanguages?: VisualLanguage[];
  slots: CompositionSlot[];
  sourceMetadata?: SourceMetadata;
  capabilityTags?: string[];
}

// ---------------------------------------------------------------------------

export interface Manifest {
  name: string;
  version: string;
  tokens: ManifestTokens;
  components: ManifestComponent[];
  visualLanguages?: VisualLanguageDefinition[];
  componentFamilies?: ComponentFamilyDefinition[];
  /** Atomic Design compositions (Molecules, Organisms, Templates). */
  compositions?: Composition[];
  /** Complete source inventory; broader than renderer-ready components. */
  sourceCatalog?: SourceCatalog;
}

export type DiagramFamily = "knowledge-graph" | "workflow";

/** Content payload carried by a placement (renderer-agnostic). */
export interface PlacementContent {
  label?: string;
  typeTag?: string;
  /** Domain class/category used for grouping; distinct from the visual semantic role. */
  className?: string;
  properties?: string[];
  /** Index into tokens.palette; encodes class membership (A2 meaning). */
  hueIndex?: number;
  /** For edges: placement ids of endpoints. */
  from?: string;
  to?: string;
  /** For nodes inside a container/lane. */
  parent?: string;
  /** Semantic role this placement plays (e.g. class name, "task"). */
  role?: string;
  focal?: boolean;
}

export interface Placement {
  id: string;
  componentId: string;
  axes: AxisCoords;
  content: PlacementContent;
}

/** Tier-1 equal-consequence draft placement (structure review checkpoint, SPEC §6.2). */
export interface DraftPlacement {
  id: string;
  componentId: string;
  from?: string;
  to?: string;
  label?: string;
}

export interface DiagramPlan {
  need: string;
  title: string;
  family: DiagramFamily;
  /** The selected visual vocabulary. Always set on plans emitted by buildPlan. */
  visualLanguage?: VisualLanguage;
  /** Optional manifest compositions that explicitly authorize cross-family slots. */
  compositionIds?: string[];
  /** Which meaning each raised axis encodes — used to detect double-encoding. */
  axisMeanings: Partial<Record<AxisId, string>>;
  /** Tier-1 equal-consequence draft (SPEC §6.2 HITL checkpoint). */
  tier1Draft: DraftPlacement[];
  placements: Placement[];
  notes: string[];
}

export interface StructuredNode {
  id: string;
  label: string;
  /** Class / role family name, drives A1 + A2 assignment. */
  className: string;
  kind?:
    | "entity"
    | "class"
    | "literal"
    | "task"
    | "start"
    | "end"
    | "decision"
    | "parallel"
    | "data"
    | "actor"
    | "table"
    | "column"
    | "component"
    | "page"
    | "section"
    | "topic"
    | "process";
  focal?: boolean;
  properties?: string[];
  parent?: string;
}

export interface StructuredEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?:
    | "relation"
    | "property"
    | "subclass"
    | "flow"
    | "conditional"
    | "association"
    | "foreign-key"
    | "contains"
    | "navigation"
    | "branch";
}

export interface StructuredGroup {
  id: string;
  label: string;
  kind?: "group" | "lane";
}

export interface PlanRequest {
  /** Natural-language description of the need, e.g. "map who works where". */
  need: string;
  /** Optional explicit structure; when present the need text is only classified. */
  family?: DiagramFamily;
  /** Explicit language override. When omitted, the librarian infers it. */
  visualLanguage?: VisualLanguage;
  compositionIds?: string[];
  nodes?: StructuredNode[];
  edges?: StructuredEdge[];
  groups?: StructuredGroup[];
  /** "overview" keeps labels terse (A5≤2); "detail" allows key properties (A5=3). */
  view?: "overview" | "detail";
}

export interface ValidationIssue {
  severity: "error" | "warning";
  rule: string;
  message: string;
  placementId?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface VisualLanguageDefinition {
  id: VisualLanguage;
  label: string;
  description: string;
  /** Deterministic terms used when auto-selecting a language. */
  cues: string[];
  /** The legacy layout family retained for existing renderers and promotions. */
  baseFamily: DiagramFamily;
  semanticRoles: string[];
  componentFamilies: string[];
}

export interface ComponentFamilyDefinition {
  id: string;
  label: string;
  visualLanguages: VisualLanguage[];
  semanticRoles: string[];
}

export type VisualLanguage = (typeof VISUAL_LANGUAGE_IDS)[number];
