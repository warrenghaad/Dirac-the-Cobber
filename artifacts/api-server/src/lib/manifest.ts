import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "@workspace/wireframe-librarian";

const MANIFEST_REL = path.join("docs", "wireframe-library", "manifest.json");

/** Walk up from cwd to find the repo-root manifest (single source of truth). */
export function findManifestPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, MANIFEST_REL);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate ${MANIFEST_REL} from ${process.cwd()}`);
}

/**
 * Validate that every composition slot references a component id that exists
 * in the same manifest. Throws a descriptive error on the first violation.
 */
function assertCompositionIntegrity(manifest: Manifest): void {
  if (!manifest.compositions || manifest.compositions.length === 0) return;

  const knownIds = new Set(manifest.components.map((c) => c.id));

  for (const composition of manifest.compositions) {
    for (const slot of composition.slots) {
      if (!knownIds.has(slot.componentId)) {
        throw new Error(
          `Composition "${composition.id}" slot "${slot.role}" references unknown component "${slot.componentId}". ` +
            `Known component ids: ${[...knownIds].join(", ")}.`,
        );
      }
    }
  }
}

export function loadManifest(): Manifest {
  const raw = fs.readFileSync(findManifestPath(), "utf8");
  const manifest = JSON.parse(raw) as Manifest;
  assertCompositionIntegrity(manifest);
  return manifest;
}
