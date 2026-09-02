---
name: Source catalog offline mirror
description: Keeps the complete source baseline available during API outages without putting it in the initial web bundle.
---

The canonical wireframe source catalog is deliberately stored separately from
the small renderer manifest and mirrored as a separate, lazily loaded browser
asset. The normal manifest exposes only catalog summary metadata; catalog API
routes page assets by source, while the Sources view can still recover the
complete baseline if the API is unavailable.

**Why:** A complete Figma inventory can be very large; embedding it in the
initial application bundle hurts ordinary library and planner usage, but omitting
it from the fallback makes source coverage disappear exactly when users need to
audit an API failure.

**How to apply:** Keep the generated offline catalog semantically identical to
the canonical full catalog and retain validation that rejects mirror drift.
Keep the normal manifest free of the full asset inventory, and load source
summary/asset pages only from the Sources experience; do not substitute an
aggregate-only summary for the reviewable source inventory.