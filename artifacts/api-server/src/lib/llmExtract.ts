/**
 * LLM-backed structure extraction for the librarian.
 *
 * Supports two configuration paths (checked in order):
 *
 * 1. Replit AI Integration — when AI_INTEGRATIONS_OPENAI_BASE_URL and
 *    AI_INTEGRATIONS_OPENAI_API_KEY are set, uses the Replit-proxied endpoint
 *    with Replit AI Integration model names (gpt-5.6-luna).
 *
 * 2. Direct OpenAI — when OPENAI_API_KEY is set, uses the standard OpenAI
 *    endpoint with a real model name (gpt-4o-mini).
 *
 * When neither is configured the function returns null and the caller falls
 * back to the deterministic keyword extractor in the librarian.
 */

import type {
  DiagramFamily,
  StructuredEdge,
  StructuredGroup,
  StructuredNode,
} from "@workspace/wireframe-librarian";
import {
  KG_NODE_COMPONENT,
  KG_EDGE_COMPONENT,
  WF_NODE_COMPONENT,
  WF_EDGE_COMPONENT,
} from "@workspace/wireframe-librarian";

// ---------------------------------------------------------------------------
// Allowed kind vocabularies — derived from the librarian's component-selection
// tables so they stay in sync automatically when new kinds are added.
// ---------------------------------------------------------------------------

const KG_NODE_KINDS: Set<string> = new Set(Object.keys(KG_NODE_COMPONENT));
const WF_NODE_KINDS: Set<string> = new Set(Object.keys(WF_NODE_COMPONENT));
const KG_EDGE_KINDS: Set<string> = new Set(Object.keys(KG_EDGE_COMPONENT));
const WF_EDGE_KINDS: Set<string> = new Set(Object.keys(WF_EDGE_COMPONENT));

/**
 * Coerce a node kind string to a value the librarian's component-selection
 * tables recognise.  Returns [coercedKind, didCoerce].
 */
function coerceNodeKind(
  kind: unknown,
  family: DiagramFamily,
): [StructuredNode["kind"], boolean] {
  const allowed = family === "workflow" ? WF_NODE_KINDS : KG_NODE_KINDS;
  const fallback = family === "workflow" ? "task" : "entity";
  const str = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (allowed.has(str)) {
    return [str as StructuredNode["kind"], false];
  }
  return [fallback as StructuredNode["kind"], true];
}

/**
 * Coerce an edge kind string to a value the librarian's component-selection
 * tables recognise.  Returns [coercedKind, didCoerce].
 */
function coerceEdgeKind(
  kind: unknown,
  family: DiagramFamily,
): [StructuredEdge["kind"], boolean] {
  const allowed = family === "workflow" ? WF_EDGE_KINDS : KG_EDGE_KINDS;
  const fallback = family === "workflow" ? "flow" : "relation";
  const str = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (allowed.has(str)) {
    return [str as StructuredEdge["kind"], false];
  }
  return [fallback as StructuredEdge["kind"], true];
}

// ---------------------------------------------------------------------------

export interface LLMExtractionResult {
  family: DiagramFamily;
  nodes: StructuredNode[];
  edges: StructuredEdge[];
  groups: StructuredGroup[];
  notes: string[];
}

type LLMConfig =
  | { kind: "replit"; baseURL: string; apiKey: string; model: string }
  | { kind: "openai"; apiKey: string; model: string };

/** Resolves the active LLM configuration, or returns null when unconfigured. */
function getLLMConfig(): LLMConfig | null {
  const replitBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const replitKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (replitBase && replitKey) {
    return { kind: "replit", baseURL: replitBase, apiKey: replitKey, model: "gpt-5.6-luna" };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return { kind: "openai", apiKey: openaiKey, model: "gpt-4o-mini" };
  }

  return null;
}

/** Returns true when any supported LLM config is present. */
export function isLLMConfigured(): boolean {
  return getLLMConfig() !== null;
}

// ---------------------------------------------------------------------------
// System prompt — generated at module load time from the librarian's component
// tables so that adding a new kind there automatically updates what the LLM
// knows about.  Never hand-edit the kind lists here; edit the tables instead.
// ---------------------------------------------------------------------------

export function buildSystemPrompt(): string {
  const kgNodeKinds = [...KG_NODE_KINDS].join("|");
  const kgEdgeKinds = [...KG_EDGE_KINDS].join("|");
  const wfNodeKinds = [...WF_NODE_KINDS].join("|");
  const wfEdgeKinds = [...WF_EDGE_KINDS].join("|");

  return `You are a diagram-structure extractor. Given a plain-English description of a diagram need, output a JSON object (no markdown fences) with this exact shape:

{
  "family": "knowledge-graph" | "workflow",
  "nodes": [
    {
      "id": "<slug>",
      "label": "<display label>",
      "className": "<role/type name, e.g. Supplier, Warehouse, Task>",
      "kind": "<see valid kinds per family below>",
      "focal": <true for the single most important node, omit otherwise>,
      "properties": ["<key prop>", ...] // omit when none
    }
  ],
  "edges": [
    {
      "id": "<slug>",         // optional
      "from": "<node id>",
      "to": "<node id>",
      "label": "<relation label>",   // omit for unlabelled flow edges
      "kind": "<see valid kinds per family below>"
    }
  ],
  "groups": [
    {
      "id": "<slug>",
      "label": "<display label>",
      "kind": "group" | "lane"
    }
  ]
}

Valid node kinds:
- knowledge-graph family: ${kgNodeKinds}
- workflow family: ${wfNodeKinds}

Valid edge kinds:
- knowledge-graph family: ${kgEdgeKinds}
- workflow family: ${wfEdgeKinds}

Rules:
- "family" is "workflow" for process/step/sequence diagrams, "knowledge-graph" for entity/relation/schema diagrams.
- Every "from"/"to" in edges must exactly match an "id" in nodes.
- Node ids must be URL-safe slugs (lowercase, hyphens only).
- For knowledge-graph: use kind "entity" for instances, "class" for class/type nodes.
- For workflow: always include one "start" node (id "start") and one "end" node (id "end").
- "groups" may be an empty array when not needed.
- Output only the JSON object — no explanation, no code fences.`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

/**
 * Attempts LLM extraction of nodes/edges/groups from a need string.
 * Returns null when no LLM is configured, so the caller can fall back to
 * deterministic extraction without any error.
 */
export async function extractWithLLM(
  need: string,
  hintFamily?: DiagramFamily,
): Promise<LLMExtractionResult | null> {
  const config = getLLMConfig();
  if (!config) {
    return null;
  }

  // Lazy import so the module can always be loaded regardless of env vars.
  const { default: OpenAI } = await import("openai");

  const clientOptions =
    config.kind === "replit"
      ? { apiKey: config.apiKey, baseURL: config.baseURL }
      : { apiKey: config.apiKey };

  const client = new OpenAI(clientOptions);

  const userContent = hintFamily
    ? `Diagram family hint: ${hintFamily}\n\nNeed: ${need}`
    : `Need: ${need}`;

  const response = await client.chat.completions.create({
    model: config.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;

  // Basic shape validation — don't trust the model blindly.
  if (
    typeof result !== "object" ||
    !Array.isArray(result.nodes) ||
    !Array.isArray(result.edges)
  ) {
    throw new Error("LLM response missing required nodes/edges arrays");
  }

  const family: DiagramFamily =
    result.family === "workflow" ? "workflow" : "knowledge-graph";

  const coercionWarnings: string[] = [];

  // Sanitise node kinds — coerce anything outside the allowed set so buildPlan
  // never receives a kind it cannot look up in its component-selection tables.
  const nodes = (result.nodes as Record<string, unknown>[]).map((raw) => {
    const [kind, coerced] = coerceNodeKind(raw.kind, family);
    if (coerced) {
      coercionWarnings.push(
        `Node "${raw.id ?? "?"}" had unknown kind "${raw.kind}" — coerced to "${kind}".`,
      );
    }
    return { ...raw, kind } as StructuredNode;
  });

  // Sanitise edge kinds similarly.
  const edges = (result.edges as Record<string, unknown>[]).map((raw) => {
    const [kind, coerced] = coerceEdgeKind(raw.kind, family);
    if (coerced) {
      coercionWarnings.push(
        `Edge "${raw.id ?? raw.from + "→" + raw.to}" had unknown kind "${raw.kind}" — coerced to "${kind}".`,
      );
    }
    return { ...raw, kind } as StructuredEdge;
  });

  return {
    family,
    nodes,
    edges,
    groups: Array.isArray(result.groups)
      ? (result.groups as StructuredGroup[])
      : [],
    notes: [
      `Structure extracted by LLM (${config.model}) from: "${need.slice(0, 80)}${need.length > 80 ? "…" : ""}".`,
      ...coercionWarnings,
    ],
  };
}

/** Map of componentId prefixes back to node kinds. */
const COMPONENT_NODE_KIND: Record<string, StructuredNode["kind"]> = {
  "kg.class": "class",
  "kg.entity": "entity",
  "kg.literal": "literal",
  "wf.task": "task",
  "wf.decision": "decision",
  "wf.parallel": "parallel",
  "wf.data": "data",
};

/**
 * Refine an existing DiagramPlan using a follow-up instruction.
 * Returns null when no LLM is configured (caller should respond with an error
 * since refinement is meaningless without LLM support).
 */
export async function refineWithLLM(
  currentPlan: {
    need: string;
    family: string;
    placements: Array<{
      id: string;
      componentId: string;
      content: {
        label?: string;
        role?: string;
        from?: string;
        to?: string;
        focal?: boolean;
        properties?: string[];
      };
    }>;
    notes: string[];
  },
  refinement: string,
): Promise<LLMExtractionResult | null> {
  const config = getLLMConfig();
  if (!config) {
    return null;
  }

  const { default: OpenAI } = await import("openai");
  const clientOptions =
    config.kind === "replit"
      ? { apiKey: config.apiKey, baseURL: config.baseURL }
      : { apiKey: config.apiKey };
  const client = new OpenAI(clientOptions);

  const { nodes: currentNodes, edges: currentEdges } =
    planToStructured(currentPlan);

  const userContent = [
    `Original need: "${currentPlan.need}"`,
    `Diagram family: ${currentPlan.family}`,
    ``,
    `Current structure:`,
    JSON.stringify({ nodes: currentNodes, edges: currentEdges }, null, 2),
    ``,
    `Refinement instruction: "${refinement}"`,
  ].join("\n");

  const response = await client.chat.completions.create({
    model: config.model,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: REFINEMENT_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;

  if (
    typeof result !== "object" ||
    !Array.isArray(result.nodes) ||
    !Array.isArray(result.edges)
  ) {
    throw new Error("LLM refinement response missing required nodes/edges arrays");
  }

  const family: DiagramFamily =
    result.family === "workflow" ? "workflow" : "knowledge-graph";

  const coercionWarnings: string[] = [];

  const nodes = (result.nodes as Record<string, unknown>[]).map((raw) => {
    const [kind, coerced] = coerceNodeKind(raw.kind, family);
    if (coerced) {
      coercionWarnings.push(
        `Node "${raw.id ?? "?"}" had unknown kind "${raw.kind}" — coerced to "${kind}".`,
      );
    }
    return { ...raw, kind } as StructuredNode;
  });

  const edges = (result.edges as Record<string, unknown>[]).map((raw) => {
    const [kind, coerced] = coerceEdgeKind(raw.kind, family);
    if (coerced) {
      coercionWarnings.push(
        `Edge "${raw.id ?? raw.from + "→" + raw.to}" had unknown kind "${raw.kind}" — coerced to "${kind}".`,
      );
    }
    return { ...raw, kind } as StructuredEdge;
  });

  return {
    family,
    nodes,
    edges,
    groups: Array.isArray(result.groups)
      ? (result.groups as StructuredGroup[])
      : [],
    notes: [
      `Refined by LLM (${config.model}): "${refinement.slice(0, 80)}${refinement.length > 80 ? "…" : ""}".`,
      ...coercionWarnings,
    ],
  };
}

const REFINEMENT_SYSTEM_PROMPT = `You are a diagram-structure editor. You will receive an existing diagram as JSON and a refinement instruction. Output an updated JSON object (no markdown fences) with this exact shape:

{
  "family": "knowledge-graph" | "workflow",
  "nodes": [
    {
      "id": "<slug>",
      "label": "<display label>",
      "className": "<role/type name>",
      "kind": "<entity|class|task|start|end|decision|parallel|data>",
      "focal": <true for the single most important node, omit otherwise>,
      "properties": ["<key prop>", ...] // omit when none
    }
  ],
  "edges": [
    {
      "id": "<slug>",         // optional
      "from": "<node id>",
      "to": "<node id>",
      "label": "<relation label>",
      "kind": "<relation|property|subclass|flow|conditional>"
    }
  ],
  "groups": []
}

Rules:
- Preserve ALL existing nodes and edges that the refinement does not explicitly change or remove.
- Add, remove, or modify nodes/edges as the refinement instruction requires.
- Every "from"/"to" in edges must exactly match an "id" in nodes.
- Node ids must be URL-safe slugs (lowercase, hyphens only).
- For workflow diagrams always keep exactly one "start" node and one "end" node.
- Output only the JSON object — no explanation, no code fences.`;

/**
 * Reconstruct StructuredNode/StructuredEdge arrays from a DiagramPlan so the
 * LLM can see the current diagram in the same schema it was built from.
 */
function planToStructured(plan: {
  family: string;
  placements: Array<{
    id: string;
    componentId: string;
    content: {
      label?: string;
      role?: string;
      from?: string;
      to?: string;
      focal?: boolean;
      properties?: string[];
    };
  }>;
}): { nodes: StructuredNode[]; edges: StructuredEdge[] } {
  const nodes: StructuredNode[] = [];
  const edges: StructuredEdge[] = [];

  for (const p of plan.placements) {
    const edgeKind = COMPONENT_EDGE_KIND[p.componentId];
    if (edgeKind !== undefined) {
      edges.push({
        id: p.id,
        from: p.content.from ?? "",
        to: p.content.to ?? "",
        label: p.content.label,
        kind: edgeKind,
      });
      continue;
    }

    // wf.start-end maps to "start" or "end" depending on the id.
    if (p.componentId === "wf.start-end") {
      const kind: StructuredNode["kind"] =
        p.id === "start" || p.content.label?.toLowerCase() === "start"
          ? "start"
          : "end";
      nodes.push({
        id: p.id,
        label: p.content.label ?? p.id,
        className: kind === "start" ? "terminator" : "terminator",
        kind,
      });
      continue;
    }

    const nodeKind = COMPONENT_NODE_KIND[p.componentId];
    if (nodeKind !== undefined) {
      nodes.push({
        id: p.id,
        label: p.content.label ?? p.id,
        className: p.content.role ?? p.id,
        kind: nodeKind,
        focal: p.content.focal,
        properties: p.content.properties,
      });
    }
  }

  return { nodes, edges };
}

/** Map of edge componentIds back to edge kinds. */
const COMPONENT_EDGE_KIND: Record<string, StructuredEdge["kind"]> = {
  "kg.relation-edge": "relation",
  "kg.property-edge": "property",
  "kg.subclass-edge": "subclass",
  "wf.flow-edge": "flow",
  "wf.cond-edge": "conditional",
};
