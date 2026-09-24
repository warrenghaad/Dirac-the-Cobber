import { ComponentMapping, ImportResult } from "./types";
import { Manifest } from "@workspace/wireframe-librarian";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ImportValidator {
  validateComponentMappings(
    mappings: ComponentMapping[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const ids = new Set<string>();

    for (const mapping of mappings) {
      // Check duplicate IDs
      if (ids.has(mapping.manifestComponentId)) {
        errors.push(
          `Duplicate component ID: ${mapping.manifestComponentId}`
        );
      }
      ids.add(mapping.manifestComponentId);

      // Validate axes are in range
      if (mapping.axes) {
        for (const [axis, value] of Object.entries(mapping.axes)) {
          if (value < 0 || value > 4) {
            errors.push(
              `Component ${mapping.figmaComponentName}: ${axis} out of range (0-4): ${value}`
            );
          }
        }
      }

      // Validate axes don't exceed maxAxes
      if (mapping.axes && mapping.maxAxes) {
        for (const [axis, value] of Object.entries(mapping.axes)) {
          const max = mapping.maxAxes[axis as keyof typeof mapping.maxAxes];
          if (max !== undefined && value > max) {
            errors.push(
              `Component ${mapping.figmaComponentName}: ${axis} exceeds max (${max}): ${value}`
            );
          }
        }
      }

      // Warn on components without defaults
      if (!mapping.axes) {
        warnings.push(
          `Component ${mapping.figmaComponentName}: no default axes inferred`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateManifest(manifest: Manifest): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check tokens exist
    if (!manifest.tokens) {
      errors.push("Manifest missing tokens section");
    }

    // Check components exist
    if (!manifest.components || manifest.components.length === 0) {
      errors.push("Manifest has no components");
    } else {
      const ids = new Set<string>();
      for (const comp of manifest.components) {
        if (ids.has(comp.id)) {
          errors.push(`Duplicate component ID in manifest: ${comp.id}`);
        }
        ids.add(comp.id);

        // Validate axes
        for (const [axis, value] of Object.entries(comp.axes)) {
          if (value < 0 || value > 4) {
            errors.push(
              `Component ${comp.id} ${axis} out of range: ${value}`
            );
          }
        }

        for (const [axis, value] of Object.entries(comp.maxAxes)) {
          if (value < 0 || value > 4) {
            errors.push(
              `Component ${comp.id} max${axis} out of range: ${value}`
            );
          }
        }
      }
    }

    // Check compositions if present
    if (manifest.compositions) {
      const componentIds = new Set(
        manifest.components?.map((c) => c.id) || []
      );
      for (const comp of manifest.compositions) {
        for (const slot of comp.slots) {
          if (!componentIds.has(slot.componentId)) {
            errors.push(
              `Composition ${comp.id} references missing component: ${slot.componentId}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateImportResult(result: ImportResult): ValidationResult {
    const manifestValidation = this.validateManifest(result.manifest);
    const mappingValidation = this.validateComponentMappings(
      result.componentMappings
    );

    return {
      valid:
        manifestValidation.valid && mappingValidation.valid,
      errors: [
        ...manifestValidation.errors,
        ...mappingValidation.errors,
      ],
      warnings: [
        ...manifestValidation.warnings,
        ...mappingValidation.warnings,
      ],
    };
  }
}
