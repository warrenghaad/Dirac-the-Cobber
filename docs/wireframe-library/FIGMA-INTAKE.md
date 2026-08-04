# Figma Intake — How to connect Figma components to the manifest

## What this does

`scripts/figma-intake.js` reads every `figmaSources` entry in `manifest.json`,
fetches the matching Figma file(s) via the REST API, matches components to
manifest vocabulary entries by name/shape heuristics, and writes
`figmaNodeId` + `fileKey` back into both manifest copies.

Components that cannot be matched stay at `figmaNodeId: null` and are served
by the React reference set in
`artifacts/mockup-sandbox/src/components/mockups/wireframe-library/`.

## Running the intake

```bash
# FIGMA_ACCESS_TOKEN is already set as a Replit Secret.
# Just run:
node scripts/figma-intake.js
```

## Current state (as of 2026-08-04)

The intake script runs cleanly. 8 of 20 manifest components have `figmaNodeId`
populated from the MUI Material Design Community library:

| Manifest ID | Figma component name | Node ID |
|-------------|----------------------|---------|
| `prim.node.round` | `disabled=no, appearance=circle` | `86:47` |
| `prim.edge.plain` | `arrow=no` | `49:549` |
| `prim.container.plain` | `Container` | `523:3725` |
| `prim.anchor.point` | `tile=no, dot=yes, bordered=no, content=none` | `38:37` |
| `kg.class` | `class=shift, variant=vertical` | `31:77` |
| `wf.start-end` | `variant=fab extended, ...` | `516:2333` |
| `wf.task` | `disabled=no, button step=yes, text labels=yes` | `120:1439` |
| `wf.data` | `Datagrid` | `525:3811` |

**12 components still served by the React reference set:**
`prim.node.generic`, `kg.entity`, `kg.literal`, `kg.property-edge`,
`kg.relation-edge`, `kg.subclass-edge`, `kg.group`, `wf.decision`,
`wf.parallel`, `wf.flow-edge`, `wf.cond-edge`, `wf.lane`

## Registered sources

| File key | Label | Components matched |
|----------|-------|--------------------|
| `dpWgseUU58TAk7wAVl55yt` | MUI Material Design Component Library | 8 |
| `fxyEtWUCgZrA2MsraKSjKe` | Figma Draw Playground (Community) | 0 — artwork only |
| `jVY2CNS79i0bsdrVgC5Bfs` | Mindmap (Community FigJam) | 0 — no components |

## Improving coverage

To fill the remaining 12 gaps, add a Figma source file that contains components
named to match the `SHAPE_HINTS` in `scripts/figma-intake.js` — in particular:
- **Rounded rectangle node** (keywords: "rounded rect", "generic node", "rectangle node")
- **Arrow/edge shapes** with labels (keywords: "property edge", "relation edge", "labeled arrow")
- **Diamond** (keyword: "diamond") for `wf.decision`
- **Hexagon/parallel gateway** (keyword: "parallel", "fork", "gateway") for `wf.parallel`
- **Swimlane/pool** (keyword: "lane", "swimlane") for `wf.lane`

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

## Tuning the matching heuristics

The script maps manifest IDs to keyword lists (`SHAPE_HINTS` in
`scripts/figma-intake.js`). If your Figma component names don't match, add
keywords to the relevant entry. First-file-wins: if two source files both
have a matching component for the same manifest ID, the one listed first in
`figmaSources` takes priority.
