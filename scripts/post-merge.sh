#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Rebuild composite lib declarations so dist/ is never stale after a merge
pnpm run typecheck:libs
