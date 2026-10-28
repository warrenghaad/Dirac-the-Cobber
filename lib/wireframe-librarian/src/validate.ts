/**
 * Plan validator — enforces the SPEC §6.3 constraints:
 *   - axes within 0..4 and within each component's maxAxes
 *   - ≤ 5 distinct hues per view
 *   - ≤ 2 size steps of spread among nodes per view
 *   - at most one Tier-4 (hero) component per view
 *   - no double-encoding: each declared axis meaning is unique
 *   - edges reference existing placements
 */

import { AXIS_IDS, type DiagramPlan, type Manifest, type ValidationIssue, type ValidationReport } from "./types";

export function validatePlan(plan: DiagramPlan, manifest: Manifest): ValidationReport {
  const issues: ValidationIssue[] = [];
  const byId = new Map(manifest.components.map((c) => [c.id, c]));
  const placementIds = new Set(plan.placements.map((p) => p.id));
  const selectedLanguage = plan.visualLanguage;
  const selectedDefinition = selectedLanguage
    ? manifest.visualLanguages?.find((language) => language.id === selectedLanguage)
    : undefined;
  const declaredCompositions = new Set(plan.compositionIds ?? []);

  const compositionAllows = (componentId: string, role?: string) =>
    (manifest.compositions ?? []).some((composition) =>
      declaredCompositions.has(composition.id)
      && composition.family === "cross-family"
      && (!composition.visualLanguages?.length || composition.visualLanguages.includes(selectedLanguage!))
      && composition.slots.some((slot) =>
        slot.componentId === componentId && (!role || slot.role === role),
      ),
    );

  const hues = new Set<number>();
  const sizeLevels: number[] = [];
  let tier4Count = 0;

  for (const p of plan.placements) {
    const comp = byId.get(p.componentId);
    if (!comp) {
      issues.push({
        severity: "error",
        rule: "manifest-id",
        message: `Component "${p.componentId}" is not in the manifest`,
        placementId: p.id,
      });
      continue;
    }
    if (selectedLanguage && selectedDefinition) {
      const familyDefinition = manifest.componentFamilies?.find(
        (family) => family.id === comp.family,
      );
      const supportsLanguage =
        selectedDefinition.componentFamilies.includes(comp.family)
        && (
          comp.visualLanguages?.includes(selectedLanguage)
          ?? familyDefinition?.visualLanguages.includes(selectedLanguage)
          ?? (comp.family === "tier1" || comp.family === selectedDefinition.baseFamily)
        );
      if (!supportsLanguage && !compositionAllows(comp.id)) {
        issues.push({
          severity: "error",
          rule: "visual-language",
          message: `Component family "${comp.family}" is not compatible with visual language "${selectedLanguage}"`,
          placementId: p.id,
        });
      }
      const role = p.content.role;
      if (role) {
        const familyRoles = familyDefinition?.semanticRoles ?? comp.semanticRoles;
        const roleSupported =
          selectedDefinition.semanticRoles.includes(role)
          && (!familyRoles?.length || familyRoles.includes(role));
        if (!roleSupported && !compositionAllows(comp.id, role)) {
          issues.push({
            severity: "error",
            rule: "semantic-role",
            message: `Role "${role}" is not compatible with ${comp.family} in visual language "${selectedLanguage}"`,
            placementId: p.id,
          });
        }
      }
    }
    for (const axis of AXIS_IDS) {
      const v = p.axes[axis];
      if (!Number.isInteger(v) || v < 0 || v > 4) {
        issues.push({
          severity: "error",
          rule: "axis-range",
          message: `${axis}=${v} out of range 0..4`,
          placementId: p.id,
        });
      } else if (v > comp.maxAxes[axis]) {
        issues.push({
          severity: "error",
          rule: "max-axes",
          message: `${axis}=${v} exceeds ${p.componentId} max of ${comp.maxAxes[axis]}`,
          placementId: p.id,
        });
      }
    }
    const maxLevel = Math.max(...AXIS_IDS.map((a) => p.axes[a]));
    if (maxLevel >= 4) tier4Count += 1;

    if (p.content.hueIndex !== undefined) {
      if (p.content.hueIndex >= manifest.tokens.palette.length) {
        issues.push({
          severity: "error",
          rule: "hue-index",
          message: `hueIndex ${p.content.hueIndex} outside palette (${manifest.tokens.palette.length} hues)`,
          placementId: p.id,
        });
      }
      hues.add(p.content.hueIndex);
    }
    if (!comp.id.includes("edge") && !comp.id.includes("container") && !comp.id.includes("group") && !comp.id.includes("lane")) {
      sizeLevels.push(p.axes.a3);
    }
    for (const ref of [p.content.from, p.content.to]) {
      if (ref !== undefined && !placementIds.has(ref)) {
        issues.push({
          severity: "error",
          rule: "edge-endpoints",
          message: `Edge endpoint "${ref}" does not reference a placement id`,
          placementId: p.id,
        });
      }
    }
  }

  if (hues.size > 5) {
    issues.push({
      severity: "error",
      rule: "hue-budget",
      message: `${hues.size} distinct hues used; maximum is 5 per view`,
    });
  }
  if (sizeLevels.length > 0) {
    const spread = Math.max(...sizeLevels) - Math.min(...sizeLevels);
    if (spread > 2) {
      issues.push({
        severity: "error",
        rule: "size-spread",
        message: `Size spread of ${spread} steps; maximum is 2 per view`,
      });
    }
  }
  if (tier4Count > 1) {
    issues.push({
      severity: "error",
      rule: "one-hero",
      message: `${tier4Count} Tier-4 components; at most one hero per view`,
    });
  }

  // Double-encoding: two axes must not carry the same declared meaning.
  const meanings = Object.values(plan.axisMeanings).filter(Boolean) as string[];
  const dupes = meanings.filter((m, i) => meanings.indexOf(m) !== i);
  for (const d of [...new Set(dupes)]) {
    issues.push({
      severity: "error",
      rule: "no-double-encoding",
      message: `Meaning "${d}" is encoded on more than one axis`,
    });
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
