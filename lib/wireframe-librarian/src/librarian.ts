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
  VisualLanguage,
  VisualLanguageDefinition,
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

const VISUAL_LANGUAGE_DEFINITIONS: VisualLanguageDefinition[] = [
  {
    id: "knowledge-graph",
    label: "Knowledge Graph",
    description: "Entities, classes, properties, and relationships",
    cues: KG_CUES,
    baseFamily: "knowledge-graph",
    semanticRoles: ["entity", "class", "literal", "relation", "property", "subclass", "group"],
    componentFamilies: ["knowledge-graph", "tier1"],
  },
  {
    id: "uml",
    label: "UML",
    description: "Classes, actors, associations, and inheritance",
    cues: ["uml", "class", "classes", "object", "objects", "actor", "actors", "inheritance", "association", "sequence"],
    baseFamily: "knowledge-graph",
    semanticRoles: ["class", "entity", "actor", "association", "subclass", "group"],
    componentFamilies: ["knowledge-graph", "tier1"],
  },
  {
    id: "database",
    label: "Database Diagram",
    description: "Tables, columns, keys, and data relationships",
    cues: ["database", "databases", "db", "table", "tables", "column", "columns", "sql", "erd", "primary", "foreign", "key"],
    baseFamily: "knowledge-graph",
    semanticRoles: ["table", "column", "entity", "foreign-key", "property", "contains", "group"],
    componentFamilies: ["knowledge-graph", "tier1"],
  },
  {
    id: "mui-ui",
    label: "MUI UI Structure",
    description: "React and Material UI screens, components, and sections",
    cues: ["mui", "material", "react", "ui", "interface", "screen", "screens", "component", "components", "card", "dialog", "dashboard"],
    baseFamily: "knowledge-graph",
    semanticRoles: ["component", "page", "section", "contains", "navigation", "group"],
    componentFamilies: ["tier1"],
  },
  {
    id: "flowchart",
    label: "Flowchart",
    description: "Processes, decisions, inputs, and outputs",
    cues: ["flowchart", "flowcharts", "flow", "algorithm", "decision", "branch", "yes", "no", "start", "end"],
    baseFamily: "workflow",
    semanticRoles: ["start", "end", "process", "task", "decision", "data", "branch", "flow", "group"],
    componentFamilies: ["workflow", "tier1"],
  },
  {
    id: "workflow",
    label: "Workflow",
    description: "Ordered steps, handoffs, approvals, and stages",
    cues: WF_CUES,
    baseFamily: "workflow",
    semanticRoles: ["start", "end", "task", "decision", "parallel", "data", "flow", "conditional", "lane"],
    componentFamilies: ["workflow", "tier1"],
  },
  {
    id: "information-architecture",
    label: "Information Architecture",
    description: "Pages, sections, navigation, and content hierarchy",
    cues: ["information", "architecture", "sitemap", "site", "navigation", "nav", "content", "hierarchy", "website", "websites"],
    baseFamily: "knowledge-graph",
    semanticRoles: ["page", "section", "navigation", "contains", "group"],
    componentFamilies: ["knowledge-graph", "tier1"],
  },
  {
    id: "mind-map",
    label: "Mind Map",
    description: "A central topic with branching ideas and associations",
    cues: ["mind", "map", "mindmap", "brainstorm", "idea", "ideas", "branch", "branches", "radial", "central"],
    baseFamily: "knowledge-graph",
    semanticRoles: ["topic", "entity", "branch", "relation", "group"],
    componentFamilies: ["knowledge-graph", "tier1"],
  },
];

export { VISUAL_LANGUAGE_DEFINITIONS };

const LANGUAGE_PRIORITY: VisualLanguage[] = [
  "database",
  "uml",
  "mui-ui",
  "information-architecture",
  "mind-map",
  "flowchart",
  "workflow",
  "knowledge-graph",
];

const VISUAL_LANGUAGE_BY_ID = new Map(
  VISUAL_LANGUAGE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function classifyVisualLanguage(need: string): VisualLanguage {
  return classifyVisualLanguageFromManifest(need);
}

export function classifyVisualLanguageFromManifest(
  need: string,
  manifest?: Manifest,
): VisualLanguage {
  const words = tokenize(need);
  const score = (definition: VisualLanguageDefinition) =>
    words.filter((word) => definition.cues.includes(word)).length;
  const definitions = manifest?.visualLanguages?.length
    ? manifest.visualLanguages
    : LANGUAGE_PRIORITY.map((id) => VISUAL_LANGUAGE_BY_ID.get(id)!);
  let selected: VisualLanguage = "knowledge-graph";
  let bestScore = 0;
  for (const definition of definitions) {
    const currentScore = score(definition);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      selected = definition.id;
    }
  }
  return selected;
}

export function visualLanguageFamily(language: VisualLanguage): DiagramFamily {
  return VISUAL_LANGUAGE_BY_ID.get(language)?.baseFamily ?? "knowledge-graph";
}

export function classifyFamily(need: string): DiagramFamily {
  return visualLanguageFamily(classifyVisualLanguage(need));
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
function deriveStructure(need: string, language: VisualLanguage): {
  nodes: StructuredNode[];
  edges: StructuredEdge[];
  notes: string[];
} {
  const notes: string[] = [];
  if (visualLanguageFamily(language) === "workflow") {
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

export const UML_NODE_COMPONENT: Record<string, string> = {
  actor: "kg.entity",
  entity: "kg.entity",
  class: "kg.class",
  literal: "kg.literal",
};
export const UML_EDGE_COMPONENT: Record<string, string> = {
  association: "kg.relation-edge",
  relation: "kg.relation-edge",
  property: "kg.property-edge",
  subclass: "kg.subclass-edge",
};
export const DATABASE_NODE_COMPONENT: Record<string, string> = {
  table: "kg.class",
  entity: "kg.entity",
  column: "kg.literal",
  literal: "kg.literal",
  class: "kg.class",
};
export const DATABASE_EDGE_COMPONENT: Record<string, string> = {
  "foreign-key": "kg.relation-edge",
  contains: "kg.property-edge",
  property: "kg.property-edge",
  relation: "kg.relation-edge",
};
export const MUI_NODE_COMPONENT: Record<string, string> = {
  component: "prim.node.generic",
  page: "prim.node.generic",
  section: "prim.container.plain",
  entity: "prim.node.generic",
  class: "prim.node.generic",
};
export const MUI_EDGE_COMPONENT: Record<string, string> = {
  contains: "prim.edge.plain",
  navigation: "prim.edge.plain",
  relation: "prim.edge.plain",
  flow: "prim.edge.plain",
};
export const FLOWCHART_NODE_COMPONENT: Record<string, string> = {
  task: "wf.task",
  process: "wf.task",
  start: "wf.start-end",
  end: "wf.start-end",
  decision: "wf.decision",
  parallel: "wf.parallel",
  data: "wf.data",
};
export const FLOWCHART_EDGE_COMPONENT: Record<string, string> = {
  flow: "wf.flow-edge",
  branch: "wf.cond-edge",
  conditional: "wf.cond-edge",
};
export const IA_NODE_COMPONENT: Record<string, string> = {
  page: "kg.entity",
  section: "kg.class",
  entity: "kg.entity",
  class: "kg.class",
  topic: "kg.entity",
};
export const IA_EDGE_COMPONENT: Record<string, string> = {
  contains: "kg.property-edge",
  navigation: "kg.relation-edge",
  relation: "kg.relation-edge",
};
export const MIND_MAP_NODE_COMPONENT: Record<string, string> = {
  topic: "kg.entity",
  entity: "kg.entity",
  class: "kg.class",
  literal: "kg.literal",
};
export const MIND_MAP_EDGE_COMPONENT: Record<string, string> = {
  branch: "kg.relation-edge",
  relation: "kg.relation-edge",
  contains: "kg.property-edge",
};

const NODE_COMPONENTS_BY_LANGUAGE: Record<VisualLanguage, Record<string, string>> = {
  "knowledge-graph": KG_NODE_COMPONENT,
  uml: UML_NODE_COMPONENT,
  database: DATABASE_NODE_COMPONENT,
  "mui-ui": MUI_NODE_COMPONENT,
  flowchart: FLOWCHART_NODE_COMPONENT,
  workflow: WF_NODE_COMPONENT,
  "information-architecture": IA_NODE_COMPONENT,
  "mind-map": MIND_MAP_NODE_COMPONENT,
};

const EDGE_COMPONENTS_BY_LANGUAGE: Record<VisualLanguage, Record<string, string>> = {
  "knowledge-graph": KG_EDGE_COMPONENT,
  uml: UML_EDGE_COMPONENT,
  database: DATABASE_EDGE_COMPONENT,
  "mui-ui": MUI_EDGE_COMPONENT,
  flowchart: FLOWCHART_EDGE_COMPONENT,
  workflow: WF_EDGE_COMPONENT,
  "information-architecture": IA_EDGE_COMPONENT,
  "mind-map": MIND_MAP_EDGE_COMPONENT,
};

function definitionFor(manifest: Manifest, language: VisualLanguage): VisualLanguageDefinition {
  return manifest.visualLanguages?.find((definition) => definition.id === language)
    ?? VISUAL_LANGUAGE_BY_ID.get(language)
    ?? VISUAL_LANGUAGE_BY_ID.get("knowledge-graph")!;
}

function componentSupportsLanguage(
  component: ManifestComponent,
  language: VisualLanguage,
  manifest: Manifest,
): boolean {
  const definition = definitionFor(manifest, language);
  if (!definition.componentFamilies.includes(component.family)) return false;
  if (component.visualLanguages?.length) return component.visualLanguages.includes(definition.id);
  const family = manifest.componentFamilies?.find((candidate) => candidate.id === component.family);
  return family?.visualLanguages.includes(definition.id)
    ?? (component.family === "tier1" || component.family === definition.baseFamily);
}

function normalizeNodeKind(language: VisualLanguage, kind: string): string {
  if (language === "database") {
    if (kind === "literal" || kind === "column") return "column";
    if (["entity", "class", "table"].includes(kind)) return "table";
  }
  if (language === "mui-ui") {
    if (["entity", "class", "literal", "task", "process"].includes(kind)) return "component";
  }
  if (language === "information-architecture") {
    if (kind === "entity") return "page";
    if (["class", "literal"].includes(kind)) return "section";
  }
  if (language === "mind-map" && ["entity", "class", "literal"].includes(kind)) return "topic";
  if (language === "uml" && kind === "literal") return "class";
  if (language === "flowchart" && kind === "task") return "process";
  return kind;
}

function normalizeEdgeKind(language: VisualLanguage, kind: string): string {
  if (language === "database") {
    return kind === "property" ? "contains" : "foreign-key";
  }
  if (language === "mui-ui") {
    return kind === "relation" ? "navigation" : "contains";
  }
  if (language === "information-architecture") {
    return kind === "relation" ? "navigation" : "contains";
  }
  if (language === "mind-map") return "branch";
  if (language === "uml" && ["relation", "property"].includes(kind)) return "association";
  if (language === "flowchart" && kind === "conditional") return "branch";
  return kind;
}

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

export function buildPlan(request: PlanRequest, manifest: Manifest): DiagramPlan {
  const visualLanguage = request.visualLanguage
    ?? (request.family ? request.family : classifyVisualLanguageFromManifest(request.need, manifest));
  const languageDefinition = definitionFor(manifest, visualLanguage);
  const family = request.family && !request.visualLanguage
    ? request.family
    : languageDefinition.baseFamily;
  const view = request.view ?? "overview";
  const notes: string[] = [];
  if (!request.visualLanguage) {
    notes.push(`Visual language inferred as "${visualLanguage}".`);
  } else {
    notes.push(`Visual language selected as "${visualLanguage}".`);
  }

  let nodes = request.nodes;
  let edges = request.edges ?? [];
  if (!nodes || nodes.length === 0) {
    const derived = deriveStructure(request.need, visualLanguage);
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
  const nodeTable = NODE_COMPONENTS_BY_LANGUAGE[visualLanguage];
  const edgeTable = EDGE_COMPONENTS_BY_LANGUAGE[visualLanguage];
  const fallbackNodeKind = visualLanguageFamily(visualLanguage) === "workflow" ? "task" : "entity";
  const fallbackNodeComponent = nodeTable[fallbackNodeKind] ?? (
    visualLanguageFamily(visualLanguage) === "workflow" ? "wf.task" : "kg.entity"
  );
  const fallbackEdgeKind = visualLanguageFamily(visualLanguage) === "workflow" ? "flow" : "relation";
  const fallbackEdgeComponent = edgeTable[fallbackEdgeKind] ?? (
    visualLanguageFamily(visualLanguage) === "workflow" ? "wf.flow-edge" : "kg.relation-edge"
  );

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
    let kind = normalizeNodeKind(visualLanguage, n.kind ?? fallbackNodeKind);
    if (!nodeTable[kind]) {
      const fallback = fallbackNodeKind;
      notes.push(
        `Node "${n.id}" has unrecognised kind "${kind}" for ${family}; falling back to "${fallback}".`,
      );
      kind = fallback as typeof kind;
    }
    const compId = nodeTable[kind] ?? fallbackNodeComponent;
    const comp = component(compId);
    if (!componentSupportsLanguage(comp, visualLanguage, manifest)) {
      notes.push(
        `Component "${comp.id}" is not declared for visual language "${visualLanguage}".`,
      );
    }
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
        className: n.className,
        properties: axes.a5 >= 3 ? n.properties : undefined,
        hueIndex,
        parent: n.parent,
        role: kind,
        focal: n.id === focalId || undefined,
      },
    });
  }

  edges.forEach((e, i) => {
    let kind = normalizeEdgeKind(visualLanguage, e.kind ?? fallbackEdgeKind);
    if (!edgeTable[kind]) {
      const fallback = fallbackEdgeKind;
      notes.push(
        `Edge "${e.id ?? `edge-${i + 1}`}" has unrecognised kind "${kind}" for ${family}; falling back to "${fallback}".`,
      );
      kind = fallback as typeof kind;
    }
    const compId = edgeTable[kind] ?? fallbackEdgeComponent;
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
    const compId = visualLanguageFamily(visualLanguage) === "workflow" && g.kind === "lane"
      ? "wf.lane"
      : visualLanguage === "mui-ui"
        ? "prim.container.plain"
        : "kg.group";
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
    visualLanguage,
    compositionIds: request.compositionIds,
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
