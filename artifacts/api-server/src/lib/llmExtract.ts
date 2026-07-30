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

// ---------------------------------------------------------------------------
// Allowed kind vocabularies — must stay in sync with librarian.ts tables.
// ---------------------------------------------------------------------------

const KG_NODE_KINDS: Set<string> = new Set(["entity", "class", "literal"]);
const WF_NODE_KINDS: Set<string> = new Set(["task", "start", "end", "decision", "parallel", "data"]);
const KG_EDGE_KINDS: Set<string> = new Set(["relation", "property", "subclass"]);
const WF_EDGE_KINDS: Set<string> = new Set(["flow", "conditional"]);

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

const SYSTEM_PROMPT = `You are a diagram-structure extractor. Given a plain-English description of a diagram need, output a JSON object (no markdown fences) with this exact shape:

{
  "family": "knowledge-graph" | "workflow",
  "nodes": [
    {
      "id": "<slug>",
      "label": "<display label>",
      "className": "<role/type name, e.g. Supplier, Warehouse, Task>",
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
      "label": "<relation label>",   // omit for unlabelled flow edges
      "kind": "<relation|property|subclass|flow|conditional>"
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

Rules:
- "family" is "workflow" for process/step/sequence diagrams, "knowledge-graph" for entity/relation/schema diagrams.
- Every "from"/"to" in edges must exactly match an "id" in nodes.
- Node ids must be URL-safe slugs (lowercase, hyphens only).
- For knowledge-graph: use kind "entity" for instances, "class" for class/type nodes.
- For workflow: always include one "start" node (id "start") and one "end" node (id "end").
- "groups" may be an empty array when not needed.
- Output only the JSON object — no explanation, no code fences.`;

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
