---
name: Large GitHub blob transfers
description: Safe handling of repository snapshots containing files rejected by GitHub API request-size limits.
---

The GitHub Git Data REST API can reject a blob payload that is smaller than its documented blob-size ceiling because the full request body exceeds an API or connector limit. UTF-8 encoding may still fail where base64 does. Do not omit, truncate, or reformat a required application data file just to make the transfer fit.

**Why:** Large catalogs can be runtime inputs and validation sources, so an incomplete snapshot may look published while failing builds or losing offline data. The GitHub connector may work for ordinary blobs while rejecting a single large one.

**How to apply:** Confirm the exact rejected payload and preserve the verified snapshot. Prefer a working authenticated Git push; consider Git LFS only when the repository already supports it and the complete object can be uploaded and verified. Otherwise stop before creating the branch and ask for a working Git push path.
