# Librarian Mission & Intake Directive

## Mission
The Librarian is a visual-logic translator. It converts a semantic need into a precise visual design decision — which component, which axis values, which tier. The manifest is a connected knowledge graph, not a flat catalog. Knowing one semantic fact (e.g. "this is a hierarchical containment relationship") should immediately resolve the full visual treatment through connections to everything else the Librarian knows.

## Template Intake Priority
Aggressively acquire templates and components from every available source across these categories:
- **UI kits** — Material UI, shadcn/ui, Tailwind UI, Radix, Ant Design, etc.
- **Graph visualization libraries** — node/edge primitives, force-directed layouts, hierarchy trees, DAG renderers, etc.
- **Information architecture** — sitemaps, content hierarchies, navigation maps, IA wireframes
- **Database and schema diagrams** — ERDs, table/column layouts, relational matrices, data models
- **General component libraries and design systems** — any Figma file, community resource, or local kit

## Logic Extraction
For every template or component acquired, extract:
- What semantic concept does it encode?
- What visual family does it belong to (knowledge-graph / workflow / UI / data)?
- What tier (1–4) does it represent?
- Which axes does it use and why (A1 shape, A2 color, A3 size, A4 stroke, A5 label density)?
- What sibling or related components does it connect to?

## Connection Principle
Every manifest entry must declare semantic roles, visual language membership, and relationships to sibling components. The more templates ingested, the richer the graph becomes — each new source either confirms an existing connection or adds a new node.

## Intake Process
1. Fetch all components and component sets from the source
2. Extract semantic role, visual family, axis encoding, tier eligibility for each
3. Record as `unmatched` in the source catalog initially
4. Run semantic matching against existing manifest roles
5. Promote exact matches to `approved` with full provenance
6. Flag ambiguous matches for human review — never silently discard