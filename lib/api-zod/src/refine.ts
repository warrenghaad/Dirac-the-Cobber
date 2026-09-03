/**
 * Hand-written Zod schema for POST /api/librarian/refine.
 * Not generated — this endpoint is defined outside the OpenAPI spec.
 */
import * as zod from "zod";
import { CreateDiagramPlanResponse } from "./generated/api";

/** Minimal DiagramPlan shape needed to drive LLM refinement. */
const DiagramPlanForRefine = zod.object({
  need: zod.string(),
  family: zod.enum(["knowledge-graph", "workflow"]),
  visualLanguage: zod
    .enum([
      "knowledge-graph",
      "uml",
      "database",
      "mui-ui",
      "flowchart",
      "workflow",
      "information-architecture",
      "mind-map",
    ])
    .optional(),
  compositionIds: zod.array(zod.string()).optional(),
  placements: zod.array(
    zod.object({
      id: zod.string(),
      componentId: zod.string(),
      content: zod.object({
        label: zod.string().optional(),
        role: zod.string().optional(),
        className: zod.string().optional(),
        from: zod.string().optional(),
        to: zod.string().optional(),
        focal: zod.boolean().optional(),
        properties: zod.array(zod.string()).optional(),
      }),
    }),
  ),
  notes: zod.array(zod.string()),
});

export const RefineDiagramPlanBody = zod.object({
  refinement: zod
    .string()
    .min(1)
    .describe("Follow-up instruction, e.g. 'also show the returns flow'"),
  currentPlan: DiagramPlanForRefine,
  family: zod.enum(["knowledge-graph", "workflow"]).optional(),
  view: zod.enum(["overview", "detail"]).optional(),
});

export const RefineDiagramPlanResponse = CreateDiagramPlanResponse;
