# Project: Tiered Wireframe Library (design-logic hub)

Hub-and-spoke system where LLM agents auto-design knowledge/property graphs and workflow diagrams.

## Structure
- `docs/wireframe-library/SPEC.md` — tiers, five growth axes (A1 shape, A2 color, A3 size, A4 stroke, A5 labels), librarian selection rules. v0.1.0
- `docs/wireframe-library/manifest.json` (+ `manifest.schema.json`) — machine-readable component manifest for LLM consumption; `figmaNodeId: null` means the React reference render is source of truth.
- `artifacts/mockup-sandbox/src/components/mockups/wireframe-library/` — React reference sheets (TierLadder, GrowthAxes, KnowledgeGraphExample, WorkflowExample) rendered on the canvas.

## Core design logic
Tier 1 primitives are equal-consequence (S2 size, mono ink, W1 stroke, no label); complexity grows along parallel, independent, linear axes so a semi-autonomous "librarian" can map need → tier → axis coordinates deterministically. Invariant: `max(axes) ≤ tier` (checked ad hoc via node script against manifest).

## User preferences
- User has full dev-org Figma privileges; Figma MCP is configured. Figma component intake is a planned follow-up (needs file URL from user).
- Future spokes (out of scope for now): librarian runtime agent, GeoGebra/Wolfram/data-viz vocabularies.
