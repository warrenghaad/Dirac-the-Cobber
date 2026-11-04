---
name: Editable persistence schemas
description: Why browser persistence must round-trip incomplete and legacy editor states.
---

Persistence schemas for interactive editors must accept every intermediate state the UI permits, including incomplete relationships and legacy coordinates outside current layout bounds. Final-output validation should remain separate.

**Why:** A schema that only accepts finished, currently bounded output can silently classify normal drafts or older saved work as corruption and discard them during recovery.

**How to apply:** When changing editor validation or layout constraints, test that incomplete drafts and data produced by the previous editor version still parse, migrate, and reopen without loss.