---
name: API codegen exports
description: Orval regeneration can duplicate API Zod barrel exports in this workspace.
---

After regenerating the API client and Zod schemas, inspect `lib/api-zod/src/index.ts` for repeated exports of the generated API and types barrels.

**Why:** The generator can append these exports even when the barrel already contains them. Duplicate exports may cause TypeScript conflicts when an operation name overlaps a generated response type.

**How to apply:** Run the normal codegen command first, then remove only redundant barrel-export lines before the final library typecheck. Keep hand-authored exports intact.