---
name: Nested pnpm arguments
description: Argument forwarding behavior for root scripts that invoke filtered workspace scripts
---

When a root pnpm script wraps another workspace script, the conventional `--`
argument separator can be forwarded into the nested command rather than being
consumed by pnpm.

**Why:** A CLI that rejects a standalone separator makes documented commands
such as `pnpm run script -- --json` fail only when invoked through the root
wrapper.

**How to apply:** Treat a standalone `--` as an argument boundary and ignore it
in small CLI parsers used behind root package-script wrappers.