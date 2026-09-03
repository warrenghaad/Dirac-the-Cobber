import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/lib/library";
import {
  EditableGraphDocumentSchema,
  graphDocumentFromComposition,
  graphDocumentFromPlan,
  hasExplicitGraphMapping,
  isGraphDocumentDiverged,
  parseStoredGraphDocument,
  validateGraphDocument,
} from "@/lib/graph-document";
import type { DiagramPlan } from "@/lib/diagram-types";

const plan: DiagramPlan = {
  need: "map ownership",
  title: "Ownership map",
  family: "knowledge-graph",
  axisMeanings: { a2: "category" },
  tier1Draft: [],
  notes: [],
  placements: [
    {
      id: "person",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 2 },
      content: { label: "Person", typeTag: "entity", properties: ["name"] },
    },
    {
      id: "team",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 2 },
      content: { label: "Team", typeTag: "entity" },
    },
    {
      id: "member-of",
      componentId: "kg.relation-edge",
      axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 1 },
      content: { label: "member of", from: "person", to: "team" },
    },
  ],
};

describe("editable graph documents", () => {
  it("keeps plan data and explicit layout in a separately validated document", () => {
    const document = graphDocumentFromPlan(plan);

    expect(EditableGraphDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.origin.kind).toBe("generated");
    expect(document.nodes).toHaveLength(2);
    expect(document.edges[0]).toMatchObject({ source: "person", target: "team" });
    expect(document.nodes[0].position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    expect(validateGraphDocument(document, MANIFEST.components).valid).toBe(true);
    expect(isGraphDocumentDiverged(document)).toBe(false);

    document.nodes[0].label = "Employee";
    expect(isGraphDocumentDiverged(document)).toBe(true);
  });

  it("turns an approved composition into editable nodes and relationships", () => {
    const composition = MANIFEST.compositions.find((item) => item.id === "tpl.simple-workflow")!;
    const document = graphDocumentFromComposition(composition);

    expect(document.origin.kind).toBe("template");
    expect(document.template).toMatchObject({ id: composition.id, mappingStatus: "approved" });
    expect(document.nodes.length).toBeGreaterThan(1);
    expect(document.edges.length).toBeGreaterThan(0);
    expect(validateGraphDocument(document, MANIFEST.components).valid).toBe(true);
  });

  it.each([
    ["mol.task-card", ["container"], []],
    ["mol.kg-entity-labeled", ["subject", "literal"], [["subject", "literal"]]],
    ["org.workflow-decision-branch", ["decision", "task-left", "task-right"], [["decision", "task-left"], ["decision", "task-right"]]],
    ["org.kg-class-hierarchy", ["parent-class", "entity-left", "entity-right"], [["entity-left", "parent-class"], ["entity-right", "parent-class"]]],
    ["tpl.simple-workflow", ["start", "task", "decision", "end-yes", "end-no"], [["start", "task"], ["task", "decision"], ["decision", "end-yes"], ["decision", "end-no"]]],
    ["tpl.knowledge-graph-overview", ["class", "entity-1", "entity-2", "entity-3"], [["class", "entity-1"], ["class", "entity-2"], ["class", "entity-3"], ["entity-1", "entity-2"], ["entity-2", "entity-3"]]],
  ])("preserves explicit nodes and endpoint direction for approved baseline %s", (compositionId, expectedNodeRoles, expectedRolePairs) => {
    const composition = MANIFEST.compositions.find((item) => item.id === compositionId)!;
    expect(hasExplicitGraphMapping(composition)).toBe(true);
    const document = graphDocumentFromComposition(composition);
    const roleByNodeId = new Map(document.nodes.map((node) => [node.id, node.role ?? node.id.slice(compositionId.length + 1)]));
    expect(document.nodes.map((node) => node.role)).toEqual(expectedNodeRoles);
    const actualRolePairs = document.edges.map((edge) => [roleByNodeId.get(edge.source), roleByNodeId.get(edge.target)]);
    expect(actualRolePairs).toEqual(expectedRolePairs);
  });

  it("rejects invalid stored data and reports broken connections", () => {
    expect(parseStoredGraphDocument("{bad json")).toBeNull();
    const document = graphDocumentFromPlan(plan);
    document.edges[0].target = "missing";

    const report = validateGraphDocument(document, MANIFEST.components);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.elementId === "member-of" && issue.message.includes("does not exist"))).toBe(true);
  });
});