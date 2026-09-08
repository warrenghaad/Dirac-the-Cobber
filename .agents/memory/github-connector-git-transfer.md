---
name: GitHub connector repository transfer
description: Reliable repository transfer when connector OAuth works but shell Git authentication does not.
---

When shell Git receives an invalid injected credential but the GitHub connector has repository write permission, transfer a tracked workspace snapshot through GitHub's Git Data API: create blobs, create one tree, create a commit parented to the destination branch, then update the branch ref without force.

**Why:** A healthy OAuth connection can coexist with broken shell `GIT_ASKPASS` authentication. The connector proxy also enforces a request-per-second limit, so parallel blob creation can produce 429 responses even though authorization and payload sizes are valid.

**How to apply:** Upload blobs at a throttled rate and retry 429 responses. Preserve Git file modes in tree entries. After updating the ref, retrieve the full recursive tree and a representative source file; compare every path/blob hash and compare the retrieved file byte-for-byte before reporting success.