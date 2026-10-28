/**
 * Validates docs/wireframe-library/manifest.json against:
 *  1. manifest.schema.json (JSON Schema draft-07 via Ajv)
 *  2. Tier/profile invariants:
 *     - every component: max(axes values) <= tier rule cap (tier N => axis level <= N-? see below)
 *       Concretely: max(component.axes) <= tier (axis levels are 0-based, tiers 1-4;
 *       tier rule per spec: a component of tier T may not have any current axis level > T)
 *     - axes[i] <= maxAxes[i] for every axis
 *     - Tier-1 components match the locked equal-consequence profile from tiers[tier=1].profile
 *  3. Token mirror consistency with the React token sheet
 *     (artifacts/mockup-sandbox/src/components/mockups/wireframe-library/_shared/tokens.tsx)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "docs/wireframe-library/manifest.json");
const schemaPath = path.join(root, "docs/wireframe-library/manifest.schema.json");
const catalogPath = path.join(root, "docs/wireframe-library/source-catalog.json");
const artifactCatalogPath = path.join(root, "artifacts/wireframe-library/src/lib/source-catalog.json");
const tokensPath = path.join(
  root,
  "artifacts/mockup-sandbox/src/components/mockups/wireframe-library/_shared/tokens.tsx",
);

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

// ---------- 1. JSON Schema validation ----------
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  for (const e of validate.errors ?? []) {
    fail(`schema: ${e.instancePath || "/"} ${e.message}`);
  }
}

// ---------- 2. Tier/profile invariants ----------
type AxisId = "a1" | "a2" | "a3" | "a4" | "a5";
const AXIS_IDS: AxisId[] = ["a1", "a2", "a3", "a4", "a5"];

interface Component {
  id: string;
  tier: number;
  axes: Record<AxisId, number>;
  maxAxes: Record<AxisId, number>;
  figmaNodeId: string | null;
  fileKey?: string | null;
}

const components: Component[] = manifest.components ?? [];
const sourceKeys = new Set((manifest.figmaSources ?? []).map((source: { fileKey: string }) => source.fileKey));

for (const c of components) {
  const hasNode = c.figmaNodeId !== null && c.figmaNodeId !== undefined;
  const hasFile = c.fileKey !== null && c.fileKey !== undefined;
  if (hasNode !== hasFile) {
    fail(`figma-reference: ${c.id} must provide figmaNodeId and fileKey together`);
  } else if (hasFile && !sourceKeys.has(c.fileKey as string)) {
    fail(`figma-reference: ${c.id} references unknown figmaSources fileKey ${c.fileKey}`);
  }
}

// ---------- 2b. Source catalog integrity ----------
// The baseline is intentionally broader than renderer-ready components. These
// checks make gaps, permissions, and local-token provenance explicit rather
// than allowing the intake path to omit unfamiliar source material.
const runtimeCatalog = manifest.sourceCatalog;
const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : undefined;
if (catalog) {
  const sourceIds = new Set<string>();
  const assetIds = new Set<string>();
  const templateIds = new Set<string>();
  const catalogSources = new Map<string, any>();
  const catalogAssets = new Map<string, any>();
  const derivedCoverageBySource = new Map<string, { approved: number; unmatched: number; excluded: number; blocked: number }>();
  const inspectableCoverage = (coverage: any) =>
    coverage.approved + coverage.unmatched + coverage.excluded;

  for (const source of catalog.sources ?? []) {
    if (sourceIds.has(source.id)) fail(`source-catalog: duplicate source id ${source.id}`);
    sourceIds.add(source.id);
    catalogSources.set(source.id, source);

    if (inspectableCoverage(source.coverage) !== source.coverage.total) {
      fail(`source-catalog: ${source.id} coverage total must equal approved + unmatched + excluded`);
    }
    if ((source.status === "inaccessible" || source.status === "pending-registration") && !source.accessNote) {
      fail(`source-catalog: ${source.id} must explain why it cannot be inspected`);
    }
    if (source.status === "local-only" && !source.provenance?.localPath) {
      fail(`source-catalog: local-only source ${source.id} must preserve a localPath`);
    }
  }

  for (const asset of catalog.assets ?? []) {
    if (assetIds.has(asset.id)) fail(`source-catalog: duplicate asset id ${asset.id}`);
    assetIds.add(asset.id);
    catalogAssets.set(asset.id, asset);
    if (!catalogSources.has(asset.sourceId)) {
      fail(`source-catalog: asset ${asset.id} references unknown source ${asset.sourceId}`);
    }
    if (asset.provenance?.sourceId && asset.provenance.sourceId !== asset.sourceId) {
      fail(`source-catalog: asset ${asset.id} provenance sourceId must match its sourceId`);
    }
    if (asset.assetType === "token-bundle" && asset.provenance?.localPath) {
      const tokenPath = path.join(root, asset.provenance.localPath);
      if (!existsSync(tokenPath)) fail(`source-catalog: token bundle ${asset.id} localPath does not exist: ${asset.provenance.localPath}`);
    }
    if (asset.mappingStatus === "blocked" && catalogSources.get(asset.sourceId)?.status !== "inaccessible") {
      fail(`source-catalog: blocked asset ${asset.id} must belong to an inaccessible source`);
    }
    const derived = derivedCoverageBySource.get(asset.sourceId) ?? { approved: 0, unmatched: 0, excluded: 0, blocked: 0 };
    if (asset.mappingStatus in derived) derived[asset.mappingStatus as keyof typeof derived] += 1;
    derivedCoverageBySource.set(asset.sourceId, derived);
  }

  for (const source of catalog.sources ?? []) {
    const derived = derivedCoverageBySource.get(source.id) ?? { approved: 0, unmatched: 0, excluded: 0, blocked: 0 };
    if (
      derived.approved !== source.coverage.approved ||
      derived.unmatched !== source.coverage.unmatched ||
      derived.excluded !== source.coverage.excluded
    ) {
      fail(
        `source-catalog: ${source.id} coverage is not backed by its catalog assets ` +
          `(expected ${derived.approved}/${derived.unmatched}/${derived.excluded}, got ${source.coverage.approved}/${source.coverage.unmatched}/${source.coverage.excluded})`,
      );
    }
    if (derived.blocked > source.coverage.blocked) {
      fail(`source-catalog: ${source.id} has more blocked assets than its declared access blockers`);
    }
  }

  for (const candidate of catalog.templateCandidates ?? []) {
    if (templateIds.has(candidate.id)) fail(`source-catalog: duplicate template candidate id ${candidate.id}`);
    templateIds.add(candidate.id);
    if (!catalogSources.has(candidate.sourceId)) {
      fail(`source-catalog: template candidate ${candidate.id} references unknown source ${candidate.sourceId}`);
    }
  }

  for (const mapping of catalog.mappings ?? []) {
    if (!catalogAssets.has(mapping.assetId)) {
      fail(`source-catalog: mapping references unknown asset ${mapping.assetId}`);
    }
    if (mapping.status === "approved" && mapping.targetType === "component" && !components.some((component) => component.id === mapping.targetId)) {
      fail(`source-catalog: approved component mapping ${mapping.assetId} references unknown component ${mapping.targetId}`);
    }
  }

  if (inspectableCoverage(catalog.coverage) !== catalog.coverage.total) {
    fail("source-catalog: overall coverage total must equal approved + unmatched + excluded");
  }
  const summedCoverage = (catalog.sources ?? []).reduce(
    (sum: { total: number; approved: number; unmatched: number; excluded: number; blocked: number }, source: any) => ({
      total: sum.total + source.coverage.total,
      approved: sum.approved + source.coverage.approved,
      unmatched: sum.unmatched + source.coverage.unmatched,
      excluded: sum.excluded + source.coverage.excluded,
      blocked: sum.blocked + source.coverage.blocked,
    }),
    { total: 0, approved: 0, unmatched: 0, excluded: 0, blocked: 0 },
  );
  for (const key of ["total", "approved", "unmatched", "excluded", "blocked"] as const) {
    if (catalog.coverage[key] !== summedCoverage[key]) {
      fail(`source-catalog: overall ${key}=${catalog.coverage[key]} does not match source coverage ${summedCoverage[key]}`);
    }
  }

  const unmatchedIds = new Set<string>(catalog.intakeReport?.unmatchedAssetIds ?? []);
  const excludedIds = new Set<string>(catalog.intakeReport?.excludedAssetIds ?? []);
  const reportIds = new Set([...unmatchedIds, ...excludedIds]);
  for (const reportId of reportIds) {
    if (!assetIds.has(reportId) && !templateIds.has(reportId)) {
      fail(`source-catalog: intake report references unknown asset or template ${reportId}`);
    }
  }
  const expectedUnmatched = new Set([
    ...(catalog.assets ?? []).filter((asset: any) => asset.mappingStatus === "unmatched").map((asset: any) => asset.id),
    ...(catalog.templateCandidates ?? []).filter((candidate: any) => candidate.mappingStatus === "unmatched").map((candidate: any) => candidate.id),
  ]);
  const expectedExcluded = new Set([
    ...(catalog.assets ?? []).filter((asset: any) => asset.mappingStatus === "excluded").map((asset: any) => asset.id),
    ...(catalog.templateCandidates ?? []).filter((candidate: any) => candidate.mappingStatus === "excluded").map((candidate: any) => candidate.id),
  ]);
  if (expectedUnmatched.size !== unmatchedIds.size || [...expectedUnmatched].some((id) => !unmatchedIds.has(id))) {
    fail("source-catalog: intake report must list every unmatched asset and template candidate");
  }
  if (expectedExcluded.size !== excludedIds.size || [...expectedExcluded].some((id) => !excludedIds.has(id))) {
    fail("source-catalog: intake report must list every intentionally excluded asset and template candidate");
  }
} else {
  fail("source-catalog: full source-catalog.json is missing");
}

if (!runtimeCatalog) {
  fail("source-catalog: manifest has no source catalog summary");
} else if (catalog) {
  for (const key of ["catalogVersion", "capabilityClasses", "sources", "templateCandidates", "mappings", "coverage"] as const) {
    if (JSON.stringify(runtimeCatalog[key]) !== JSON.stringify(catalog[key])) {
      fail(`source-catalog: manifest summary ${key} differs from the canonical catalog`);
    }
  }
  if (JSON.stringify(runtimeCatalog.intakeReport?.accessFailures ?? []) !== JSON.stringify(catalog.intakeReport?.accessFailures ?? [])) {
    fail("source-catalog: manifest summary access failures differ from the canonical catalog");
  }
}

// The browser fallback intentionally lazy-loads this mirror. Require it to be
// byte-for-byte semantically equal to the canonical catalog so API downtime
// cannot make approved sources disappear.
if (!existsSync(artifactCatalogPath)) {
  fail("source-catalog: artifact fallback catalog is missing");
} else {
  const artifactCatalog = JSON.parse(readFileSync(artifactCatalogPath, "utf8"));
  if (JSON.stringify(artifactCatalog) !== JSON.stringify(catalog)) {
    fail("source-catalog: artifact fallback catalog differs from the canonical manifest catalog");
  }
}

for (const c of components) {
  // max(axes) <= tier: a tier-T component may not currently sit above level T on any axis
  for (const a of AXIS_IDS) {
    const cur = c.axes?.[a];
    const max = c.maxAxes?.[a];
    if (typeof cur !== "number" || typeof max !== "number") continue; // schema already flags
    // Tier rule: tier T (>=2) => no current axis level above T.
    // Tier 1 is governed by the locked equal-consequence profile instead (checked below).
    if (c.tier >= 2 && cur > c.tier) {
      fail(`tier-rule: ${c.id} (tier ${c.tier}) has axes.${a}=${cur} > tier ${c.tier}`);
    }
    if (cur > max) {
      fail(`axes-bound: ${c.id} has axes.${a}=${cur} > maxAxes.${a}=${max}`);
    }
  }
}

// Tier-1 locked equal-consequence profile
const tier1 = (manifest.tiers ?? []).find((t: any) => t.tier === 1);
if (!tier1?.profile) {
  fail("tiers: no tier-1 entry with a locked profile found");
} else {
  const profile: Record<string, number | number[]> = tier1.profile;
  for (const c of components.filter((c) => c.tier === 1)) {
    for (const a of AXIS_IDS) {
      const allowed = profile[a];
      const cur = c.axes?.[a];
      if (allowed === undefined || typeof cur !== "number") continue;
      const ok = Array.isArray(allowed) ? allowed.includes(cur) : allowed === cur;
      if (!ok) {
        fail(
          `tier1-profile: ${c.id} axes.${a}=${cur} violates locked profile ${JSON.stringify(allowed)}`,
        );
      }
    }
  }
}

// ---------- 3. Token mirror consistency ----------
const tokensSrc = readFileSync(tokensPath, "utf8");
const t = manifest.tokens ?? {};

function expectInTokens(label: string, pattern: RegExp) {
  if (!pattern.test(tokensSrc)) {
    fail(`token-mirror: tokens.tsx does not match manifest for ${label} (expected ${pattern})`);
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

expectInTokens(`ink=${t.ink}`, new RegExp(`INK\\s*=\\s*"${esc(t.ink)}"`, "i"));
expectInTokens(`paper=${t.paper}`, new RegExp(`PAPER\\s*=\\s*"${esc(t.paper)}"`, "i"));
expectInTokens(`accent=${t.accent}`, new RegExp(`ACCENT\\s*=\\s*"${esc(t.accent)}"`, "i"));
expectInTokens(
  `palette=[${(t.palette ?? []).join(", ")}]`,
  new RegExp(`PALETTE\\s*=\\s*\\[${(t.palette ?? []).map((h: string) => `"${esc(h)}"`).join(",\\s*")}\\]`),
);
expectInTokens(
  `sizeScale.widths=[${t.sizeScale?.widths?.join(", ")}]`,
  new RegExp(`SIZE_WIDTHS\\s*=\\s*\\[${(t.sizeScale?.widths ?? []).join(",\\s*")}\\]`),
);
expectInTokens(
  `sizeScale.aspect=${t.sizeScale?.aspect}`,
  new RegExp(`ASPECT\\s*=\\s*${esc(String(t.sizeScale?.aspect))}`),
);
expectInTokens(
  `strokeScale=[${(t.strokeScale ?? []).join(", ")}]`,
  new RegExp(`STROKES\\s*=\\s*\\[${(t.strokeScale ?? []).join(",\\s*")}\\]`),
);
if (Array.isArray(t.dashVocabulary?.dashed)) {
  expectInTokens(
    `dashVocabulary.dashed=${t.dashVocabulary.dashed.join(" ")}`,
    new RegExp(`DASHED\\s*=\\s*"${t.dashVocabulary.dashed.join("\\s+")}"`),
  );
}
if (Array.isArray(t.dashVocabulary?.dotted)) {
  expectInTokens(
    `dashVocabulary.dotted=${t.dashVocabulary.dotted.join(" ")}`,
    new RegExp(`DOTTED\\s*=\\s*"${t.dashVocabulary.dotted.join("\\s+")}"`),
  );
}
// Version banner mirror
expectInTokens(
  `version=${manifest.version}`,
  new RegExp(`v${esc(manifest.version)}`),
);

// ---------- 4. Sheet hardcode lint ----------
// Ensure no wireframe sheet file (outside tokens.tsx) contains raw manifest
// token hex or dash-string literals that should be imported from tokens.tsx.
const sheetsDir = path.join(
  root,
  "artifacts/mockup-sandbox/src/components/mockups/wireframe-library",
);
const sheetFiles = readdirSync(sheetsDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".tsx") && d.name !== "tokens.tsx")
  .map((d) => path.join(sheetsDir, d.name));

// Build the set of raw manifest hex strings and dash-pattern strings to forbid.
const forbiddenTokens: Array<{ value: string; name: string }> = [
  { value: t.ink, name: "INK" },
  { value: t.paper, name: "PAPER" },
  { value: t.accent, name: "ACCENT" },
  ...((t.palette ?? []) as string[]).map((h: string, i: number) => ({ value: h, name: `PALETTE[${i}]` })),
];
if (Array.isArray(t.dashVocabulary?.dashed)) {
  forbiddenTokens.push({ value: (t.dashVocabulary.dashed as number[]).join(" "), name: "DASHED" });
}
if (Array.isArray(t.dashVocabulary?.dotted)) {
  forbiddenTokens.push({ value: (t.dashVocabulary.dotted as number[]).join(" "), name: "DOTTED" });
}

for (const filePath of sheetFiles) {
  const src = readFileSync(filePath, "utf8");
  const fileName = path.relative(root, filePath);
  for (const { value, name } of forbiddenTokens) {
    // Match the value as a quoted string literal (single or double quotes)
    const pattern = new RegExp(`["']${esc(value)}["']`);
    if (pattern.test(src)) {
      fail(
        `sheet-hardcode: ${fileName} contains raw literal "${value}" — import ${name} from _shared/tokens.tsx instead`,
      );
    }
  }
}

// ---------- report ----------
if (errors.length > 0) {
  console.error(`manifest validation FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `manifest validation OK: schema valid, ${components.length} components pass tier/profile invariants, source catalog verified, token mirror in sync.`,
);
