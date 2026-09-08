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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "docs/wireframe-library/manifest.json");
const schemaPath = path.join(root, "docs/wireframe-library/manifest.schema.json");
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
}

const components: Component[] = manifest.components ?? [];

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
  `manifest validation OK: schema valid, ${components.length} components pass tier/profile invariants, token mirror in sync.`,
);
