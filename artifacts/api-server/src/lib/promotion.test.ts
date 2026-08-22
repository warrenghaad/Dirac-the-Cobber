import path from "node:path";
import { describe, expect, it } from "vitest";
import { PromoteDiagramPlanBody } from "@workspace/api-zod";
import type { DiagramPlan, Manifest } from "@workspace/wireframe-librarian";
import { findManifestPath, loadManifest } from "./manifest";
import {
  assertManifestSchema,
  assertManifestWriteAllowed,
  ManifestWriteDisabledError,
  planToComposition,
  resolvePromotionManifestPaths,
} from "./promotion";

function componentAxes(manifest: Manifest, id: string) {
  const component = manifest.components.find((candidate) => candidate.id === id);
  if (!component) throw new Error(`Fixture component ${id} is missing.`);
  return component.axes;
}

const manifest = loadManifest();
const schemaPath = path.join(path.dirname(findManifestPath()), "manifest.schema.json");
const plan: DiagramPlan = {
  need: "Move a purchase from checkout to delivery",
  title: "Purchase fulfillment",
  family: "workflow",
  axisMeanings: { a1: "step kind" },
  tier1Draft: [],
  placements: [
    {
      id: "checkout",
      componentId: "wf.task",
      axes: componentAxes(manifest, "wf.task"),
      content: { label: "Checkout", role: "task" },
    },
    {
      id: "delivery",
      componentId: "wf.task",
      axes: componentAxes(manifest, "wf.task"),
      content: { label: "Delivery", role: "task" },
    },
    {
      id: "checkout-delivery",
      componentId: "wf.flow-edge",
      axes: componentAxes(manifest, "wf.flow-edge"),
      content: { from: "checkout", to: "delivery", role: "flow" },
    },
  ],
  notes: [],
};

describe("planToComposition", () => {
  it("preserves every placement as a positioned, role-addressable composition slot", () => {
    const composition = planToComposition(
      plan,
      {
        id: "tpl.purchase-fulfillment",
        label: "Purchase Fulfillment",
        family: "workflow",
        atomicLevel: "template",
      },
      manifest,
    );

    expect(composition.slots).toHaveLength(plan.placements.length);
    expect(composition.slots.map((slot) => slot.componentId)).toEqual(
      plan.placements.map((placement) => placement.componentId),
    );
    expect(composition.slots.map((slot) => slot.role)).toEqual(["task", "task-2", "flow"]);
    expect(composition.slots.every((slot) => slot.position.x >= 0 && slot.position.x <= 1)).toBe(true);
    expect(composition.slots.every((slot) => slot.position.y >= 0 && slot.position.y <= 1)).toBe(true);
  });

  it("accepts the complete promoted manifest under manifest.schema.json", () => {
    const composition = planToComposition(
      plan,
      {
        id: "tpl.purchase-fulfillment",
        label: "Purchase Fulfillment",
        family: "workflow",
        atomicLevel: "template",
      },
      manifest,
    );
    const candidate: Manifest = {
      ...manifest,
      compositions: [...(manifest.compositions ?? []), composition],
    };

    expect(() =>
      assertManifestSchema(candidate, schemaPath),
    ).not.toThrow();
  });

  it("rejects a candidate whose slot positions violate the canonical schema", () => {
    const composition = planToComposition(
      plan,
      {
        id: "tpl.purchase-fulfillment",
        label: "Purchase Fulfillment",
        family: "workflow",
        atomicLevel: "template",
      },
      manifest,
    );
    const candidate: Manifest = {
      ...manifest,
      compositions: [
        ...(manifest.compositions ?? []),
        {
          ...composition,
          slots: [
            {
              ...composition.slots[0],
              position: { x: 2, y: 0.5 },
            },
          ],
        },
      ],
    };

    expect(() =>
      assertManifestSchema(candidate, schemaPath),
    ).toThrow(/manifest\.schema\.json/);
  });
});

describe("promotion write guard", () => {
  it("is disabled unless the development workspace explicitly enables it", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalEnabled = process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED;
    try {
      process.env.NODE_ENV = "development";
      delete process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED;
      expect(assertManifestWriteAllowed).toThrow(ManifestWriteDisabledError);

      process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED = "true";
      expect(assertManifestWriteAllowed).not.toThrow();

      process.env.NODE_ENV = "production";
      expect(assertManifestWriteAllowed).toThrow(ManifestWriteDisabledError);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalEnabled === undefined) delete process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED;
      else process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED = originalEnabled;
    }
  });

  it("accepts only the canonical manifest location configured by the workspace", () => {
    const paths = resolvePromotionManifestPaths(findManifestPath());
    expect(paths.manifestPath).toMatch(/docs\/wireframe-library\/manifest\.json$/);
    expect(paths.schemaPath).toMatch(/docs\/wireframe-library\/manifest\.schema\.json$/);
    expect(() => resolvePromotionManifestPaths("/tmp/manifest.json")).toThrow();
  });

  it("rejects empty plans before a promotion can reach manifest validation", () => {
    const parsed = PromoteDiagramPlanBody.safeParse({
      plan: { ...plan, placements: [] },
      id: "tpl.empty-plan",
      label: "Empty Plan",
      family: "workflow",
      atomicLevel: "template",
    });
    expect(parsed.success).toBe(false);
  });
});