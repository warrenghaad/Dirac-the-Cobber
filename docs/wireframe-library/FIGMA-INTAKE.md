# Figma Intake — How to connect Figma components to the manifest

## What this does

`scripts/figma-intake.js` reads every registered live `figmaSources` entry,
fully inspects its component tree (and the published component index where
available), and retains every discovered component or component set in
`source-catalog.json`'s `sourceCatalog.assets` inventory. This happens before any source is considered for a
renderer role.

The importer does **not** assign a renderer role from a name or shape match.
Only an already-approved exact `fileKey` + `figmaNodeId` reference is treated
as a mapping. All other discovered assets are written as `unmatched`, with
page, component-set, and property/variant provenance where Figma provides it.
Components that intentionally have no approved source reference remain on the
React reference set.

Before either manifest mirror is written, intake fetches every registered
source, verifies every existing `figmaNodeId` against the source’s fresh
eligible-node index, and queries the Figma node endpoint for each retained
reference. A missing node, missing source, invalid node-specific link,
unsupported node type, incompatible semantic primitive, or source-fetch
failure aborts the run without writing either manifest.

The renderer-focused `manifest.json` receives a small source summary; the
complete catalog is written separately to `source-catalog.json`. The API serves
that summary to the Sources view and pages detailed assets by source, so normal
library and planner requests never transfer the entire review inventory.

## Running the intake

```bash
# FIGMA_ACCESS_TOKEN is already set as a Replit Secret.
# Just run:
node scripts/figma-intake.js
```

## Current state (as of 2026-08-24)

The intake script runs cleanly. **26 of 28 manifest roles now have a verified
Figma node reference.** One role uses a published MUI component; the remaining
25 use the dedicated [Visual Logic Primitives](https://www.figma.com/board/nOEamjKEXw6oXF9Clp8PGD/Visual-Logic-Primitives)
FigJam source. `prim.node.round` and `kg.class` remain intentional React
reference fallbacks while suitable Figma frames are sourced.

Design files are fully inspected, not limited to the published-component
endpoint. For example, the supplied Dialect [Components canvas](https://www.figma.com/design/5JebW1QtNsfn9eQ9aPYPJD/Dialect-%E2%80%93-Design-System---Component-Library--Free---Community-?m=dev&ready-for-dev=1&node-id=1-14)
is registered as node `1:14`; its link resolves to the `❖ Components` canvas,
and intake scans all 2,712 component nodes in the file alongside its published
component records. It contributes no renderer references because none has a
reviewed exact mapping; its inventory is retained as unmatched source material.

The source is a reusable, explicitly named visual vocabulary rather than a
single diagram layout. It provides:

- **Nodes:** generic and sharp rectangles, a pill, diamond/decision, hexagon/
  parallel gateway, parallelogram/data object, and database cylinder.
- **Edges:** labeled plain, undirected, bidirectional, property, relation,
  subclass, flow, and conditional connectors.
- **Structures:** entity, literal, group container, and swimlane.

A diamond is deliberately reusable as both `prim.node.diamond` and
`wf.decision`; a hexagon is reusable as both `prim.node.hexagon` and
`wf.parallel`. That shared reference reflects their compatible visual logic,
not an accidental name match.

**Remaining React-reference gaps:** `prim.node.round`, `kg.class`. The React
sheets remain the renderer and fallback behavior if a future source link
becomes unavailable.

## Registered sources

| File key | Label | Components matched |
|----------|-------|--------------------|
| `dpWgseUU58TAk7wAVl55yt` | MUI Material Design Component Library | 1 verified |
| `nOEamjKEXw6oXF9Clp8PGD` | [Visual Logic Primitives](https://www.figma.com/board/nOEamjKEXw6oXF9Clp8PGD/Visual-Logic-Primitives) | 25 verified named FigJam primitives |
| `fxyEtWUCgZrA2MsraKSjKe` | Figma Draw Playground (Community) | 0 — artwork only |
| `CSXebcFtI1JyEq07xCJ3ko` | Design Foundry Orchestration Map | 0 — 16 local components, no additional semantic match |
| `jVY2CNS79i0bsdrVgC5Bfs` | Mindmap (Community FigJam) | 0 — 16 local components, no additional semantic match |
| `5JebW1QtNsfn9eQ9aPYPJD` | [Dialect Components canvas](https://www.figma.com/design/5JebW1QtNsfn9eQ9aPYPJD/Dialect-%E2%80%93-Design-System---Component-Library--Free---Community-?m=dev&ready-for-dev=1&node-id=1-14) | 0 additional — 2,712 component nodes fully inspected; overlapping roles already claimed |

## Approved baseline beyond live Figma

The Source Catalog tab is the reviewable baseline for every approved source:

| Source | Access state | How it is represented |
| --- | --- | --- |
| Graph Visualization UI Kit (Community) | Local-only | Local `.fig` export, thumbnail, and all seven bundled token exports. The catalog preserves 91 primitive, 8 shape, 45 type-scale, two 5-token font, two 273-token graph-variable, and 32×196-token M3 theme modes. |
| Advanced Spreadsheet | Pending registration | Visible as a data-surface source; no file key/export has been supplied. |
| Course-site | Pending registration | Visible as an application-layout source; no file key/export has been supplied. |
| Component Properties Playground | Pending registration | Visible as a variant/property source; no file key/export has been supplied. |
| Tailwind | Pending registration | Visible as a utility-first UI and data-surface source; no file key/export has been supplied. |
| Untitled UI Pro Variables | Inaccessible | Explicitly blocked until the connected Figma account receives edit access; no asset or token is claimed from it. |

## Improving coverage

Coverage grows by adding any readable Figma Design or FigJam source to
`figmaSources`; it does not need to be a special-purpose diagram library. A
source can contribute an appropriate visual primitive from any vocabulary,
including UML, database modeling, MUI, flowcharts, workflows, information
architecture, and mind maps.

For an editable FigJam vocabulary source whose named shapes are intentionally
library primitives rather than local Figma components, set
`"intakeMode": "semantic-primitives"`. That mode is opt-in: it scans only named
shapes, connectors, and sections, and incorporates actual FigJam shape type
metadata. Ordinary FigJam boards continue to scan only their local components.

Add the file to `figmaSources` in `docs/wireframe-library/manifest.json`:

```jsonc
{
  "fileKey": "<key from Figma URL>",
  "url": "https://www.figma.com/design/<key>/...",
  "kind": "design",
  "label": "My Diagram Components",
  "intakeStatus": "pending",
  "addedAt": "YYYY-MM-DD"
}
```

Then re-run: `node scripts/figma-intake.js`

## Reviewing deterministic mappings

Semantic rules (`MATCH_RULES` in `scripts/figma-intake.js`) remain as a guard
for explicitly named FigJam primitives: they verify that a retained mapping
still carries the role it claims. They are not an automatic import mapper.

For a Design-file candidate, record the exact `fileKey:nodeId → manifestId`
mapping only after it passes a semantic audit, then add the corresponding
provenance and approved mapping record to the manifest. This prevents a
similarly named UI control from becoming a renderer source. The dedicated
FigJam semantic-primitives source is additionally checked against its explicit
named-shape rules.

Design files are scanned for both their published catalog and all component
nodes in the full file tree. A source with a node-specific URL records that
target node and fails intake if the link no longer resolves. FigJam boards are
scanned for their local reusable components unless they explicitly opt into the
semantic-primitive mode above. Competing candidates are all retained and
flagged for review; source order never selects a renderer role.

The manifest schema requires every source’s file key and source metadata.
Each component must declare `figmaNodeId` and `fileKey` together; the manifest
validator rejects references to an unregistered source key before intake runs.
