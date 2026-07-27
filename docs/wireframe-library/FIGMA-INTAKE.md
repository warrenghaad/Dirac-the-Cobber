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
# 1. Generate a Personal Access Token at:
#    figma.com → Settings → Security → Personal access tokens
#    (read access to Files is sufficient)

# 2. Set the secret:
#    Add FIGMA_ACCESS_TOKEN to Replit Secrets (or export it in the shell for a one-off run)

# 3. Run:
FIGMA_ACCESS_TOKEN=<token> node scripts/figma-intake.js
```

## Adding more source files

Edit the `figmaSources` array in `docs/wireframe-library/manifest.json`:

```jsonc
{
  "fileKey": "<key from Figma URL>",
  "url": "https://www.figma.com/design/<key>/...",
  "kind": "design",          // "design" or "figjam"
  "label": "Human-readable label",
  "intakeStatus": "pending — FIGMA_ACCESS_TOKEN required",
  "addedAt": "YYYY-MM-DD"
}
```

Then re-run the intake script.

## Tuning the matching heuristics

The script maps manifest IDs to keyword lists (`SHAPE_HINTS` in
`scripts/figma-intake.js`). If your Figma component names don't match, add
keywords to the relevant entry. First-file-wins: if two source files both
have a matching component for the same manifest ID, the one listed first in
`figmaSources` takes priority.

## Current sources

| File key | Label | Status |
|----------|-------|--------|
| `fxyEtWUCgZrA2MsraKSjKe` | Figma Draw Playground (Community) | pending |
| `jVY2CNS79i0bsdrVgC5Bfs` | Mindmap (Community FigJam) | pending |

All 20 manifest components currently have `figmaNodeId: null` — the React
reference set is the source of truth until the intake script is run
successfully.
