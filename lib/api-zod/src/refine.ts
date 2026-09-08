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
  placements: zod.array(
    zod.object({
      id: zod.string(),
      componentId: zod.string(),
      content: zod.object({
        label: zod.string().optional(),
        role: zod.string().optional(),
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
});

export const RefineDiagramPlanResponse = CreateDiagramPlanResponse;
