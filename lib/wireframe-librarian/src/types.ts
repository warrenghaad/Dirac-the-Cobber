/**
 * Types for the Tiered Wireframe Library librarian.
 * Mirrors docs/wireframe-library/SPEC.md + manifest.json (v0.1.0).
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

// ---------------------------------------------------------------------------
// Atomic Design composition model
// ---------------------------------------------------------------------------

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
  slots: CompositionSlot[];
}

// ---------------------------------------------------------------------------

export interface Manifest {
  name: string;
  version: string;
  tokens: ManifestTokens;
  components: ManifestComponent[];
  /** Atomic Design compositions (Molecules, Organisms, Templates). */
  compositions?: Composition[];
}

export type DiagramFamily = "knowledge-graph" | "workflow";

/** Content payload carried by a placement (renderer-agnostic). */
export interface PlacementContent {
  label?: string;
  typeTag?: string;
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
  kind?: "entity" | "class" | "literal" | "task" | "start" | "end" | "decision" | "parallel" | "data";
  focal?: boolean;
  properties?: string[];
  parent?: string;
}

export interface StructuredEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  kind?: "relation" | "property" | "subclass" | "flow" | "conditional";
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
