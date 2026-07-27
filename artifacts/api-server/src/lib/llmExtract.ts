/**
 * LLM-backed structure extraction for the librarian.
 *
 * When AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY are
 * set (via Replit AI Integrations), this uses an LLM to parse a free-form need
 * description into structured nodes/edges/groups.
 *
 * When the integration is not configured the function returns null and the
 * caller falls back to the deterministic keyword extractor in the librarian.
 */

import type {
  DiagramFamily,
  StructuredEdge,
  StructuredGroup,
  StructuredNode,
} from "@workspace/wireframe-librarian";

export interface LLMExtractionResult {
  family: DiagramFamily;
  nodes: StructuredNode[];
  edges: StructuredEdge[];
  groups: StructuredGroup[];
  notes: string[];
}

/** Returns true when the OpenAI AI integration env vars are present. */
export function isLLMConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
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
 * Returns null when the integration is not configured, so the caller can
 * fall back to deterministic extraction without any error.
 */
export async function extractWithLLM(
  need: string,
  hintFamily?: DiagramFamily,
): Promise<LLMExtractionResult | null> {
  if (!isLLMConfigured()) {
    return null;
  }

  // Lazy import so the module can always be loaded regardless of env vars.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY!,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL!,
  });

  const userContent = hintFamily
    ? `Diagram family hint: ${hintFamily}\n\nNeed: ${need}`
    : `Need: ${need}`;

  const response = await client.chat.completions.create({
    model: "gpt-5.6-luna",
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

  return {
    family,
    nodes: result.nodes as StructuredNode[],
    edges: result.edges as StructuredEdge[],
    groups: Array.isArray(result.groups)
      ? (result.groups as StructuredGroup[])
      : [],
    notes: [
      `Structure extracted by LLM (gpt-5.6-luna) from: "${need.slice(0, 80)}${need.length > 80 ? "…" : ""}".`,
    ],
  };
}
