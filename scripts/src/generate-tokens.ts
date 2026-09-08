/**
 * Generates artifacts/mockup-sandbox/src/components/mockups/wireframe-library/_shared/tokens.tsx
 * from the canonical source at docs/wireframe-library/manifest.json.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run generate:tokens
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "docs/wireframe-library/manifest.json");
const tokensPath = path.join(
  root,
  "artifacts/mockup-sandbox/src/components/mockups/wireframe-library/_shared/tokens.tsx",
);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const t = manifest.tokens;

const palette = (t.palette as string[]).map((h: string) => `"${h}"`).join(", ");
const widths = (t.sizeScale.widths as number[]).join(", ");
const strokes = (t.strokeScale as number[]).join(", ");
const dashed = (t.dashVocabulary.dashed as number[]).join(" ");
const dotted = (t.dashVocabulary.dotted as number[]).join(" ");

const output = `\
// AUTO-GENERATED — do not edit by hand.
// Run \`pnpm --filter @workspace/scripts run generate:tokens\` to regenerate.
// Source: docs/wireframe-library/manifest.json v${manifest.version}

// ── Manifest tokens ──────────────────────────────────────────────────────────
export const INK = "${t.ink}";
export const PAPER = "${t.paper}";
export const ACCENT = "${t.accent}";
export const PALETTE = [${palette}];
export const SIZE_WIDTHS = [${widths}]; // S0..S4, aspect ${t.sizeScale.aspect}
export const ASPECT = ${t.sizeScale.aspect};
export const STROKES = [${strokes}]; // W1..W4
export const DASHED = "${dashed}";
export const DOTTED = "${dotted}";

// ── UI constants (not in manifest; kept here so sheets never hardcode) ────────
export const BORDER = "#E5E3DC";         // card / row borders
export const TEXT_SECONDARY = "#6B7280"; // tag / secondary-label text
export const TEXT_MUTED = "#8A8F99";     // level captions, note text
export const TEXT_BODY = "#5A5F6B";      // explanatory body copy
export const TEXT_LABEL = "#4B5563";     // legend / annotation text

// ── Helpers ───────────────────────────────────────────────────────────────────
export function sizeOf(level: number) {
  const w = SIZE_WIDTHS[level];
  return { w, h: Math.round(w * ASPECT) };
}

export function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`;
}

export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: ACCENT }}>
        Tiered Wireframe Library · v${manifest.version}
      </div>
      <h1 className="text-2xl font-bold mt-1" style={{ color: INK }}>{title}</h1>
      <p className="text-sm mt-1 max-w-3xl" style={{ color: TEXT_BODY }}>{subtitle}</p>
    </div>
  );
}
`;

writeFileSync(tokensPath, output, "utf8");
console.log(`tokens.tsx generated from manifest.json v${manifest.version}`);
