# Figma Manifest Audit

**Audited:** 2026-08-22
**Method:** Authenticated Figma REST node lookup (`GET /v1/files/:fileKey/nodes?ids=…`)
for every non-null manifest reference, followed by a review of each node's type,
name, dimensions, child tree, and available component properties against the
manifest's declared shape and content role.

## Result

| Outcome | Count |
| --- | ---: |
| References queried | 26 |
| Existing Figma nodes | 26 |
| Compatible diagram components retained | 26 |
| Existing but incompatible legacy references cleared | 10 |
| Dead Figma references | 0 |
| Components served by the React reference set | 2 |

All 26 retained IDs resolved through Figma's node endpoint and passed the
source-specific type and semantic-role checks. One is a MUI component and 25
are explicitly named primitives from the shared Visual Logic Primitives FigJam
source. Two roles intentionally remain on the React reference set until they
have dedicated Figma frames.

This audit covers the renderer-ready mappings only. The broader, source-backed
baseline—including unmatched Dialect, Figma Draw, Mindmap, local graph-kit
tokens, pending sources, and the Untitled UI access blocker—is retained in
`manifest.json` under `sourceCatalog` and surfaced in the Sources view.

## Verified matches

| Source | Manifest components | Evidence |
| --- | --- | --- |
| MUI Material Design / `dpWgseUU58TAk7wAVl55yt` | `prim.anchor.point` / `38:37` | The `dot=yes` component is a 9×9 circular component with no child content, matching the atomic dot anchor. |
| Visual Logic Primitives / `nOEamjKEXw6oXF9Clp8PGD` | `prim.node.generic`, `prim.node.sharp`, `prim.node.pill`, `prim.node.diamond`, `prim.node.hexagon`, `prim.node.parallelogram`, `prim.node.cylinder`, `prim.edge.plain`, `prim.edge.undirected`, `prim.edge.bidirectional`, `prim.container.plain`, `kg.entity`, `kg.literal`, `kg.property-edge`, `kg.relation-edge`, `kg.subclass-edge`, `kg.group`, `wf.start-end`, `wf.task`, `wf.decision`, `wf.parallel`, `wf.data`, `wf.flow-edge`, `wf.cond-edge`, `wf.lane` | Each named FigJam shape, connector, or section resolved through the node endpoint and matched its declared semantic role. Shared diamond and hexagon primitives are deliberately used for their matching workflow counterparts. |

## Rejected legacy candidates

| Manifest component | Figma source and node | Why it cannot render the declared component |
| --- | --- | --- |
| `prim.node.round` | MUI / `86:47` | Circle icon button with a fixed chevron, not an unlabeled round node. |
| `prim.edge.plain` | MUI / `49:549` | Filled tooltip (`arrow=no`) with text content, not a line arrow. Replaced by the named shared primitive. |
| `prim.container.plain` | MUI / `523:3725` | Filled UI box with no outline stroke, not an empty outline container. Replaced by the named shared primitive. |
| `kg.class` | MUI / `31:77` | Bottom-navigation control containing three navigation items, not a class rectangle. |
| `wf.start-end` | MUI / `516:2333` | Extended action button with fixed icons, not a reusable terminator-label slot. Replaced by the named shared primitive. |
| `wf.task` | MUI / `120:1439` | Stepper control with a button indicator and descriptive text, not a task node. Replaced by the named shared primitive. |
| `wf.data` | MUI / `525:3811` | Data-grid component, not a parallelogram data artifact. Replaced by the named shared primitive. |
| `kg.entity` | Dialect / `70:4803` | 24×24 permission-identity icon, not a rounded-rectangle entity node. Replaced by the named shared primitive. |
| `kg.group` | Dialect / `70:9589` | 24×24 filter-frames icon, not a graph container. Replaced by the named shared primitive. |
| `wf.lane` | Dialect / `70:10991` | 24×24 pool icon, not a swimlane with a header slot. Replaced by the named shared primitive. |

## React-reference components still needing Figma frames

`prim.node.round` and `kg.class`.

Until suitable published Figma components exist, these entries intentionally
remain `figmaNodeId: null`, as defined by the intake protocol in `SPEC.md`.