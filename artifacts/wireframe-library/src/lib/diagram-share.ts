import type { AxisCoords, DiagramPlan, PlanResult, ValidationReport } from "./diagram-types";

const SNAPSHOT_VERSION = 1;
export const MAX_DIAGRAM_SNAPSHOT_LENGTH = 60_000;

type DiagramSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  result: PlanResult;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyStringValues(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isAxisCoords(value: unknown): value is AxisCoords {
  if (!isRecord(value)) return false;
  return ["a1", "a2", "a3", "a4", "a5"].every((axis) => {
    const coordinate = value[axis];
    return typeof coordinate === "number" && Number.isFinite(coordinate);
  });
}

function isDraftPlacement(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.componentId === "string" &&
    (value.from === undefined || typeof value.from === "string") &&
    (value.to === undefined || typeof value.to === "string") &&
    (value.label === undefined || typeof value.label === "string")
  );
}

function isPlacement(value: unknown) {
  if (!isRecord(value) || !isRecord(value.content)) return false;
  const content = value.content;
  return (
    typeof value.id === "string" &&
    typeof value.componentId === "string" &&
    isAxisCoords(value.axes) &&
    (content.label === undefined || typeof content.label === "string") &&
    (content.typeTag === undefined || typeof content.typeTag === "string") &&
    (content.properties === undefined ||
      (Array.isArray(content.properties) && content.properties.every((entry) => typeof entry === "string"))) &&
    (content.hueIndex === undefined || typeof content.hueIndex === "number") &&
    (content.from === undefined || typeof content.from === "string") &&
    (content.to === undefined || typeof content.to === "string") &&
    (content.parent === undefined || typeof content.parent === "string") &&
    (content.role === undefined || typeof content.role === "string") &&
    (content.focal === undefined || typeof content.focal === "boolean")
  );
}

function isDiagramPlan(value: unknown): value is DiagramPlan {
  if (!isRecord(value)) return false;
  return (
    typeof value.need === "string" &&
    typeof value.title === "string" &&
    (value.family === "knowledge-graph" || value.family === "workflow") &&
    hasOnlyStringValues(value.axisMeanings) &&
    Array.isArray(value.tier1Draft) &&
    value.tier1Draft.every(isDraftPlacement) &&
    Array.isArray(value.placements) &&
    value.placements.every(isPlacement) &&
    Array.isArray(value.notes) &&
    value.notes.every((note) => typeof note === "string")
  );
}

function isValidationReport(value: unknown): value is ValidationReport {
  if (!isRecord(value) || typeof value.valid !== "boolean" || !Array.isArray(value.issues)) {
    return false;
  }
  return value.issues.every(
    (issue) =>
      isRecord(issue) &&
      (issue.severity === "error" || issue.severity === "warning") &&
      typeof issue.rule === "string" &&
      typeof issue.message === "string" &&
      (issue.placementId === undefined || typeof issue.placementId === "string"),
  );
}

function isPlanResult(value: unknown): value is PlanResult {
  return isRecord(value) && isDiagramPlan(value.plan) && isValidationReport(value.validation);
}

export function encodeDiagramSnapshot(result: PlanResult) {
  const encoded = JSON.stringify({
    version: SNAPSHOT_VERSION,
    result,
  } satisfies DiagramSnapshot);

  if (encoded.length > MAX_DIAGRAM_SNAPSHOT_LENGTH) {
    throw new Error("This diagram is too large to share as a link.");
  }

  return encoded;
}

export function decodeDiagramSnapshot(encoded: string): PlanResult | null {
  if (!encoded || encoded.length > MAX_DIAGRAM_SNAPSHOT_LENGTH) return null;

  try {
    const snapshot: unknown = JSON.parse(encoded);
    if (
      !isRecord(snapshot) ||
      snapshot.version !== SNAPSHOT_VERSION ||
      !isPlanResult(snapshot.result)
    ) {
      return null;
    }
    return snapshot.result;
  } catch {
    return null;
  }
}