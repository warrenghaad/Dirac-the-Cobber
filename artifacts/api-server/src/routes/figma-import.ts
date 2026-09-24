import { Router, type IRouter } from "express";
import { FigmaExtractor } from "@workspace/figma-importer";
import { ComponentMapper } from "@workspace/figma-importer";
import { ImportValidator } from "@workspace/figma-importer";
import { Manifest } from "@workspace/wireframe-librarian";

const router: IRouter = Router();

interface ImportRequest {
  figmaFileId: string;
  figmaAccessToken: string;
  organization: string;
  libraryName: string;
}

interface ImportResponse {
  success: boolean;
  organization: string;
  libraryName: string;
  totalComponents: number;
  totalVariants: number;
  unmappedComponents: string[];
  errors?: string[];
  manifest?: Manifest;
}

router.post("/figma/import", async (req, res) => {
  try {
    const { figmaFileId, figmaAccessToken, organization, libraryName } =
      req.body as ImportRequest;

    if (!figmaFileId || !figmaAccessToken || !organization) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: figmaFileId, figmaAccessToken, organization",
      });
      return;
    }

    // Extract components from Figma
    const extractor = new FigmaExtractor({
      figmaFileId,
      figmaAccessToken,
      organization,
      libraryName: libraryName || organization,
    });

    const figmaComponents = await extractor.extractComponents();
    const tokens = await extractor.extractTokens();

    // Map Figma components to manifest structure
    const mapper = new ComponentMapper();
    const componentMappings = await mapper.mapComponents(figmaComponents, tokens);

    // Validate
    const validator = new ImportValidator();
    const validation = validator.validateComponentMappings(componentMappings);

    if (!validation.valid) {
      res.status(400).json({
        success: false,
        organization,
        libraryName,
        totalComponents: figmaComponents.length,
        totalVariants: 0,
        unmappedComponents: figmaComponents.map((c) => c.name),
        errors: validation.errors,
      } as ImportResponse);
      return;
    }

    // Build manifest
    const manifest: Manifest = {
      name: libraryName || organization,
      version: "1.0.0",
      tokens: {
        ink: "#000000",
        paper: "#ffffff",
        accent: "#0066cc",
        palette: Object.values(tokens.colors).slice(0, 5),
        tintSteps: [0.1, 0.2, 0.3, 0.4, 0.5],
        sizeScale: {
          widths: Object.values(tokens.sizes).sort((a, b) => a - b),
          aspect: 1,
          ratio: 1.25,
        },
        strokeScale: Object.values(tokens.strokes).sort((a, b) => a - b),
        dashVocabulary: {},
      },
      components: componentMappings.map((mapping) => ({
        id: mapping.manifestComponentId,
        family: mapping.family,
        tier: mapping.tier,
        shape: mapping.shape,
        axes: mapping.axes || { a1: 0, a2: 0, a3: 2, a4: 0, a5: 1 },
        maxAxes: mapping.maxAxes || { a1: 3, a2: 4, a3: 4, a4: 4, a5: 4 },
        figmaNodeId: mapping.figmaComponentId,
      })),
    };

    // Validate final manifest
    const manifestValidation = validator.validateManifest(manifest);
    if (!manifestValidation.valid) {
      res.status(400).json({
        success: false,
        organization,
        libraryName,
        totalComponents: figmaComponents.length,
        totalVariants: 0,
        unmappedComponents: [],
        errors: manifestValidation.errors,
      } as ImportResponse);
      return;
    }

    res.json({
      success: true,
      organization,
      libraryName,
      totalComponents: figmaComponents.length,
      totalVariants: componentMappings.reduce((sum, c) => sum + (c.variants?.length || 0), 0),
      unmappedComponents: [],
      manifest,
    } as ImportResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      success: false,
      organization: (req.body as ImportRequest).organization || "unknown",
      libraryName: (req.body as ImportRequest).libraryName || "unknown",
      totalComponents: 0,
      totalVariants: 0,
      unmappedComponents: [],
      errors: [message],
    } as ImportResponse);
  }
});

router.get("/figma/import/status/:organization", (req, res) => {
  // TODO: Get import status from Supabase
  res.json({
    organization: req.params.organization,
    status: "pending",
  });
});

export default router;
