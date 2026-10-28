import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import type {
  Composition,
  CompositionFamily,
  DiagramPlan,
  Manifest,
  Placement,
} from "@workspace/wireframe-librarian";

type PromotionMetadata = {
  id: string;
  label: string;
  description?: string;
  family: CompositionFamily;
  atomicLevel: Composition["atomicLevel"];
};

export class ManifestWriteDisabledError extends Error {
  constructor() {
    super("Template promotion is available only from a write-enabled development workspace. Production manifests are read-only.");
  }
}

let manifestWriteQueue: Promise<void> = Promise.resolve();

/** Manifest writes are deliberately opt-in and unavailable in production. */
export function assertManifestWriteAllowed(): void {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.LIBRARIAN_MANIFEST_PROMOTION_ENABLED !== "true"
  ) {
    throw new ManifestWriteDisabledError();
  }
}

export function resolvePromotionManifestPaths(configuredManifestPath: string | undefined) {
  if (!configuredManifestPath) {
    throw new ManifestWriteDisabledError();
  }

  const manifestPath = fs.realpathSync(configuredManifestPath);
  const expectedSuffix = path.join("docs", "wireframe-library", "manifest.json");
  if (!manifestPath.endsWith(expectedSuffix)) {
    throw new Error("The configured promotion manifest path must target docs/wireframe-library/manifest.json.");
  }

  const schemaPath = path.join(path.dirname(manifestPath), "manifest.schema.json");
  if (!fs.existsSync(schemaPath)) {
    throw new Error("The configured promotion manifest is missing its sibling manifest.schema.json.");
  }

  return { manifestPath, schemaPath: fs.realpathSync(schemaPath) };
}

function isEdge(placement: Placement) {
  return placement.content.from !== undefined && placement.content.to !== undefined;
}

function spread(count: number, index: number, min = 0.12, max = 0.88) {
  return count <= 1 ? 0.5 : min + ((max - min) * index) / (count - 1);
}

function makeRole(placement: Placement, index: number, used: Map<string, number>) {
  const fallback = isEdge(placement)
    ? "edge"
    : placement.componentId.split(".").at(-1) ?? "slot";
  const base = (placement.content.role ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `slot-${index + 1}`;
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

function nodePositions(plan: DiagramPlan) {
  const nodes = plan.placements.filter((placement) => !isEdge(placement));
  const positions = new Map<string, { x: number; y: number }>();

  if (plan.family === "workflow") {
    nodes.forEach((node, index) => {
      positions.set(node.id, { x: spread(nodes.length, index), y: 0.5 });
    });
    return positions;
  }

  const classes = nodes.filter((node) => node.componentId === "kg.class");
  const literals = nodes.filter((node) => node.componentId === "kg.literal");
  const entities = nodes.filter((node) => !classes.includes(node) && !literals.includes(node));

  classes.forEach((node, index) => {
    positions.set(node.id, { x: spread(classes.length, index), y: 0.14 });
  });
  entities.forEach((node, index) => {
    positions.set(node.id, {
      x: spread(entities.length, index),
      y: index % 2 === 0 ? 0.46 : 0.66,
    });
  });
  literals.forEach((node, index) => {
    positions.set(node.id, { x: spread(literals.length, index), y: 0.88 });
  });

  return positions;
}

function axesOverride(placement: Placement, manifest: Manifest) {
  const component = manifest.components.find((candidate) => candidate.id === placement.componentId);
  if (!component) return placement.axes;
  const overrides = Object.fromEntries(
    Object.entries(placement.axes).filter(([axis, value]) => component.axes[axis as keyof typeof component.axes] !== value),
  );
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Converts a rendered plan to a reusable composition. Positions intentionally
 * mirror the renderer's family layouts in a portable 0…1 bounding box.
 */
export function planToComposition(
  plan: DiagramPlan,
  metadata: PromotionMetadata,
  manifest: Manifest,
): Composition {
  const positions = nodePositions(plan);
  const roles = new Map<string, number>();

  const slots = plan.placements.map((placement, index) => {
    const ownPosition = positions.get(placement.id);
    const from = placement.content.from ? positions.get(placement.content.from) : undefined;
    const to = placement.content.to ? positions.get(placement.content.to) : undefined;
    const position = ownPosition ?? (from && to
      ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
      : { x: 0.5, y: 0.5 });

    return {
      componentId: placement.componentId,
      role: makeRole(placement, index, roles),
      position,
      ...(axesOverride(placement, manifest) ? { axes: axesOverride(placement, manifest) } : {}),
    };
  });

  return {
    ...metadata,
    description: metadata.description?.trim() || `Reusable pattern promoted from: ${plan.need}`,
    slots,
  };
}

function schemaErrors(validator: ReturnType<Ajv["compile"]>) {
  return (validator.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

/** Validates an in-memory candidate against the canonical manifest schema. */
export function assertManifestSchema(candidate: Manifest, schemaPath: string): void {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validator = new Ajv({ allErrors: true, strict: false }).compile(schema);
  if (!validator(candidate)) {
    throw new Error(`Promoted composition does not satisfy manifest.schema.json: ${schemaErrors(validator)}`);
  }
}

/**
 * Appends a composition only when the complete next manifest satisfies the
 * canonical JSON Schema. A temporary sibling is renamed into place so callers
 * never observe a partial JSON file.
 */
function appendCompositionLocked(composition: Composition): void {
  const { manifestPath, schemaPath } = resolvePromotionManifestPaths(
    process.env.LIBRARIAN_MANIFEST_PATH,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  if (manifest.compositions?.some((candidate) => candidate.id === composition.id)) {
    throw new Error(`A composition with id "${composition.id}" already exists.`);
  }

  const nextManifest: Manifest = {
    ...manifest,
    compositions: [...(manifest.compositions ?? []), composition],
  };
  assertManifestSchema(nextManifest, schemaPath);

  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, manifestPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

/**
 * Serializes local manifest writes so simultaneous promotion requests cannot
 * overwrite one another after independently passing duplicate-id checks.
 */
export function appendPromotedComposition(composition: Composition): Promise<void> {
  const operation = manifestWriteQueue.then(() => {
    assertManifestWriteAllowed();
    appendCompositionLocked(composition);
  });
  manifestWriteQueue = operation.catch(() => undefined);
  return operation;
}