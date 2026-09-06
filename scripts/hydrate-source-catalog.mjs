import { gzipSync, gunzipSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compressedCatalog = resolve(
  root,
  "docs/wireframe-library/source-catalog.json.gz",
);
const canonicalCatalog = resolve(
  root,
  "docs/wireframe-library/source-catalog.json",
);
const browserCatalog = resolve(
  root,
  "artifacts/wireframe-library/src/lib/source-catalog.json",
);

if (process.argv.includes("--compress")) {
  if (!existsSync(canonicalCatalog)) {
    throw new Error(
      "Cannot compress the source catalog because the expanded canonical file is missing.",
    );
  }
  writeFileSync(
    compressedCatalog,
    gzipSync(readFileSync(canonicalCatalog), { level: 9 }),
  );
  console.log("Compressed canonical source catalog.");
}

let catalog;
if (existsSync(compressedCatalog)) {
  catalog = gunzipSync(readFileSync(compressedCatalog));
} else if (existsSync(canonicalCatalog)) {
  // Existing development workspaces may still have the expanded catalog before
  // their first pull from the lightweight repository.
  catalog = readFileSync(canonicalCatalog);
} else {
  throw new Error(
    "Source catalog is unavailable. Expected the compressed canonical catalog at " +
      compressedCatalog,
  );
}

// Parsing before writing makes a damaged compressed asset fail installation
// explicitly rather than creating two invalid mirrors.
JSON.parse(catalog.toString("utf8"));

for (const destination of [canonicalCatalog, browserCatalog]) {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, catalog);
}

console.log("Hydrated source catalog mirrors.");