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

export function loadManifest(): Manifest {
  const raw = fs.readFileSync(findManifestPath(), "utf8");
  return JSON.parse(raw) as Manifest;
}
