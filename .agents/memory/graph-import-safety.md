---
name: Non-destructive graph imports
description: Why bulk dataset import defaults to a separate workspace rather than replacing the current graph.
---

Bulk dataset imports should create a separate workspace by default, with no partial writes. Treat replacing or merging into an existing graph as a separate, explicit user choice.

**Why:** Mapping an external dataset can yield a valid graph without expressing the user's intention to discard an existing graph or its hand-edited layout. Creating a separate workspace protects that work while still letting the import become active after confirmation.

**How to apply:** Preserve this default when extending the import flow. Any future replace or merge option should explain conflicts and validate the complete result before changing existing work.
