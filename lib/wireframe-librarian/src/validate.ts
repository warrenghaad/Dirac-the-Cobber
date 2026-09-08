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
