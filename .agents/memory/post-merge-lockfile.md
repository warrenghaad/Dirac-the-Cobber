---
name: Post-merge lockfile drift
description: What to do when post-merge setup fails with ERR_PNPM_OUTDATED_LOCKFILE
---
Task-agent merges can bump a package.json dependency without updating pnpm-lock.yaml, so the post-merge script's frozen-lockfile install fails.

**Why:** The post-merge setup runs `pnpm install` in CI-like mode (frozen lockfile by default); merged branches may only carry manifest changes.

**How to apply:** On `ERR_PNPM_OUTDATED_LOCKFILE`, run `pnpm install --no-frozen-lockfile` at the repo root, then re-run post-merge setup via `runPostMergeSetup()` to confirm success.
