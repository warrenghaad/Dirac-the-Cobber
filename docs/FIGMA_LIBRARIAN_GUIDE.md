# Figma Librarian: Component Library Import Guide

**Figma Librarian** is an agentic system that transforms your Figma component library into a managed, customizable design system within the Tiered Wireframe Library.

## What It Does

1. **Extracts** components, tokens, and variants from your Figma file
2. **Maps** them to a standardized manifest structure with axis-based control (5 design dimensions)
3. **Validates** the structure for consistency and correctness
4. **Stores** everything in Supabase for per-organization customization
5. **Enables** the Librarian pipeline to generate diagrams using your exact components

## Setup: Three Options

### Option 1: Use the CLI (Recommended for First Import)

**Requirements:**
- Node.js 18+ with pnpm
- Figma personal access token (generate at https://www.figma.com/developers/api#access-tokens)
- Figma file with components organized by family

**Steps:**

```bash
# 1. Get your Figma access token
# - Go to https://www.figma.com/developers/api#access-tokens
# - Create a new token
# - Copy it

# 2. Find your Figma file ID
# - Open your file in Figma
# - The URL is: figma.com/file/{FILE_ID}/...
# - Copy the FILE_ID

# 3. Run the import script
cd dirac-the-cobber
pnpm install

npx ts-node scripts/import-figma-library.ts \
  --figma-file-id YOUR_FILE_ID \
  --figma-access-token YOUR_TOKEN \
  --organization "my-org" \
  --library-name "My Design System" \
  --output ./my-library-manifest.json
```

**Output:** A `my-library-manifest.json` file with your complete manifest and component mappings.

### Option 2: Use the API Endpoint

**Requirements:**
- Running instance of the api-server
- Figma personal access token
- Your organization name

**Request:**

```bash
curl -X POST http://localhost:3000/figma/import \
  -H "Content-Type: application/json" \
  -d '{
    "figmaFileId": "YOUR_FILE_ID",
    "figmaAccessToken": "YOUR_TOKEN",
    "organization": "my-org",
    "libraryName": "My Design System"
  }'
```

**Response:**

```json
{
  "success": true,
  "organization": "my-org",
  "libraryName": "My Design System",
  "totalComponents": 42,
  "totalVariants": 128,
  "unmappedComponents": [],
  "manifest": { /* ... */ }
}
```

### Option 3: Programmatic Import

```typescript
import { FigmaExtractor, ComponentMapper, ImportValidator } from "@workspace/figma-importer";

const extractor = new FigmaExtractor({
  figmaFileId: "YOUR_FILE_ID",
  figmaAccessToken: "YOUR_TOKEN",
  organization: "my-org",
  libraryName: "My Design System",
});

const components = await extractor.extractComponents();
const tokens = await extractor.extractTokens();

const mapper = new ComponentMapper();
const mappings = await mapper.mapComponents(components, tokens);

const validator = new ImportValidator();
const validation = validator.validateComponentMappings(mappings);

if (validation.valid) {
  // Save to Supabase
}
```

## Component Organization in Figma

For best results, organize your Figma file as follows:

```
📁 Component Library
├── 📁 Tier 1 - Primitives
│   ├── Button
│   ├── Input
│   ├── Icon
│   └── Badge
├── 📁 Tier 2 - Molecules
│   ├── Form Field
│   ├── Card
│   └── Alert
├── 📁 Tier 3 - Organisms
│   ├── Header
│   ├── Sidebar
│   └── Form
└── 📁 Tier 4 - Templates
    ├── Landing Page
    └── Dashboard
```

**Component Names** should be descriptive:
- ✅ `Button - Primary`
- ✅ `Text Input - Large`
- ✅ `Entity Card - Selected`
- ❌ `B1`, `Input`, `Card A`

## Component Axes

The Librarian uses 5 design axes (A1–A5) to parameterize every component:

| Axis | Meaning | Range | Example |
|------|---------|-------|---------|
| **A1** | Shape / Semantic | 0–3 | Rectangle, Circle, Arrow |
| **A2** | Color / Class | 0–4 | Neutral, Brand, Success, Warning, Error |
| **A3** | Size | 0–4 | Small, Medium, Large, Extra-Large |
| **A4** | Stroke / Weight | 0–4 | Hairline, Thin, Regular, Bold, Extra-Bold |
| **A5** | Label Density | 0–4 | Icon-only, Label, Label+Detail, Full |

### Mapping Your Components to Axes

The importer infers axis defaults from component names and properties, but you can override them in Supabase after import:

```json
{
  "componentId": "prim.button.primary",
  "axes": {
    "a1": 0,      // semantic: single rectangular button
    "a2": 2,      // color: brand color (index 2 in palette)
    "a3": 2,      // size: medium
    "a4": 1,      // stroke: thin border
    "a5": 2       // density: label only
  },
  "maxAxes": {
    "a1": 0,      // shape cannot vary (always button)
    "a2": 4,      // can use any palette color
    "a3": 4,      // can go from small to extra-large
    "a4": 3,      // stroke up to bold
    "a5": 3       // density up to label+detail
  }
}
```

## After Import: Customization

Once imported into Supabase, each organization can:

1. **Adjust axis mappings** — change size step interpretation, color allocation
2. **Add composition templates** — define molecules, organisms for faster diagram generation
3. **Override tokens** — customize colors, strokes, sizing for brand consistency
4. **Enable/disable axes** — control which design dimensions are available

### Database Tables

All imports are stored in PostgreSQL/Supabase:

- **library_registry** — one row per organization
- **component_mapping** — maps Figma IDs to manifest component IDs
- **extracted_tokens** — organization-specific design tokens
- **import_history** — audit trail of all imports

## Using Your Library in Diagrams

Once imported, the Librarian can generate diagrams using your exact components:

```bash
curl -X POST http://localhost:3000/librarian/plan \
  -H "Content-Type: application/json" \
  -d '{
    "need": "Map an entity relationship for an HR system",
    "family": "knowledge-graph",
    "organization": "my-org"
  }'
```

The response will use your imported components, not the default Tiered Wireframe Library components.

## Troubleshooting

### "Figma API error: 401 Unauthorized"
- Check your access token is valid
- Verify you have access to the file

### "Duplicate component ID"
- Component names are not unique in your Figma file
- Rename components to be unique

### "Component axes out of range"
- The importer inferred invalid axis values
- Manually fix in Supabase after import

### "Missing components in output"
- Only components marked as COMPONENT type in Figma are extracted
- Check your Figma file has actual components, not just frames

## API Reference

### POST /figma/import

Import a Figma file into the Librarian system.

**Request Body:**
```typescript
{
  figmaFileId: string;      // From figma.com/file/{ID}/...
  figmaAccessToken: string; // From Figma API panel
  organization: string;     // Your org identifier
  libraryName?: string;     // Defaults to organization name
}
```

**Response:**
```typescript
{
  success: boolean;
  organization: string;
  libraryName: string;
  totalComponents: number;
  totalVariants: number;
  unmappedComponents: string[];
  errors?: string[];
  manifest?: Manifest;
}
```

### GET /figma/import/status/:organization

Check the status of a previous import.

**Response:**
```typescript
{
  organization: string;
  status: "pending" | "success" | "failed";
  completedAt?: string;
  errors?: string[];
}
```

## Architecture

```
Your Figma File
    ↓
[FigmaExtractor] — fetches file via Figma API
    ↓
[ComponentMapper] — maps to manifest structure
    ↓
[ImportValidator] — validates consistency
    ↓
[Manifest JSON] — stored in Supabase + library_registry
    ↓
[Librarian Pipeline] — generates diagrams using your components
```

## Advanced: Programmatic Organization Onboarding

To offer white-label Figma Librarian to multiple organizations:

```typescript
// 1. Each org provides their Figma file
const imports = await Promise.all(
  organizations.map(org => 
    fetch("/figma/import", {
      method: "POST",
      body: JSON.stringify({
        figmaFileId: org.figmaFileId,
        figmaAccessToken: org.figmaToken,
        organization: org.id,
        libraryName: org.name,
      }),
    })
  )
);

// 2. Store in org-specific Supabase schemas
for (const result of imports) {
  await supabase
    .from("library_registry")
    .insert(result.manifest);
}

// 3. Diagrams now use org-specific components
librarian.buildPlan({
  need: "...",
  organization: requestingOrg.id, // <- uses that org's library
});
```

## FAQ

**Q: Can I update the library after import?**
A: Yes. Re-run the import with the same organization name to update. Changes to component mappings are tracked in import_history.

**Q: Can organizations share components?**
A: Not yet. Each org has an isolated library. Future: cross-org composition sharing.

**Q: Do I need a Figma license for each team member?**
A: No. The import is token-based (one token per org). Diagrams render without Figma.

**Q: Can I use this offline?**
A: The importer requires Figma API access. After import, the Librarian can work entirely offline.

---

**Questions?** Check the [Tiered Wireframe Library README](../README.md) or open an issue.
