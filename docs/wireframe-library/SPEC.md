# Tiered Wireframe Library — Design Logic Spec

Version 0.1.0 · Machine-readable companion: `manifest.json` (same directory)

## 1. Purpose

This spec is the "design logic" hub for a hub-and-spoke system in which LLM agents
(the **librarian** and its spokes) auto-design **knowledge/property graphs** and
**workflow diagrams** from a conversation about user need. It defines:

1. A **tiered visual hierarchy** whose Tier 1 primitives are *equal-consequence*:
   one general shape, one ink color, uniform weight — so a selector's choice among
   them carries no unintended emphasis.
2. **Parallel growth axes**: complexity is added along independent, *linear* axes
   (shape semantics, color, size, stroke, label density). Axes never grow
   hyperbolically or in lockstep; each step on an axis adds exactly one unit of
   visual consequence, which makes composition predictable and reversible.
3. **Librarian selection rules** mapping need → tier → axis coordinates.

## 2. Core principle: equal consequence, parallel linear growth

- **Equal consequence (Tier 1).** Every Tier 1 primitive renders with the same
  footprint (S2 size), the same ink (`ink.900`), the same stroke (W1, solid), and
  no label. Swapping one Tier 1 primitive for another changes *identity only*,
  never emphasis. This is what makes a semi-autonomous selector safe: it can pick
  any primitive without accidentally creating hierarchy.
- **Parallel axes.** Each axis is an ordered scale `0..4`. Axes are orthogonal:
  changing color level never changes size; changing size never changes stroke.
- **Linearity.** Perceptual steps are approximately equal along each axis
  (size uses a modular ×1.25 scale; color uses evenly spaced lightness steps;
  stroke adds one weight or dash step per level). Hierarchy therefore reads as *counted units of
  emphasis*, summed across axes.
- **Emphasis budget.** A component's total consequence is
  `E = a1 + a2 + a3 + a4 + a5` (its axis coordinate sum). The librarian assigns
  emphasis budgets to semantic roles and spends them one axis-step at a time,
  preferring to raise *different* axes for *different* meanings (see §6.3).

## 3. Axes

| Axis | Id | Meaning | Levels (0 → 4) |
|------|----|---------|----------------|
| Shape semantics | `A1` | How much the silhouette encodes category | 0 rounded-rect (generic) · 1 role family (rect/ellipse) · 2 category shapes (diamond, pill, hexagon) · 3 compound (badge, port markers) · 4 pictographic/iconic |
| Color | `A2` | Chromatic differentiation | 0 mono ink · 1 one accent hue · 2 categorical palette (≤5 hues) · 3 palette + tints for sub-class · 4 full semantic color coding incl. state colors |
| Size | `A3` | Footprint on modular scale | S0 64×40 · S1 80×50 · S2 100×62 (base) · S3 125×78 · S4 156×97 (each step ×1.25) |
| Stroke & line | `A4` | Border/edge weight and style | 0 W1 solid 1px · 1 W2 2px · 2 W2 + dashed · 3 W3 + full dash vocabulary (dash/dot) · 4 W4 4px + dash + double |
| Label density | `A5` | Text carried by the component | 0 none · 1 name · 2 name + type tag · 3 name + type + key properties · 4 full property table |

Canonical values (`tokens` in manifest): ink `#1A1D23`; accent `#2563EB`;
categorical palette `[#2563EB, #D97706, #059669, #7C3AED, #DC2626]`;
size scale `[64, 80, 100, 125, 156]` widths with 0.62 aspect; strokes `[1,2,3,4]`px.

## 4. Tiers

A **tier** is the maximum axis level a component may use: Tier *n* ⇔ `max(a1..a5) ≤ n`, with Tier 1 additionally pinned to the equal-consequence profile.

- **Tier 1 — Primitives (equal consequence).** Profile locked at
  `A1≤1, A2=0, A3=2, A4=0, A5=0`. Vocabulary: `node.generic`, `node.round`,
  `edge.plain`, `container.plain`, `anchor.point`.
- **Tier 2 — Categorical.** One or two axes raised to 2. Introduces category
  shapes, the categorical palette, name labels, and the dash vocabulary's first
  step. This is the default working tier for finished diagrams.
- **Tier 3 — Differentiated.** Up to three axes at 3. Sub-class tints, property
  labels, compound shapes (type badges, ports).
- **Tier 4 — Expressive.** Reserved for focal elements only; at most one
  component per view may sit at Tier 4 (the "one hero" rule).

## 5. Vocabulary

### 5.1 Knowledge / property graphs

| Component | Base shape (A1 target) | Role |
|-----------|------------------------|------|
| `kg.entity` | rounded-rect | Entity / resource node |
| `kg.class` | rectangle, W2 stroke | Class / type node |
| `kg.literal` | ellipse | Literal value |
| `kg.property-edge` | solid arrow, label at midpoint | Property (labeled, directed) |
| `kg.relation-edge` | solid arrow, hue by relation family | Relation between entities |
| `kg.subclass-edge` | dashed arrow | `subClassOf` / `instanceOf` |
| `kg.group` | container, no fill | Namespace / subgraph |

### 5.2 Workflows

| Component | Base shape (A1 target) | Role |
|-----------|------------------------|------|
| `wf.start-end` | pill | Terminator |
| `wf.task` | rounded-rect | Activity / step |
| `wf.decision` | diamond | Branch point |
| `wf.parallel` | hexagon | Fork/join gateway |
| `wf.data` | trapezoid/parallelogram | Data artifact |
| `wf.flow-edge` | solid arrow | Sequence flow |
| `wf.cond-edge` | solid arrow + guard label | Conditional flow |
| `wf.lane` | container with header | Swimlane / owner |

### 5.3 Coordinates

Every vocabulary item's default and maximum axis coordinates are declared in
`manifest.json` as `{ id, family, tier, axes: {a1,a2,a3,a4,a5}, maxAxes, figmaNodeId? }`.
`figmaNodeId` is populated during Figma intake; `null` means the React reference
render in the mockup sandbox is the source of truth.

## 6. Librarian selection rules (need → tier → axes)

The librarian converts a user-need conversation into a **diagram plan** with this
procedure:

### 6.1 Classify
1. Detect diagram family: entities-with-relations → `kg.*`; steps-with-order →
   `wf.*`. Mixed needs split into linked views, never mixed vocabularies.
2. Extract the semantic roles present (e.g., 3 entity classes, 2 relation
   families, 1 focal entity).

### 6.2 Start at Tier 1
Draft the topology entirely with Tier 1 primitives (equal consequence). This
draft is the layout/HITL checkpoint: humans or agents review *structure* before
any emphasis exists.

### 6.3 Spend emphasis one axis-step at a time
Apply in priority order, raising a **different axis per distinct meaning**:
1. **Category → A1** (shape): one silhouette per role family.
2. **Class membership → A2** (color): one hue per class, tints for sub-class.
3. **Importance/degree → A3** (size): map centrality or focus to S-steps;
   never more than 2 size steps apart in one view.
4. **Edge kind → A4** (stroke/dash): solid = primary relation, dashed =
   derived/taxonomic, weight = strength.
5. **Information need → A5** (labels): raise only as far as the reading
   distance requires; property tables (A5=4) only in detail views.

Constraints: never encode the *same* meaning on two axes (redundancy is allowed
only for accessibility, and must be declared); never skip a level on an axis;
total per-view distinct hues ≤ 5; one Tier 4 hero max.

### 6.4 Emit
Output the diagram plan as a list of `{ componentId, axes, content }` placements
referencing manifest ids — renderable by any spoke (React, Figma, canvas).

## 7. Figma intake protocol

For each component pulled from the user's Figma library: catalog it, screenshot
it, assign its manifest id and axis coordinates, and record `figmaNodeId` +
`fileKey`. A Figma component may only be admitted to Tier 1 if it can render in
the locked equal-consequence profile; otherwise it enters at its measured tier.
Gaps (ids with `figmaNodeId: null`) are served by the React reference set in
`artifacts/mockup-sandbox/src/components/mockups/wireframe-library/`.

## 8. Out of scope (this version)

Librarian runtime, data-visualization vocabulary (charts / GeoGebra / Wolfram
spokes), HITL orchestration tooling.
