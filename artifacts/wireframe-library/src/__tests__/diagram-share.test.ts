import { describe, expect, it } from "vitest";

import {
  decodeDiagramSnapshot,
  encodeDiagramSnapshot,
  MAX_DIAGRAM_SNAPSHOT_LENGTH,
} from "@/lib/diagram-share";
import type { PlanResult } from "@/lib/diagram-types";

const RESULT: PlanResult = {
  plan: {
    need: "map who works where",
    title: "Team map",
    family: "knowledge-graph",
    axisMeanings: { a2: "team" },
    tier1Draft: [
      { id: "person", componentId: "prim.node.generic", label: "Person" },
      { id: "company", componentId: "prim.node.generic", label: "Company" },
      { id: "works-at", componentId: "prim.edge.generic", from: "person", to: "company" },
    ],
    placements: [
      {
        id: "person",
        componentId: "prim.node.generic",
        axes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 3 },
        content: { label: "Person", properties: ["name"], focal: true },
      },
      {
        id: "company",
        componentId: "prim.node.generic",
        axes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 3 },
        content: { label: "Company", properties: ["name"] },
      },
      {
        id: "works-at",
        componentId: "prim.edge.generic",
        axes: { a1: 1, a2: 1, a3: 2, a4: 1, a5: 2 },
        content: { from: "person", to: "company", label: "works at" },
      },
    ],
    notes: ["Refined to emphasize the person node."],
  },
  validation: {
    valid: true,
    issues: [],
  },
};

describe("diagram share snapshots", () => {
  it("round-trips the complete displayed result, including refined plan state", () => {
    const restored = decodeDiagramSnapshot(encodeDiagramSnapshot(RESULT));

    expect(restored).toEqual(RESULT);
    expect(restored?.plan.notes).toContain("Refined to emphasize the person node.");
    expect(restored?.plan.placements[0].content.focal).toBe(true);
  });

  it("rejects malformed and unsupported snapshots", () => {
    expect(decodeDiagramSnapshot("not-json")).toBeNull();
    expect(
      decodeDiagramSnapshot(JSON.stringify({ version: 2, result: RESULT })),
    ).toBeNull();
    expect(
      decodeDiagramSnapshot(JSON.stringify({ version: 1, result: { plan: {} } })),
    ).toBeNull();
  });

  it("rejects snapshots that exceed the safe URL payload limit", () => {
    expect(decodeDiagramSnapshot("x".repeat(MAX_DIAGRAM_SNAPSHOT_LENGTH + 1))).toBeNull();
  });
});