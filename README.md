# Tiered Wireframe Library

A design-logic hub where a **Librarian** — human or AI — turns a plain-language need statement into a validated, shareable wireframe diagram. Instead of drawing by hand, diagrams are *composed* from a tiered catalog of primitives (the manifest) and rendered by rules, so every diagram is consistent, auditable, and reproducible.

## Table of Contents

- [Project Purpose](#project-purpose)
- [Problems It Solves](#problems-it-solves)
- [How It Solves Them](#how-it-solves-them)
- [Librarian Logic Sequence](#librarian-logic-sequence)
- [Figma Template Guide — Three Template Types](#figma-template-guide--three-template-types)
  - [Type A — Use an Existing Template](#type-a--use-an-existing-template)
  - [Type B — Modulate an Existing Template](#type-b--modulate-an-existing-template)
  - [Type C — Create a Novel Template](#type-c--create-a-novel-template)
- [What You Need to Learn](#what-you-need-to-learn)
  - [A. The Data Model](#a-the-data-model)
  - [B. The Librarian Pipeline](#b-the-librarian-pipeline)
  - [C. Figma Concepts to Learn](#c-figma-concepts-to-learn)
  - [D. Workflow Skills for This Replit](#d-workflow-skills-for-this-replit)
- [Repository Map](#repository-map)

## Project Purpose

This project is a hub-and-spoke system for specifying, generating, validating, and sharing structured wireframe diagrams — specifically **knowledge/property graphs** and **workflow diagrams**. At the hub sits a machine-readable manifest of components, design tokens, and reusable compositions, governed by a spec that defines a tiered visual hierarchy and five independent "growth axes." A Librarian pipeline maps a described need onto that vocabulary deterministically, so the same need always produces the same diagram, and every visual choice (shape, color, size, stroke, label) is a counted, rule-checked unit of emphasis rather than a hand-drawn accident.

## Problems It Solves

- **Diagrams drift out of sync with design decisions.** Hand-drawn diagrams go stale; here, every diagram is regenerated from the manifest, so a design decision changed in one place flows to every render.
- **No repeatable, auditable method for producing consistent wireframes.** The pipeline is deterministic where it matters — the same plan request always builds the same plan, and a validator explains exactly which rule any bad plan breaks.
- **Sharing diagram "recipes" requires sharing Figma seats or proprietary assets.** Templates and results are shared as URLs and plain JSON plans that any client can render — no Figma license needed to view or reuse one.
- **LLM-generated diagrams hallucinate component IDs or violate constraints.** The LLM only extracts *structure* (nodes and edges) using a vocabulary derived from the manifest; a deterministic builder assigns all component IDs and axes, and a validator rejects anything out of bounds.
- **Figma templates are hard to parameterize or reuse programmatically.** The manifest's axis model (five 0–4 scales) gives every component a small, well-defined parameter space that Figma component variables can map onto.

## How It Solves Them

The system is a three-layer stack:

1. **Manifest** (`docs/wireframe-library/manifest.json`) — the single source of truth. It declares design tokens (ink, palette, size scale, stroke scale), the five axes and their levels, tier rules, every component with its default and maximum axis coordinates, and reusable **compositions** (molecules, organisms, templates) built from named slots. Its human-readable companion is `docs/wireframe-library/SPEC.md`.

2. **Librarian pipeline** (`lib/wireframe-librarian` + `artifacts/api-server`) — turns a plain-language need statement into a validated `DiagramPlan`. Structure extraction can be done by an LLM (when configured) or a deterministic keyword extractor; plan building and validation are always deterministic code.

3. **Multi-renderer clients** — the wireframe-library web UI (browse the catalog, generate and refine diagrams, edit templates), the mockup sandbox (React reference renders of the component sheets), and, in the future, a Figma plugin. All consume the same plan JSON, so a plan renders the same everywhere.

## Librarian Logic Sequence

The full plan-generation flow, as it exists in code today:

1. **Need statement.** The user enters a plain-language need, e.g. *"map the onboarding flow for a new SaaS user."*
2. **Classify family.** The system decides between the two diagram families — `knowledge-graph` or `workflow` — using keyword cues (`classifyFamily` in `lib/wireframe-librarian/src/librarian.ts`), or the LLM's judgment when it extracts structure. The user can also set the family explicitly.
3. **Extract structure.** If an LLM is configured, it extracts structured **nodes** and **edges** from the need statement (`artifacts/api-server/src/lib/llmExtract.ts`). The allowed node/edge *kinds* are derived directly from the librarian's component-selection tables, and anything outside them is coerced to a safe fallback — the LLM never picks component IDs. Without an LLM, a deterministic keyword extractor derives a schematic structure instead.
4. **Build the plan.** `buildPlan` deterministically maps each semantic kind to a manifest component ID, starts from that component's default axes, then spends emphasis one axis-step at a time: palette hues for class membership (A2), a single size/stroke step for the focal node (A3/A4), and label density based on the view (A5). It also emits a Tier-1 "equal consequence" draft for structure review.
5. **Validate.** `validatePlan` checks that every component ID exists in the manifest, all axes are within 0–4 and each component's declared maximums, at most 5 distinct hues are used, node sizes span at most 2 steps, edges reference real placements, at most one Tier-4 "hero" exists, and no two axes encode the same meaning.
6. **Return or reject.** A valid plan is returned to the client together with its validation report; errors surface *before* any render.
7. **Render.** The client renders the plan as SVG in the browser (or, in the future, as Figma frames via a plugin), resolving component IDs against the manifest.

## Figma Template Guide — Three Template Types

There are three ways templates enter the picture, from "pick one off the shelf" to "invent something new."

### Type A — Use an Existing Template

**What it is.** A composition already defined in `manifest.json` — a molecule, organism, or template with named slots (e.g. `tpl.simple-workflow`). The Librarian picks it by family and tier.

**What's already working.**
- Compositions are served by the API (`GET /librarian/compositions`, filterable by atomic level).
- Slot integrity is validated (every slot must reference a real component ID).
- The wireframe-library UI can browse compositions/templates and share template URLs with slot settings preserved.

**Open questions.**
- Does the Figma file referenced by each `figmaNodeId` still match the composition schema? An audit is needed — many entries are `null`, meaning the React reference render is the source of truth.
- Which compositions should surface as "starter templates" vs. advanced compositions?
- Should template selection be guided automatically by the need statement, or remain a manual Librarian choice?

**Actions you must take.**
- Audit each `figmaNodeId` in the manifest: confirm the Figma component exists and matches the slot count; mark any `null`s that need a real Figma frame.

**Path to done.** Embedding compositions in AI diagram results (an open task) plus shareable template URLs (already implemented).

### Type B — Modulate an Existing Template

**What it is.** Start from a composition and override individual slot components or axis values — for example, change a tint from neutral to brand, or bump one node's size tier — without rebuilding the whole plan.

**What's already working.**
- A template editor page exists; slot axis editing is partially wired.
- URL sharing preserves slot state (already implemented).

**Open questions.**
- Which axes are per-slot vs. per-diagram? (A2 color and A3 size are currently per-node; A1 shape is a property of the component itself.)
- What does a "modulation diff" look like in the plan JSON — stored as overrides, or as a full new plan?
- Should modulation produce a fork in the manifest (a new composition ID) or stay a runtime overlay?
- Does the Figma template support component-property overrides (Figma variables), or is it static?

**Actions you must take.**
- Decide whether modulated templates should be saveable back to the manifest or stay session-only.
- Define the Figma variable set that maps to the A1–A5 axes.

**Path to done.** Preserving family/view settings through refinement (an open task) is a prerequisite; after that, a new task for axis-override persistence.

### Type C — Create a Novel Template

**What it is.** A brand-new composition that doesn't exist in the manifest — built by describing an unfilled need, iterating with the Librarian, and optionally *promoting* the result into the manifest as a reusable composition.

**What's already working.**
- Plan generation and refinement work end-to-end: enter a need, get a rendered diagram, refine it with follow-up instructions.
- Sharing a generated-result link is planned (an open task).

**Open questions.**
- What is the promotion flow — how does a novel diagram become a reusable composition in `manifest.json`?
- What metadata does a new composition entry require: name, tier, family, slot count, Figma frame?
- Who has write access to the manifest in production — only developers, or can the Librarian UI propose additions?
- If Figma becomes the canonical renderer, what does the Figma plugin need to read from the plan JSON to create frames automatically?
- How does a Figma component variable set map to A1–A5 axes for novel nodes?

**Actions you must take.**
- Define the "composition promotion" UX (button, form, or CLI?).
- Create a Figma component library with variables matching A1–A5 so generated plans can be auto-applied.
- Decide on access control for manifest writes.

**Path to done.** Requires compositions in AI results and shareable result links (both open tasks), plus a new task for manifest promotion.

## What You Need to Learn

This section is for the product owner who is not a daily TypeScript developer. None of it requires writing code — it's about understanding the system well enough to direct it confidently.

### A. The Data Model

- Read `docs/wireframe-library/SPEC.md` top to bottom. It defines every term you'll encounter: **tier**, **axis**, **family**, **slot**, **emphasis**. It's short and written to be read.
- Understand the five axes and what each one *means*:
  - **A1 shape** — how much the silhouette encodes category
  - **A2 color** — chromatic differentiation (mono ink → full semantic color)
  - **A3 size** — footprint on a ×1.25 modular scale
  - **A4 stroke** — border weight and dash style
  - **A5 label** — from no text to a full property table
- The key invariant: `max(axes) ≤ tier`. A component's tier caps how visually loud it may get. Tier 1 primitives are locked to an "equal consequence" profile so choosing among them never accidentally creates hierarchy.
- Study a few entries in `manifest.json`. Each component has an `id`, `tier`, default `axes`, `maxAxes`, and optionally a `figmaNodeId`. Compositions link component IDs into named slots:

```json
{
  "id": "mol.task-card",
  "atomicLevel": "molecule",
  "family": "tier1",
  "slots": [
    { "componentId": "prim.node.generic", "role": "container", "position": { "x": 0.5, "y": 0.5 } },
    { "componentId": "prim.anchor.point", "role": "status-badge", "position": { "x": 0.85, "y": 0.15 } }
  ]
}
```

### B. The Librarian Pipeline

- Trace a single request in your head: **need statement → classify → LLM extract → buildPlan → validate → render.**
- Know which steps are **deterministic** (`buildPlan`, `validatePlan` — same input, same output, always) and which is **probabilistic** (LLM extraction). This tells you where errors come from: a wrong *structure* usually means the extraction misread your need; a *validation error* means a rule was violated and the message names the rule.
- The API is the contract; the UI is just one client. Figma will be another. Anything that consumes plan JSON can render diagrams.

### C. Figma Concepts to Learn

- **Component properties and variables** — how to parameterize one master component so it can express multiple axis states (color, size, stroke) without duplicating frames. This is the bridge between the A1–A5 axis model and Figma.
- **Auto-layout** — how Figma arranges nested frames. The manifest's slot model maps to Figma's nested component tree.
- **REST API / plugin API** — the Figma REST API can read and write nodes by `figmaNodeId`; a plugin runs *inside* Figma and can consume Librarian plan JSON to create frames automatically.
- **Library publishing** — how to publish a Figma component library so other files can instance it. This matters for the "use an existing template" flow.

### D. Workflow Skills for This Replit

- **Reading task plans.** Each task in this project has a plan describing what will change and why. Read the "What & Why" and "Done looks like" sections before approving — they're written for you.
- **Using the wireframe-library UI daily.** It is the Librarian's primary tool: browse the component library, explore compositions and templates, generate diagrams from need statements, refine them, and share them via URL.
- **Editing `manifest.json` safely.** Add a component or composition entry, then run the validation workflow (`manifest` — it runs the schema check) and confirm the API serves the updated manifest without errors. Never hand-type axis values above a component's tier.
- **Writing a good need statement.** Include family keywords (*workflow*, *process*, *steps* — or *map*, *entities*, *relationships*), name the key concepts you want as nodes, and state the audience or goal. Compare: *"onboarding"* vs. *"map the onboarding workflow for a new SaaS user: sign up, verify email, then choose a plan."* The second reliably produces the diagram you meant.
- **Git basics.** Learn branching, pull requests, and how to review a task's changes before they merge. You don't need to write code to read a diff — the file names alone tell you what a change touches.

## Repository Map

```
docs/wireframe-library/     SPEC.md, manifest.json, manifest.schema.json — the hub
lib/wireframe-librarian/    Deterministic librarian: types, buildPlan, validatePlan
artifacts/api-server/       Express API: /librarian/* endpoints, LLM extraction/refinement
artifacts/wireframe-library/  Web UI: library browser, template editor, diagram generator
artifacts/mockup-sandbox/   React reference renders (source of truth for null figmaNodeIds)
```
