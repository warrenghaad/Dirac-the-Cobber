/**
 * CLI tool to import a Figma component library into the Librarian system
 * Usage: npx ts-node scripts/import-figma-library.ts --figma-file-id <ID> --org <NAME> --supabase-url <URL> --supabase-key <KEY>
 */

import * as fs from "fs";
import * as path from "path";
import { FigmaExtractor, ComponentMapper, ImportValidator } from "@workspace/figma-importer";
import { Manifest } from "@workspace/wireframe-librarian";

interface CliArgs {
  figmaFileId: string;
  figmaAccessToken: string;
  organization: string;
  libraryName?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  output?: string;
}

function parseArgs(): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = process.argv[i + 1];
      if (value && !value.startsWith("--")) {
        args[key] = value;
        i++;
      }
    }
  }

  const required = ["figmaFileId", "figmaAccessToken", "organization"];
  for (const key of required) {
    const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    if (!args[kebabKey]) {
      console.error(`Missing required argument: --${kebabKey}`);
      process.exit(1);
    }
  }

  return {
    figmaFileId: args["figma-file-id"],
    figmaAccessToken: args["figma-access-token"],
    organization: args.organization,
    libraryName: args["library-name"],
    supabaseUrl: args["supabase-url"],
    supabaseKey: args["supabase-key"],
    output: args.output || "./imported-library.json",
  };
}

async function main() {
  const cli = parseArgs();

  console.log("🎨 Figma Librarian Import Tool");
  console.log(`Organization: ${cli.organization}`);
  console.log(`Library: ${cli.libraryName || cli.organization}`);
  console.log("");

  try {
    // Step 1: Extract from Figma
    console.log("📥 Fetching components from Figma...");
    const extractor = new FigmaExtractor({
      figmaFileId: cli.figmaFileId,
      figmaAccessToken: cli.figmaAccessToken,
      organization: cli.organization,
      libraryName: cli.libraryName || cli.organization,
    });

    const figmaComponents = await extractor.extractComponents();
    const tokens = await extractor.extractTokens();
    console.log(`   ✓ Found ${figmaComponents.length} components`);

    // Step 2: Map to manifest structure
    console.log("🔄 Mapping components to manifest...");
    const mapper = new ComponentMapper();
    const componentMappings = await mapper.mapComponents(figmaComponents, tokens);
    console.log(`   ✓ Mapped ${componentMappings.length} components`);

    // Step 3: Validate
    console.log("✅ Validating mappings...");
    const validator = new ImportValidator();
    const validation = validator.validateComponentMappings(componentMappings);

    if (!validation.valid) {
      console.error("❌ Validation failed:");
      for (const error of validation.errors) {
        console.error(`   - ${error}`);
      }
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      console.log("⚠️  Warnings:");
      for (const warning of validation.warnings) {
        console.log(`   - ${warning}`);
      }
    }

    // Step 4: Build manifest
    console.log("📚 Building manifest...");
    const manifest: Manifest = {
      name: cli.libraryName || cli.organization,
      version: "1.0.0",
      tokens: {
        ink: "#000000",
        paper: "#ffffff",
        accent: "#0066cc",
        palette: Object.values(tokens.colors).slice(0, 5),
        tintSteps: [0.1, 0.2, 0.3, 0.4, 0.5],
        sizeScale: {
          widths: Object.values(tokens.sizes)
            .sort((a, b) => a - b)
            .slice(0, 10),
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
        figmaNodeId: mapping.figmaComponentId || null,
      })),
    };

    const manifestValidation = validator.validateManifest(manifest);
    if (!manifestValidation.valid) {
      console.error("❌ Manifest validation failed:");
      for (const error of manifestValidation.errors) {
        console.error(`   - ${error}`);
      }
      process.exit(1);
    }
    console.log("   ✓ Manifest valid");

    // Step 5: Save or upload
    console.log("💾 Saving manifest...");
    const output = path.resolve(cli.output);
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          organization: cli.organization,
          libraryName: cli.libraryName || cli.organization,
          figmaFileId: cli.figmaFileId,
          timestamp: new Date().toISOString(),
          manifest,
          componentMappings,
          metadata: {
            totalComponents: figmaComponents.length,
            totalVariants: componentMappings.reduce(
              (sum, c) => sum + (c.variants?.length || 0),
              0
            ),
          },
        },
        null,
        2
      )
    );
    console.log(`   ✓ Saved to ${output}`);

    if (cli.supabaseUrl && cli.supabaseKey) {
      console.log("📤 Uploading to Supabase...");
      console.log("   (Not yet implemented - upload manually for now)");
    }

    console.log("");
    console.log("✨ Import complete!");
    console.log(
      `Next: Upload the manifest to your Supabase instance or use the API endpoint.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error:", message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
