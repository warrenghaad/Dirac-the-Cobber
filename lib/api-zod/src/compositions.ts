/**
 * Atomic Design composition types — hand-authored (not orval-generated).
 * These extend the manifest schema with Molecule / Organism / Template records.
 */
import * as zod from "zod";

export const AtomicLevel = zod.enum(["molecule", "organism", "template"]);
export type AtomicLevel = zod.infer<typeof AtomicLevel>;

export const CompositionFamily = zod.enum([
  "tier1",
  "knowledge-graph",
  "workflow",
  "cross-family",
]);
export type CompositionFamily = zod.infer<typeof CompositionFamily>;

export const CompositionSlot = zod.object({
  /** Must reference a valid component id in the same manifest. */
  componentId: zod.string().min(1),
  /** Semantic role this slot plays (e.g. "container", "label", "icon", "edge"). */
  role: zod.string().min(1),
  /** Unit-fraction position relative to a 1×1 bounding box. */
  position: zod.object({
    x: zod.number().min(0).max(1),
    y: zod.number().min(0).max(1),
  }),
  /** Optional axis overrides; partial — unset axes inherit the component default. */
  axes: zod
    .object({
      a1: zod.number().int().min(0).optional(),
      a2: zod.number().int().min(0).optional(),
      a3: zod.number().int().min(0).optional(),
      a4: zod.number().int().min(0).optional(),
      a5: zod.number().int().min(0).optional(),
    })
    .optional(),
});
export type CompositionSlot = zod.infer<typeof CompositionSlot>;

export const Composition = zod.object({
  id: zod.string().min(1),
  atomicLevel: AtomicLevel,
  label: zod.string().min(1),
  description: zod.string().optional(),
  family: CompositionFamily,
  slots: zod.array(CompositionSlot).min(1),
});
export type Composition = zod.infer<typeof Composition>;

/** Response body for GET /api/librarian/compositions */
export const CompositionsResponse = zod.object({
  compositions: zod.array(Composition),
});
export type CompositionsResponse = zod.infer<typeof CompositionsResponse>;
