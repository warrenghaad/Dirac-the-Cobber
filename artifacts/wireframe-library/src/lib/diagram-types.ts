/**
 * Local type definitions for DiagramPlan, Placement, and ValidationReport.
 * These mirror the API contract without depending on the api-client-react dist.
 */

export interface AxisCoords {
  a1: number;
  a2: number;
  a3: number;
  a4: number;
  a5: number;
}

export interface PlacementContent {
  label?: string;
  typeTag?: string;
  properties?: string[];
  hueIndex?: number;
  from?: string;
  to?: string;
  parent?: string;
  role?: string;
  focal?: boolean;
}

export interface Placement {
  id: string;
  componentId: string;
  axes: AxisCoords;
  content: PlacementContent;
}

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
  family: "knowledge-graph" | "workflow";
  axisMeanings: Record<string, string>;
  tier1Draft: DraftPlacement[];
  placements: Placement[];
  notes: string[];
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

export interface PlanResult {
  plan: DiagramPlan;
  validation: ValidationReport;
}
