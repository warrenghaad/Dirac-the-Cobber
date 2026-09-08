/**
 * Unit tests for buildPlan (librarian.ts) and validatePlan (validate.ts).
 *
 * Guarantees: every plan buildPlan emits must pass validatePlan, and
 * validatePlan must flag each named constraint violation.
 */

import { describe, it, expect } from "vitest";
import { buildPlan, classifyFamily, KG_NODE_COMPONENT, KG_EDGE_COMPONENT, WF_NODE_COMPONENT, WF_EDGE_COMPONENT } from "./librarian";
import { validatePlan } from "./validate";
import type { Manifest, DiagramPlan, Placement, PlanRequest, StructuredNode, StructuredEdge } from "./types";

// ---------------------------------------------------------------------------
// Minimal but complete manifest derived from docs/wireframe-library/manifest.json
// ---------------------------------------------------------------------------
const MANIFEST: Manifest = {
  name: "tiered-wireframe-library",
  version: "0.1.0",
  tokens: {
    ink: "#1A1D23",
    paper: "#FBFAF7",
    accent: "#2563EB",
    palette: ["#2563EB", "#D97706", "#059669", "#7C3AED", "#DC2626"],
    tintSteps: [1.0, 0.75, 0.5, 0.3, 0.15],
    sizeScale: { widths: [64, 80, 100, 125, 156], aspect: 0.62, ratio: 1.25 },
    strokeScale: [1, 2, 3, 4],
    dashVocabulary: { solid: [], dashed: [6, 4], dotted: [2, 3], double: "double" },
  },
  components: [
    { id: "prim.node.generic", family: "tier1", tier: 1, shape: "rounded-rect",    axes: { a1: 0, a2: 0, a3: 2, a4: 0, a5: 0 }, maxAxes: { a1: 0, a2: 4, a3: 4, a4: 4, a5: 4 }, figmaNodeId: null },
    { id: "prim.node.round",   family: "tier1", tier: 1, shape: "ellipse",         axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 0 }, maxAxes: { a1: 1, a2: 4, a3: 4, a4: 4, a5: 4 }, figmaNodeId: null },
    { id: "prim.edge.plain",   family: "tier1", tier: 1, shape: "line-arrow",      axes: { a1: 0, a2: 0, a3: 2, a4: 0, a5: 0 }, maxAxes: { a1: 2, a2: 4, a3: 2, a4: 4, a5: 2 }, figmaNodeId: null },
    { id: "prim.container.plain", family: "tier1", tier: 1, shape: "rect-outline", axes: { a1: 0, a2: 0, a3: 2, a4: 0, a5: 0 }, maxAxes: { a1: 1, a2: 2, a3: 4, a4: 2, a5: 2 }, figmaNodeId: null },
    { id: "kg.entity",         family: "knowledge-graph", tier: 2, shape: "rounded-rect",    axes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 3, a2: 4, a3: 4, a4: 3, a5: 4 }, figmaNodeId: null },
    { id: "kg.class",          family: "knowledge-graph", tier: 2, shape: "rectangle",       axes: { a1: 1, a2: 2, a3: 2, a4: 2, a5: 2 }, maxAxes: { a1: 3, a2: 4, a3: 4, a4: 3, a5: 4 }, figmaNodeId: null },
    { id: "kg.literal",        family: "knowledge-graph", tier: 2, shape: "ellipse",         axes: { a1: 1, a2: 0, a3: 1, a4: 0, a5: 1 }, maxAxes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 2 }, figmaNodeId: null },
    { id: "kg.property-edge",  family: "knowledge-graph", tier: 2, shape: "arrow-labeled",   axes: { a1: 2, a2: 0, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 3, a3: 2, a4: 3, a5: 2 }, figmaNodeId: null },
    { id: "kg.relation-edge",  family: "knowledge-graph", tier: 2, shape: "arrow",           axes: { a1: 2, a2: 2, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 4, a3: 2, a4: 4, a5: 2 }, figmaNodeId: null },
    { id: "kg.subclass-edge",  family: "knowledge-graph", tier: 2, shape: "arrow-dashed",    axes: { a1: 2, a2: 0, a3: 2, a4: 2, a5: 0 }, maxAxes: { a1: 2, a2: 2, a3: 2, a4: 3, a5: 1 }, figmaNodeId: null },
    { id: "kg.group",          family: "knowledge-graph", tier: 2, shape: "container",       axes: { a1: 1, a2: 1, a3: 2, a4: 0, a5: 1 }, maxAxes: { a1: 1, a2: 2, a3: 4, a4: 2, a5: 2 }, figmaNodeId: null },
    { id: "wf.start-end",      family: "workflow",        tier: 2, shape: "pill",            axes: { a1: 2, a2: 1, a3: 1, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 2, a3: 2, a4: 2, a5: 1 }, figmaNodeId: null },
    { id: "wf.task",           family: "workflow",        tier: 2, shape: "rounded-rect",    axes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 3, a2: 4, a3: 4, a4: 3, a5: 4 }, figmaNodeId: null },
    { id: "wf.decision",       family: "workflow",        tier: 2, shape: "diamond",         axes: { a1: 2, a2: 1, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 3, a3: 3, a4: 3, a5: 2 }, figmaNodeId: null },
    { id: "wf.parallel",       family: "workflow",        tier: 2, shape: "hexagon",         axes: { a1: 2, a2: 1, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 3, a3: 3, a4: 3, a5: 2 }, figmaNodeId: null },
    { id: "wf.data",           family: "workflow",        tier: 2, shape: "parallelogram",   axes: { a1: 2, a2: 1, a3: 1, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 3, a3: 2, a4: 2, a5: 3 }, figmaNodeId: null },
    { id: "wf.flow-edge",      family: "workflow",        tier: 2, shape: "arrow",           axes: { a1: 2, a2: 0, a3: 2, a4: 1, a5: 0 }, maxAxes: { a1: 2, a2: 2, a3: 2, a4: 4, a5: 1 }, figmaNodeId: null },
    { id: "wf.cond-edge",      family: "workflow",        tier: 2, shape: "arrow-guarded",   axes: { a1: 2, a2: 0, a3: 2, a4: 1, a5: 1 }, maxAxes: { a1: 2, a2: 2, a3: 2, a4: 3, a5: 2 }, figmaNodeId: null },
    { id: "wf.lane",           family: "workflow",        tier: 2, shape: "container-header",axes: { a1: 1, a2: 1, a3: 2, a4: 0, a5: 1 }, maxAxes: { a1: 1, a2: 2, a3: 4, a4: 1, a5: 2 }, figmaNodeId: null },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function build(request: PlanRequest): DiagramPlan {
  return buildPlan(request, MANIFEST);
}

function placementIds(plan: DiagramPlan): Set<string> {
  return new Set(plan.placements.map((p) => p.id));
}

function violationRules(plan: DiagramPlan): string[] {
  return validatePlan(plan, MANIFEST).issues
    .filter((i) => i.severity === "error")
    .map((i) => i.rule);
}

// ---------------------------------------------------------------------------
// classifyFamily
// ---------------------------------------------------------------------------

describe("classifyFamily", () => {
  it("classifies workflow keywords as workflow", () => {
    expect(classifyFamily("show the approval process step by step")).toBe("workflow");
  });

  it("classifies KG keywords as knowledge-graph", () => {
    expect(classifyFamily("map who knows who in the organization")).toBe("knowledge-graph");
  });

  it("defaults to knowledge-graph on a tie / no cues", () => {
    expect(classifyFamily("diagram")).toBe("knowledge-graph");
  });
});

// ---------------------------------------------------------------------------
// buildPlan — knowledge-graph (bare text)
// ---------------------------------------------------------------------------

describe("buildPlan – knowledge-graph from text", () => {
  const plan = build({ need: "map who works where in the company" });

  it("sets family to knowledge-graph", () => {
    expect(plan.family).toBe("knowledge-graph");
  });

  it("emits a tier1Draft with only prim.* components", () => {
    for (const d of plan.tier1Draft) {
      expect(d.componentId).toMatch(/^prim\./);
    }
  });

  it("emits placements with valid component ids", () => {
    const compIds = new Set(MANIFEST.components.map((c) => c.id));
    for (const p of plan.placements) {
      expect(compIds.has(p.componentId)).toBe(true);
    }
  });

  it("assigns a hueIndex only within the palette range", () => {
    for (const p of plan.placements) {
      if (p.content.hueIndex !== undefined) {
        expect(p.content.hueIndex).toBeGreaterThanOrEqual(0);
        expect(p.content.hueIndex).toBeLessThan(MANIFEST.tokens.palette.length);
      }
    }
  });

  it("all axis values are integers in 0..4", () => {
    for (const p of plan.placements) {
      for (const [, v] of Object.entries(p.axes)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(4);
      }
    }
  });

  it("passes validatePlan with no errors", () => {
    const report = validatePlan(plan, MANIFEST);
    expect(report.valid).toBe(true);
    expect(report.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — workflow (bare text)
// ---------------------------------------------------------------------------

describe("buildPlan – workflow from text", () => {
  const plan = build({ need: "approve request, then review, then deploy" });

  it("sets family to workflow", () => {
    expect(plan.family).toBe("workflow");
  });

  it("includes a start and end terminator in placements", () => {
    const ids = placementIds(plan);
    expect(ids.has("start")).toBe(true);
    expect(ids.has("end")).toBe(true);
  });

  it("uses wf.* components for nodes", () => {
    const nodeIds = plan.tier1Draft.map((d) => d.id);
    for (const p of plan.placements) {
      if (!nodeIds.includes(p.id)) continue;
      if (p.componentId.startsWith("prim.")) continue; // tier1Draft uses prim.*
      expect(p.componentId).toMatch(/^wf\./);
    }
  });

  it("passes validatePlan with no errors", () => {
    const report = validatePlan(plan, MANIFEST);
    expect(report.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — structured input (explicit nodes + edges)
// ---------------------------------------------------------------------------

describe("buildPlan – structured knowledge-graph input", () => {
  const plan = build({
    need: "entity relationship diagram",
    family: "knowledge-graph",
    nodes: [
      { id: "u1", label: "User 1", className: "User", kind: "entity" },
      { id: "u2", label: "User 2", className: "User", kind: "entity" },
      { id: "cls-user", label: "User", className: "User", kind: "class" },
    ],
    edges: [
      { id: "e1", from: "u1", to: "cls-user", kind: "subclass" },
      { id: "e2", from: "u2", to: "cls-user", kind: "subclass" },
    ],
  });

  it("emits exactly the supplied node and edge placements", () => {
    const ids = placementIds(plan);
    expect(ids.has("u1")).toBe(true);
    expect(ids.has("u2")).toBe(true);
    expect(ids.has("cls-user")).toBe(true);
    expect(ids.has("e1")).toBe(true);
    expect(ids.has("e2")).toBe(true);
  });

  it("uses correct component for class nodes", () => {
    const cls = plan.placements.find((p) => p.id === "cls-user")!;
    expect(cls.componentId).toBe("kg.class");
  });

  it("uses correct component for subclass edges", () => {
    const edge = plan.placements.find((p) => p.id === "e1")!;
    expect(edge.componentId).toBe("kg.subclass-edge");
  });

  it("passes validatePlan with no errors", () => {
    const report = validatePlan(plan, MANIFEST);
    expect(report.valid).toBe(true);
  });
});

describe("buildPlan – structured workflow input", () => {
  const plan = build({
    need: "checkout flow",
    family: "workflow",
    nodes: [
      { id: "start", label: "Start", className: "terminator", kind: "start" },
      { id: "cart",  label: "Add to Cart", className: "task", kind: "task" },
      { id: "pay",   label: "Pay", className: "task", kind: "task" },
      { id: "end",   label: "End", className: "terminator", kind: "end" },
    ],
    edges: [
      { id: "e1", from: "start", to: "cart", kind: "flow" },
      { id: "e2", from: "cart",  to: "pay",  kind: "flow" },
      { id: "e3", from: "pay",   to: "end",  kind: "flow" },
    ],
  });

  it("uses wf.start-end for start/end nodes", () => {
    const startP = plan.placements.find((p) => p.id === "start")!;
    const endP   = plan.placements.find((p) => p.id === "end")!;
    expect(startP.componentId).toBe("wf.start-end");
    expect(endP.componentId).toBe("wf.start-end");
  });

  it("uses wf.flow-edge for flow edges", () => {
    const edge = plan.placements.find((p) => p.id === "e1")!;
    expect(edge.componentId).toBe("wf.flow-edge");
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — edge case: >5 distinct classes (hue budget overflow)
// ---------------------------------------------------------------------------

describe("buildPlan – >5 classes stays within hue budget", () => {
  const plan = build({
    need: "large ontology",
    family: "knowledge-graph",
    nodes: [
      { id: "a1", label: "A1", className: "Alpha",   kind: "entity" },
      { id: "b1", label: "B1", className: "Beta",    kind: "entity" },
      { id: "c1", label: "C1", className: "Gamma",   kind: "entity" },
      { id: "d1", label: "D1", className: "Delta",   kind: "entity" },
      { id: "e1", label: "E1", className: "Epsilon", kind: "entity" },
      { id: "f1", label: "F1", className: "Zeta",    kind: "entity" }, // 6th — over budget
    ],
    edges: [],
  });

  it("never assigns a hueIndex >= palette length", () => {
    for (const p of plan.placements) {
      if (p.content.hueIndex !== undefined) {
        expect(p.content.hueIndex).toBeLessThan(MANIFEST.tokens.palette.length);
      }
    }
  });

  it("the 6th class gets a2=0 (mono ink) instead of a colour", () => {
    const zeta = plan.placements.find((p) => p.id === "f1")!;
    expect(zeta.axes.a2).toBe(0);
  });

  it("distinct hues used are ≤5", () => {
    const hues = new Set(
      plan.placements
        .map((p) => p.content.hueIndex)
        .filter((h): h is number => h !== undefined),
    );
    expect(hues.size).toBeLessThanOrEqual(5);
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — edge case: focal node
// ---------------------------------------------------------------------------

describe("buildPlan – focal node gets one size step up", () => {
  const basePlan = build({
    need: "concept map",
    family: "knowledge-graph",
    nodes: [
      { id: "n1", label: "Main", className: "Topic", kind: "entity", focal: true },
      { id: "n2", label: "Sub",  className: "Topic", kind: "entity" },
    ],
    edges: [{ from: "n1", to: "n2", kind: "relation" }],
  });

  const focalP    = basePlan.placements.find((p) => p.id === "n1")!;
  const nonFocalP = basePlan.placements.find((p) => p.id === "n2")!;

  it("focal placement has a3 one step higher than non-focal", () => {
    expect(focalP.axes.a3).toBeGreaterThan(nonFocalP.axes.a3);
  });

  it("focal placement a3 does not exceed its component maxAxes.a3", () => {
    const comp = MANIFEST.components.find((c) => c.id === focalP.componentId)!;
    expect(focalP.axes.a3).toBeLessThanOrEqual(comp.maxAxes.a3);
  });

  it("content.focal is true on the focal placement", () => {
    expect(focalP.content.focal).toBe(true);
  });

  it("size spread stays ≤2", () => {
    const levels = basePlan.placements
      .filter((p) => !p.componentId.includes("edge") && !p.componentId.includes("container") && !p.componentId.includes("group"))
      .map((p) => p.axes.a3);
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(spread).toBeLessThanOrEqual(2);
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(basePlan, MANIFEST).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — edge case: detail view adds key properties
// ---------------------------------------------------------------------------

describe("buildPlan – detail view", () => {
  const plan = build({
    need: "employee details",
    family: "knowledge-graph",
    view: "detail",
    nodes: [
      {
        id: "emp1",
        label: "Alice",
        className: "Person",
        kind: "entity",
        properties: ["email", "department", "title"],
      },
    ],
    edges: [],
  });

  const empP = plan.placements.find((p) => p.id === "emp1")!;

  it("a5 is elevated to at least 3 in detail view when properties are present", () => {
    expect(empP.axes.a5).toBeGreaterThanOrEqual(3);
  });

  it("content.properties is populated in detail view", () => {
    expect(empP.content.properties).toEqual(["email", "department", "title"]);
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePlan — constraint violations
// ---------------------------------------------------------------------------

describe("validatePlan – constraint: axis-range", () => {
  it("flags a5=5 as axis-range error", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N1", className: "X", kind: "entity" }],
      edges: [],
    });
    // Mutate to push a5 out of range.
    const p = plan.placements.find((pp) => pp.id === "n1")!;
    p.axes.a5 = 5;
    const rules = violationRules(plan);
    expect(rules).toContain("axis-range");
  });
});

describe("validatePlan – constraint: max-axes", () => {
  it("flags an axis value exceeding the component's maxAxes", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N1", className: "X", kind: "entity" }],
      edges: [],
    });
    // kg.literal has maxAxes.a2=2; push it to 3.
    const p = plan.placements.find((pp) => pp.id === "n1")!;
    // Override to a component with a tight max and violate it.
    p.componentId = "kg.literal";
    p.axes.a2 = 3; // maxAxes.a2 for kg.literal is 2
    const rules = violationRules(plan);
    expect(rules).toContain("max-axes");
  });
});

describe("validatePlan – constraint: hue-budget", () => {
  it("flags >5 distinct hues", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    // Inject 6 fake hue-bearing placements by mutating.
    for (let i = 0; i < 6; i++) {
      plan.placements.push({
        id: `fake-${i}`,
        componentId: "kg.entity",
        axes: { a1: 1, a2: 2, a3: 2, a4: 1, a5: 1 },
        content: { hueIndex: i, label: `Fake ${i}` },
      });
    }
    const rules = violationRules(plan);
    expect(rules).toContain("hue-budget");
  });
});

describe("validatePlan – constraint: size-spread", () => {
  it("flags a spread >2 among node a3 levels", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    // Add two node placements with a3 values 0 and 3 (spread = 3).
    plan.placements.push({
      id: "lo",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 2, a3: 0, a4: 1, a5: 1 },
      content: { label: "Lo" },
    });
    plan.placements.push({
      id: "hi",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 2, a3: 3, a4: 1, a5: 1 },
      content: { label: "Hi" },
    });
    const rules = violationRules(plan);
    expect(rules).toContain("size-spread");
  });
});

describe("validatePlan – constraint: one-hero", () => {
  it("flags two Tier-4 (hero) placements", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    // Two placements each with max axis = 4.
    plan.placements.push({
      id: "hero1",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 4, a3: 2, a4: 1, a5: 1 },
      content: { label: "Hero 1" },
    });
    plan.placements.push({
      id: "hero2",
      componentId: "kg.entity",
      axes: { a1: 1, a2: 4, a3: 2, a4: 1, a5: 1 },
      content: { label: "Hero 2" },
    });
    const rules = violationRules(plan);
    expect(rules).toContain("one-hero");
  });
});

describe("validatePlan – constraint: no-double-encoding", () => {
  it("flags the same meaning on two axes", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    // Assign the same meaning to a1 and a2.
    plan.axisMeanings.a1 = "class membership";
    plan.axisMeanings.a2 = "class membership";
    const rules = violationRules(plan);
    expect(rules).toContain("no-double-encoding");
  });
});

describe("validatePlan – constraint: edge-endpoints", () => {
  it("flags an edge whose endpoint id is not a placement id", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    plan.placements.push({
      id: "orphan-edge",
      componentId: "kg.relation-edge",
      axes: { a1: 2, a2: 2, a3: 2, a4: 1, a5: 1 },
      content: { from: "n1", to: "nonexistent-node", label: "linksTo" },
    });
    const rules = violationRules(plan);
    expect(rules).toContain("edge-endpoints");
  });
});

describe("validatePlan – constraint: manifest-id", () => {
  it("flags a componentId not present in the manifest", () => {
    const plan = build({
      need: "test",
      family: "knowledge-graph",
      nodes: [{ id: "n1", label: "N", className: "X", kind: "entity" }],
      edges: [],
    });
    plan.placements.push({
      id: "ghost",
      componentId: "kg.does-not-exist",
      axes: { a1: 0, a2: 0, a3: 2, a4: 0, a5: 0 },
      content: { label: "Ghost" },
    });
    const rules = violationRules(plan);
    expect(rules).toContain("manifest-id");
  });
});

// ---------------------------------------------------------------------------
// buildPlan — unknown kind coercion (simulates a malformed LLM response)
// ---------------------------------------------------------------------------

describe("buildPlan – unknown node kind falls back gracefully", () => {
  // Simulate an LLM that returned "process" as a node kind for a workflow,
  // which is not in WF_NODE_COMPONENT.  buildPlan should not throw.
  const plan = build({
    need: "checkout flow",
    family: "workflow",
    nodes: [
      { id: "start",  label: "Start",   className: "terminator", kind: "start" },
      { id: "pay",    label: "Pay",     className: "task",       kind: "process" as never },
      { id: "end",    label: "End",     className: "terminator", kind: "end" },
    ],
    edges: [
      { from: "start", to: "pay", kind: "flow" },
      { from: "pay",   to: "end", kind: "flow" },
    ],
  });

  it("does not throw — plan is returned", () => {
    expect(plan).toBeDefined();
    expect(plan.placements.length).toBeGreaterThan(0);
  });

  it("records a coercion note", () => {
    expect(plan.notes.some((n) => n.includes('"pay"') && n.includes('"process"'))).toBe(true);
  });

  it("coerces the unknown kind to wf.task (workflow default)", () => {
    const payP = plan.placements.find((p) => p.id === "pay")!;
    expect(payP.componentId).toBe("wf.task");
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

describe("buildPlan – unknown node kind falls back gracefully (knowledge-graph)", () => {
  // Simulate an LLM that returned "node" as a node kind for a knowledge-graph.
  const plan = build({
    need: "org chart",
    family: "knowledge-graph",
    nodes: [
      { id: "a1", label: "Alice", className: "Person", kind: "node" as never },
      { id: "b1", label: "Bob",   className: "Person", kind: "entity" },
    ],
    edges: [
      { from: "a1", to: "b1", kind: "relation" },
    ],
  });

  it("does not throw — plan is returned", () => {
    expect(plan).toBeDefined();
  });

  it("records a coercion note", () => {
    expect(plan.notes.some((n) => n.includes('"a1"') && n.includes('"node"'))).toBe(true);
  });

  it("coerces to kg.entity (knowledge-graph default)", () => {
    const a1P = plan.placements.find((p) => p.id === "a1")!;
    expect(a1P.componentId).toBe("kg.entity");
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

describe("buildPlan – unknown edge kind falls back gracefully", () => {
  // Simulate an LLM that returned "link" as an edge kind.
  const plan = build({
    need: "entity diagram",
    family: "knowledge-graph",
    nodes: [
      { id: "a", label: "A", className: "Widget", kind: "entity" },
      { id: "b", label: "B", className: "Widget", kind: "entity" },
    ],
    edges: [
      { id: "e1", from: "a", to: "b", kind: "link" as never, label: "connects" },
    ],
  });

  it("does not throw — plan is returned", () => {
    expect(plan).toBeDefined();
  });

  it("records a coercion note for the edge", () => {
    expect(plan.notes.some((n) => n.includes('"e1"') && n.includes('"link"'))).toBe(true);
  });

  it("coerces to kg.relation-edge (knowledge-graph default)", () => {
    const edgeP = plan.placements.find((p) => p.id === "e1")!;
    expect(edgeP.componentId).toBe("kg.relation-edge");
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

describe("buildPlan – all kinds unknown (maximally malformed LLM response)", () => {
  // Every node and edge has a garbage kind — nothing should crash.
  const plan = build({
    need: "purchase workflow",
    family: "workflow",
    nodes: [
      { id: "start",    label: "Start",   className: "terminator", kind: "start" },
      { id: "activity", label: "Do it",   className: "task",       kind: "action" as never },
      { id: "gate",     label: "Gate",    className: "task",       kind: "gateway" as never },
      { id: "end",      label: "End",     className: "terminator", kind: "end" },
    ],
    edges: [
      { id: "e1", from: "start",    to: "activity", kind: "sequence" as never },
      { id: "e2", from: "activity", to: "gate",     kind: "arrow" as never },
      { id: "e3", from: "gate",     to: "end",      kind: "flow" },
    ],
  });

  it("produces a plan without throwing", () => {
    expect(plan).toBeDefined();
    expect(plan.placements.length).toBeGreaterThan(0);
  });

  it("all node placements reference valid manifest component ids", () => {
    const validIds = new Set(MANIFEST.components.map((c) => c.id));
    for (const p of plan.placements) {
      expect(validIds.has(p.componentId)).toBe(true);
    }
  });

  it("records coercion notes for each unknown kind", () => {
    const noteText = plan.notes.join(" ");
    expect(noteText).toContain('"action"');
    expect(noteText).toContain('"gateway"');
    expect(noteText).toContain('"sequence"');
    expect(noteText).toContain('"arrow"');
  });

  it("passes validatePlan with no errors", () => {
    expect(validatePlan(plan, MANIFEST).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: every plan buildPlan emits passes validatePlan
// ---------------------------------------------------------------------------

describe("round-trip: buildPlan → validatePlan", () => {
  const scenarios: PlanRequest[] = [
    { need: "map who knows who in the organization" },
    { need: "show the approval workflow step by step" },
    { need: "approve, review, merge, deploy" },
    { need: "document taxonomy with files and records" },
    { need: "checkout: add to cart, then pay, then confirm" },
    {
      need: "employee org graph",
      family: "knowledge-graph",
      nodes: [
        { id: "e1", label: "Alice", className: "Employee", kind: "entity", focal: true },
        { id: "e2", label: "Bob",   className: "Employee", kind: "entity" },
        { id: "m1", label: "Mgr",   className: "Manager",  kind: "entity" },
      ],
      edges: [
        { from: "e1", to: "m1", kind: "relation", label: "reportsTo" },
        { from: "e2", to: "m1", kind: "relation", label: "reportsTo" },
      ],
    },
    {
      need: "detail view of a person entity",
      family: "knowledge-graph",
      view: "detail",
      nodes: [
        {
          id: "p1",
          label: "Alice",
          className: "Person",
          kind: "entity",
          properties: ["email", "title"],
        },
      ],
      edges: [],
    },
    {
      need: "workflow with groups",
      family: "workflow",
      nodes: [
        { id: "start", label: "Start", className: "terminator", kind: "start" },
        { id: "t1",    label: "Step A", className: "task",      kind: "task" },
        { id: "end",   label: "End",   className: "terminator", kind: "end" },
      ],
      edges: [
        { from: "start", to: "t1",  kind: "flow" },
        { from: "t1",    to: "end", kind: "flow" },
      ],
      groups: [{ id: "lane1", label: "Team A", kind: "lane" }],
    },
  ];

  for (const request of scenarios) {
    it(`is valid for: "${request.need}"`, () => {
      const plan   = build(request);
      const report = validatePlan(plan, MANIFEST);
      expect(report.valid, JSON.stringify(report.issues)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Component table coverage: every key in each table must be accepted without
// coercion by buildPlan (i.e. no "unrecognised kind" note for valid kinds).
// This ensures llmExtract.ts's derived kind sets stay in sync automatically.
// ---------------------------------------------------------------------------

describe("component table coverage – KG_NODE_COMPONENT keys are all valid", () => {
  for (const kind of Object.keys(KG_NODE_COMPONENT)) {
    it(`kind "${kind}" is accepted without a coercion note`, () => {
      const plan = build({
        need: `test kg node kind ${kind}`,
        family: "knowledge-graph",
        nodes: [{ id: "n1", label: "N", className: "X", kind: kind as StructuredNode["kind"] }],
        edges: [],
      });
      const coercionNote = plan.notes.find(
        (note) => note.includes('"n1"') && note.includes(`"${kind}"`),
      );
      expect(coercionNote, `Expected no coercion note for kind "${kind}"`).toBeUndefined();
    });
  }
});

describe("component table coverage – KG_EDGE_COMPONENT keys are all valid", () => {
  for (const kind of Object.keys(KG_EDGE_COMPONENT)) {
    it(`kind "${kind}" is accepted without a coercion note`, () => {
      const plan = build({
        need: `test kg edge kind ${kind}`,
        family: "knowledge-graph",
        nodes: [
          { id: "a", label: "A", className: "X", kind: "entity" },
          { id: "b", label: "B", className: "X", kind: "entity" },
        ],
        edges: [{ id: "e1", from: "a", to: "b", kind: kind as StructuredEdge["kind"] }],
      });
      const coercionNote = plan.notes.find(
        (note) => note.includes('"e1"') && note.includes(`"${kind}"`),
      );
      expect(coercionNote, `Expected no coercion note for kind "${kind}"`).toBeUndefined();
    });
  }
});

describe("component table coverage – WF_NODE_COMPONENT keys are all valid", () => {
  for (const kind of Object.keys(WF_NODE_COMPONENT)) {
    it(`kind "${kind}" is accepted without a coercion note`, () => {
      const plan = build({
        need: `test wf node kind ${kind}`,
        family: "workflow",
        nodes: [{ id: "n1", label: "N", className: "X", kind: kind as StructuredNode["kind"] }],
        edges: [],
      });
      const coercionNote = plan.notes.find(
        (note) => note.includes('"n1"') && note.includes(`"${kind}"`),
      );
      expect(coercionNote, `Expected no coercion note for kind "${kind}"`).toBeUndefined();
    });
  }
});

describe("component table coverage – WF_EDGE_COMPONENT keys are all valid", () => {
  for (const kind of Object.keys(WF_EDGE_COMPONENT)) {
    it(`kind "${kind}" is accepted without a coercion note`, () => {
      const plan = build({
        need: `test wf edge kind ${kind}`,
        family: "workflow",
        nodes: [
          { id: "start", label: "Start", className: "terminator", kind: "start" },
          { id: "end",   label: "End",   className: "terminator", kind: "end" },
        ],
        edges: [{ id: "e1", from: "start", to: "end", kind: kind as StructuredEdge["kind"] }],
      });
      const coercionNote = plan.notes.find(
        (note) => note.includes('"e1"') && note.includes(`"${kind}"`),
      );
      expect(coercionNote, `Expected no coercion note for kind "${kind}"`).toBeUndefined();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Manifest integrity tests – run against the actual wireframe-library manifest
// ─────────────────────────────────────────────────────────────────────────────

import actualManifest from "../../../artifacts/wireframe-library/src/lib/manifest.json";

const VALID_ATOMIC_LEVELS = new Set([
  "atom",
  "molecule",
  "organism",
  "template",
  "page",
]);

describe("manifest integrity – composition atomicLevel", () => {
  const compositions = (actualManifest as { compositions?: Array<{ id: string; atomicLevel: string }> })
    .compositions ?? [];

  it("manifest has at least one composition", () => {
    expect(compositions.length).toBeGreaterThan(0);
  });

  for (const comp of compositions) {
    it(`composition "${comp.id}" has a valid atomicLevel`, () => {
      expect(
        VALID_ATOMIC_LEVELS.has(comp.atomicLevel),
        `"${comp.atomicLevel}" is not one of ${[...VALID_ATOMIC_LEVELS].join(", ")}`
      ).toBe(true);
    });
  }
});

describe("manifest integrity – composition slot componentId references", () => {
  const componentIds = new Set(
    actualManifest.components.map((c: { id: string }) => c.id)
  );
  const compositions = (actualManifest as {
    compositions?: Array<{
      id: string;
      slots: Array<{ componentId: string; role: string }>;
    }>;
  }).compositions ?? [];

  it("every slot componentId resolves to a real component", () => {
    const unresolved: { compositionId: string; slotRole: string; componentId: string }[] = [];
    for (const comp of compositions) {
      for (const slot of comp.slots) {
        if (!componentIds.has(slot.componentId)) {
          unresolved.push({
            compositionId: comp.id,
            slotRole: slot.role,
            componentId: slot.componentId,
          });
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  for (const comp of compositions) {
    it(`composition "${comp.id}" has at least one slot`, () => {
      expect(comp.slots.length).toBeGreaterThan(0);
    });

    for (const slot of comp.slots) {
      it(`composition "${comp.id}" slot "${slot.role}" → componentId "${slot.componentId}" resolves`, () => {
        expect(
          componentIds.has(slot.componentId),
          `componentId "${slot.componentId}" does not exist in the manifest components`
        ).toBe(true);
      });
    }
  }
});
