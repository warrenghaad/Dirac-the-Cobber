/**
 * The librarian: turns a described need into a diagram plan (SPEC.md §6).
 * Fully deterministic — no randomness, no LLM. Classify → Tier-1 draft →
 * spend emphasis one axis-step at a time → emit.
 */

import type {
  AxisCoords,
  DiagramFamily,
  DiagramPlan,
  DraftPlacement,
  Manifest,
  ManifestComponent,
  Placement,
  PlanRequest,
  StructuredEdge,
  StructuredNode,
} from "./types";

// ---------------------------------------------------------------------------
// §6.1 Classify
// ---------------------------------------------------------------------------

const WF_CUES = [
  "workflow", "process", "step", "steps", "pipeline", "procedure", "flow",
  "approve", "approval", "review", "onboard", "checkout", "then", "sequence",
  "task", "stage", "handoff",
];
const KG_CUES = [
  "map", "graph", "entity", "entities", "relation", "relationship", "ontology",
  "schema", "property", "properties", "knows", "who", "what", "where",
  "belongs", "owns", "works", "concept", "taxonomy",
];

export function classifyFamily(need: string): DiagramFamily {
  const words = tokenize(need);
  const score = (cues: string[]) => words.filter((w) => cues.includes(w)).length;
  return score(WF_CUES) > score(KG_CUES) ? "workflow" : "knowledge-graph";
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Keyword dictionaries for deriving structure from bare text (deterministic).
const KG_CLASS_CUES: Record<string, string[]> = {
  Person: ["who", "person", "people", "employee", "employees", "staff", "member", "members", "user", "users"],
  Place: ["where", "place", "places", "location", "locations", "office", "offices", "site", "sites", "city"],
  Organization: ["organization", "organisation", "company", "companies", "org", "team", "teams", "department", "departments"],
  Document: ["document", "documents", "file", "files", "record", "records"],
  Concept: ["concept", "concepts", "topic", "topics", "skill", "skills"],
};

// [cueStem, relationLabel, fromClass, toClass]
const KG_RELATION_CUES: [string, string, string, string][] = [
  ["work", "worksAt", "Person", "Place"],
  ["report", "reportsTo", "Person", "Person"],
  ["manage", "manages", "Person", "Team"],
  ["know", "knows", "Person", "Person"],
  ["own", "owns", "Person", "Document"],
  ["belong", "belongsTo", "Person", "Organization"],
  ["locate", "locatedIn", "Organization", "Place"],
];

const WF_DECISION_CUES = ["if", "decide", "decision", "whether"];

/** Derive a schematic structure from bare text when no explicit nodes given. */
function deriveStructure(need: string, family: DiagramFamily): {
  nodes: StructuredNode[];
  edges: StructuredEdge[];
  notes: string[];
} {
  const notes: string[] = [];
  if (family === "workflow") {
    // Split the need into step phrases.
    const phrases = need
      .replace(/^(model|map|draw|show|design)\b[^:]*:\s*/i, "")
      .replace(/^(model|map|draw|show|design)\s+/i, "")
      .split(/\s*(?:,|;|->|\bthen\b|\band then\b)\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);
    const nodes: StructuredNode[] = [
      { id: "start", label: "Start", className: "terminator", kind: "start" },
    ];
    const edges: StructuredEdge[] = [];
    let prev = "start";
    phrases.forEach((phrase, i) => {
      const words = tokenize(phrase);
      const isDecision = words.some((w) => WF_DECISION_CUES.includes(w));
      const id = `step-${i + 1}`;
      nodes.push({
        id,
        label: titleCase(phrase),
        className: isDecision ? "decision" : "task",
        kind: isDecision ? "decision" : "task",
      });
      edges.push({ from: prev, to: id, kind: "flow" });
      prev = id;
    });
    nodes.push({ id: "end", label: "End", className: "terminator", kind: "end" });
    edges.push({ from: prev, to: "end", kind: "flow" });
    notes.push(`Derived ${phrases.length} step(s) from the need text.`);
    return { nodes, edges, notes };
  }

  // Knowledge graph: detect classes and relations from cue words.
  const words = tokenize(need);
  const classes = Object.entries(KG_CLASS_CUES)
    .filter(([, cues]) => words.some((w) => cues.includes(w)))
    .map(([name]) => name);
  const relations = KG_RELATION_CUES.filter(([stem]) =>
    words.some((w) => w.startsWith(stem)),
  );
  for (const [, , from, to] of relations) {
    for (const c of [from, to]) if (!classes.includes(c)) classes.push(c);
  }
  if (classes.length === 0) classes.push("Entity");

  const nodes: StructuredNode[] = [];
  const edges: StructuredEdge[] = [];
  // Class node + two instance entities per detected class.
  classes.forEach((cls, ci) => {
    nodes.push({ id: `class-${cls}`, label: cls, className: cls, kind: "class" });
    for (let k = 1; k <= 2; k++) {
      const id = `${cls.toLowerCase()}-${k}`;
      nodes.push({
        id,
        label: `${cls} ${k}`,
        className: cls,
        kind: "entity",
        focal: ci === 0 && k === 1,
      });
      edges.push({ from: id, to: `class-${cls}`, label: "instanceOf", kind: "subclass" });
    }
  });
  // Relation edges between instances of the cue classes.
  relations.forEach(([, label, fromCls, toCls]) => {
    for (let k = 1; k <= 2; k++) {
      edges.push({
        from: `${fromCls.toLowerCase()}-${k}`,
        to: `${toCls.toLowerCase()}-${k}`,
        label,
        kind: "relation",
      });
    }
  });
  notes.push(
    `Derived classes [${classes.join(", ")}] and relations [${relations.map((r) => r[1]).join(", ") || "none"}] from the need text.`,
  );
  return { nodes, edges, notes };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Component selection tables (SPEC §5)
// Exported so consumers (e.g. llmExtract.ts) can derive their allowed-kind
// sets directly from these tables instead of maintaining hand-copied lists.
// ---------------------------------------------------------------------------

export const KG_NODE_COMPONENT: Record<string, string> = {
  entity: "kg.entity",
  class: "kg.class",
  literal: "kg.literal",
};
export const KG_EDGE_COMPONENT: Record<string, string> = {
  relation: "kg.relation-edge",
  property: "kg.property-edge",
  subclass: "kg.subclass-edge",
};
export const WF_NODE_COMPONENT: Record<string, string> = {
  task: "wf.task",
  start: "wf.start-end",
  end: "wf.start-end",
  decision: "wf.decision",
  parallel: "wf.parallel",
  data: "wf.data",
};
export const WF_EDGE_COMPONENT: Record<string, string> = {
  flow: "wf.flow-edge",
  conditional: "wf.cond-edge",
};

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

export function buildPlan(request: PlanRequest, manifest: Manifest): DiagramPlan {
  const family = request.family ?? classifyFamily(request.need);
  const view = request.view ?? "overview";
  const notes: string[] = [];

  let nodes = request.nodes;
  let edges = request.edges ?? [];
  if (!nodes || nodes.length === 0) {
    const derived = deriveStructure(request.need, family);
    nodes = derived.nodes;
    edges = derived.edges;
    notes.push(...derived.notes);
  }

  const byId = new Map(manifest.components.map((c) => [c.id, c]));
  const component = (id: string): ManifestComponent => {
    const c = byId.get(id);
    if (!c) throw new Error(`Manifest has no component "${id}"`);
    return c;
  };

  // §6.2 — Tier-1 equal-consequence draft (structure checkpoint).
  const tier1Draft: DraftPlacement[] = [
    ...nodes.map((n) => ({
      id: n.id,
      componentId: n.kind === "literal" ? "prim.node.round" : "prim.node.generic",
    })),
    ...edges.map((e, i) => ({
      id: e.id ?? `edge-${i + 1}`,
      componentId: "prim.edge.plain",
      from: e.from,
      to: e.to,
    })),
    ...(request.groups ?? []).map((g) => ({
      id: g.id,
      componentId: "prim.container.plain",
      label: g.label,
    })),
  ];

  // §6.3 — Spend emphasis one axis-step at a time.
  // A2 (color) encodes class membership: one hue per class, max 5 hues.
  const nodeClasses = [...new Set(
    nodes.filter((n) => n.kind !== "literal" && n.kind !== "start" && n.kind !== "end").map((n) => n.className),
  )];
  const hueByClass = new Map<string, number>();
  nodeClasses.slice(0, manifest.tokens.palette.length).forEach((cls, i) => hueByClass.set(cls, i));
  if (nodeClasses.length > manifest.tokens.palette.length) {
    notes.push(
      `Hue budget: ${nodeClasses.length} classes but only ${manifest.tokens.palette.length} hues allowed; classes beyond the first ${manifest.tokens.palette.length} stay mono ink (A2=0).`,
    );
  }

  const placements: Placement[] = [];

  const focalId = nodes.find((n) => n.focal)?.id;
  for (const n of nodes) {
    let kind = n.kind ?? (family === "workflow" ? "task" : "entity");
    const nodeTable = family === "workflow" ? WF_NODE_COMPONENT : KG_NODE_COMPONENT;
    if (!nodeTable[kind]) {
      const fallback = family === "workflow" ? "task" : "entity";
      notes.push(
        `Node "${n.id}" has unrecognised kind "${kind}" for ${family}; falling back to "${fallback}".`,
      );
      kind = fallback as typeof kind;
    }
    const compId = nodeTable[kind];
    const comp = component(compId);
    const axes: AxisCoords = { ...comp.axes };
    const hueIndex = hueByClass.get(n.className);
    // A2 — class membership. Components default to palette level (2); drop to
    // mono when this class has no hue in the budget.
    if (hueIndex === undefined && kind !== "start" && kind !== "end") axes.a2 = 0;
    // A3 — importance: the focal node gets exactly one size step up (spread ≤ 2).
    if (n.id === focalId) {
      axes.a3 = Math.min(comp.axes.a3 + 1, comp.maxAxes.a3);
      // A4 — one stroke step for the hero outline, within max.
      axes.a4 = Math.min(comp.axes.a4 + 1, comp.maxAxes.a4);
    }
    // A5 — information need: detail views may carry key properties.
    if (view === "detail" && (n.properties?.length ?? 0) > 0) {
      axes.a5 = Math.min(3, comp.maxAxes.a5);
    }
    placements.push({
      id: n.id,
      componentId: compId,
      axes,
      content: {
        label: n.label,
        typeTag: axes.a5 >= 2 ? n.className : undefined,
        properties: axes.a5 >= 3 ? n.properties : undefined,
        hueIndex,
        parent: n.parent,
        role: n.className,
        focal: n.id === focalId || undefined,
      },
    });
  }

  edges.forEach((e, i) => {
    let kind = e.kind ?? (family === "workflow" ? "flow" : "relation");
    const edgeTable = family === "workflow" ? WF_EDGE_COMPONENT : KG_EDGE_COMPONENT;
    if (!edgeTable[kind]) {
      const fallback = family === "workflow" ? "flow" : "relation";
      notes.push(
        `Edge "${e.id ?? `edge-${i + 1}`}" has unrecognised kind "${kind}" for ${family}; falling back to "${fallback}".`,
      );
      kind = fallback as typeof kind;
    }
    const compId = edgeTable[kind];
    const comp = component(compId);
    const axes: AxisCoords = { ...comp.axes };
    if (!e.label && axes.a5 > 0) axes.a5 = 0;
    if (e.label && axes.a5 === 0) axes.a5 = Math.min(1, comp.maxAxes.a5);
    placements.push({
      id: e.id ?? `edge-${i + 1}`,
      componentId: compId,
      axes,
      content: { label: e.label, from: e.from, to: e.to, role: kind },
    });
  });

  (request.groups ?? []).forEach((g) => {
    const compId = family === "workflow" && g.kind === "lane" ? "wf.lane" : "kg.group";
    const comp = component(compId);
    placements.push({
      id: g.id,
      componentId: compId,
      axes: { ...comp.axes },
      content: { label: g.label, role: g.kind ?? "group" },
    });
  });

  return {
    need: request.need,
    title: titleCase(request.need),
    family,
    axisMeanings: {
      a1: "category (role family)",
      a2: "class membership",
      a3: "importance / focus",
      a4: "edge kind / hero outline",
      a5: "information need",
    },
    tier1Draft,
    placements,
    notes,
  };
}
