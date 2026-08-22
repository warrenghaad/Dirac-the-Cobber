#!/usr/bin/env node
/**
 * figma-intake.js — populate figmaNodeId + fileKey in manifest.json
 *
 * Usage:
 *   FIGMA_ACCESS_TOKEN=<pat> node scripts/figma-intake.js
 *
 * What it does:
 *   1. Reads docs/wireframe-library/manifest.json for figmaSources entries
 *   2. Fetches each file's component list from the Figma REST API
 *   3. Matches components to manifest vocabulary by shape/name heuristics
 *   4. Writes figmaNodeId + fileKey back into manifest components
 *   5. Copies the updated manifest to artifacts/wireframe-library/src/lib/manifest.json
 *   6. Prints a gap report: unmatched manifest IDs still served by React reference set
 *
 * Matching heuristic (extend SHAPE_HINTS below as needed):
 *   Each Figma component's name is normalised to lowercase and matched against
 *   the keyword lists. First file wins; within a file, exact-name match beats
 *   keyword match.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "../docs/wireframe-library/manifest.json");
const ARTIFACT_COPY = resolve(__dirname, "../artifacts/wireframe-library/src/lib/manifest.json");

// ---------------------------------------------------------------------------
// Shape/name heuristics — map manifest id → keywords to look for in Figma
// component names (case-insensitive substring match).
// ---------------------------------------------------------------------------
const SHAPE_HINTS = {
  "prim.node.generic":   ["rounded rect", "rounded-rect", "generic node", "rectangle node", "_rectangle"],
  "prim.node.round":     ["ellipse", "circle", "round node", "oval"],
  "prim.edge.plain":     ["arrow", "edge", "connector", "flow", "plain edge"],
  "prim.container.plain":["container", "frame container", "group container", "plain container"],
  "prim.anchor.point":   ["anchor", "point", "dot"],

  "kg.entity":           ["entity", "resource", "node entity"],
  "kg.class":            ["class", "type node"],
  "kg.literal":          ["literal", "value node"],
  "kg.property-edge":    ["property edge", "property arrow", "labeled arrow"],
  "kg.relation-edge":    ["relation", "relation edge", "relation arrow"],
  "kg.subclass-edge":    ["subclass", "instance", "dashed arrow", "_line / dashed", "taxonomy"],
  "kg.group":            ["group", "namespace", "subgraph", "artboard", "frame"],

  "wf.start-end":        ["start", "end", "terminator", "pill"],
  "wf.task":             ["task", "activity", "step"],
  "wf.decision":         ["decision", "diamond", "branch"],
  "wf.parallel":         ["parallel", "fork", "join", "hexagon", "gateway"],
  "wf.data":             ["data", "artifact", "parallelogram", "trapezoid"],
  "wf.flow-edge":        ["flow edge", "sequence", "flow arrow"],
  "wf.cond-edge":        ["conditional", "cond edge", "guarded arrow"],
  "wf.lane":             ["lane", "swimlane", "pool"],
};

// ---------------------------------------------------------------------------

const token = process.env.FIGMA_ACCESS_TOKEN;
if (!token) {
  console.error("❌  FIGMA_ACCESS_TOKEN is not set.");
  console.error("   Generate one at: figma.com → Settings → Security → Personal access tokens");
  console.error("   Then run:  FIGMA_ACCESS_TOKEN=<token> node scripts/figma-intake.js");
  process.exit(1);
}

async function figmaGet(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Recursively collect all COMPONENT nodes from the Figma tree. */
function collectComponents(node, acc = []) {
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    acc.push({ id: node.id, name: node.name, type: node.type });
  }
  if (node.children) node.children.forEach((c) => collectComponents(c, acc));
  return acc;
}

/** Find the best manifest-id match for a Figma component name. */
function matchManifestId(componentName) {
  const lower = componentName.toLowerCase();
  for (const [manifestId, keywords] of Object.entries(SHAPE_HINTS)) {
    if (keywords.some((kw) => lower.includes(kw))) return manifestId;
  }
  return null;
}

async function run() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const sources = manifest.figmaSources ?? [];

  if (!sources.length) {
    console.log("ℹ️  No figmaSources entries found in manifest. Nothing to do.");
    return;
  }

  // Build a mutable index: manifestId → component entry
  const byId = Object.fromEntries(manifest.components.map((c) => [c.id, c]));

  const matchLog = [];
  const unmatchedFigma = [];

  for (const source of sources) {
    console.log(`\n📂  Processing: ${source.label} (${source.fileKey})`);

    let figmaComponents = [];
    try {
      if (source.kind === "figjam") {
        // FigJam files: use /files endpoint; boards don't have typed components
        // but may contain shapes we can inspect
        const data = await figmaGet(`/files/${source.fileKey}`);
        figmaComponents = collectComponents(data.document);
        console.log(`   Found ${figmaComponents.length} component(s) in FigJam board.`);
      } else {
        // Design file: use /files/:key/components for efficiency
        const data = await figmaGet(`/files/${source.fileKey}/components`);
        figmaComponents = (data.meta?.components ?? []).map((c) => ({
          id: c.node_id,
          name: c.name,
          type: "COMPONENT",
        }));
        console.log(`   Found ${figmaComponents.length} published component(s).`);
      }
    } catch (e) {
      console.error(`   ⚠️  Failed to fetch ${source.fileKey}: ${e.message}`);
      source.intakeStatus = `error: ${e.message.slice(0, 120)}`;
      continue;
    }

    let newMatchCount = 0;
    for (const fc of figmaComponents) {
      const manifestId = matchManifestId(fc.name);
      if (!manifestId) {
        unmatchedFigma.push({ fileKey: source.fileKey, name: fc.name, nodeId: fc.id });
        continue;
      }
      const entry = byId[manifestId];
      if (!entry) {
        unmatchedFigma.push({ fileKey: source.fileKey, name: fc.name, nodeId: fc.id, note: "no manifest entry" });
        continue;
      }
      // Only assign if not already claimed by a previous file (first-file-wins)
      if (entry.figmaNodeId === null) {
        entry.figmaNodeId = fc.id;
        entry.fileKey = source.fileKey;
        matchLog.push({ manifestId, figmaName: fc.name, nodeId: fc.id, fileKey: source.fileKey });
        newMatchCount++;
      }
    }

    const sourceMatchCount = manifest.components.filter(
      (component) => component.figmaNodeId !== null && component.fileKey === source.fileKey
    ).length;
    source.intakeStatus = `done — ${sourceMatchCount} component(s) matched`;
    console.log(
      `   ✅  ${sourceMatchCount} component(s) linked to this source (${newMatchCount} newly recorded).`
    );
  }

  // Write updated manifest to both locations
  const updated = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(MANIFEST_PATH, updated);
  writeFileSync(ARTIFACT_COPY, updated);
  console.log("\n✅  Manifest updated at:");
  console.log("    docs/wireframe-library/manifest.json");
  console.log("    artifacts/wireframe-library/src/lib/manifest.json");

  // Gap report
  const gaps = manifest.components.filter((c) => c.figmaNodeId === null);
  console.log(`\n📊  Gap report — ${gaps.length} component(s) still served by React reference set:`);
  gaps.forEach((c) => console.log(`    • ${c.id}`));

  if (matchLog.length) {
    console.log(`\n🔗  Matched ${matchLog.length} Figma component(s):`);
    matchLog.forEach((m) =>
      console.log(`    • ${m.manifestId} ← "${m.figmaName}" (${m.fileKey}:${m.nodeId})`)
    );
  }

  if (unmatchedFigma.length) {
    console.log(`\n⚠️   ${unmatchedFigma.length} Figma component(s) had no manifest match (ignored):`);
    unmatchedFigma.slice(0, 20).forEach((u) => console.log(`    • "${u.name}" (${u.fileKey})`));
  }
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
