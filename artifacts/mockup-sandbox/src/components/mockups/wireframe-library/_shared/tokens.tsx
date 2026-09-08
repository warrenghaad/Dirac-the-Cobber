// AUTO-GENERATED — do not edit by hand.
// Run `pnpm --filter @workspace/scripts run generate:tokens` to regenerate.
// Source: docs/wireframe-library/manifest.json v0.1.0

// ── Manifest tokens ──────────────────────────────────────────────────────────
export const INK = "#1A1D23";
export const PAPER = "#FBFAF7";
export const ACCENT = "#2563EB";
export const PALETTE = ["#2563EB", "#D97706", "#059669", "#7C3AED", "#DC2626"];
export const SIZE_WIDTHS = [64, 80, 100, 125, 156]; // S0..S4, aspect 0.62
export const ASPECT = 0.62;
export const STROKES = [1, 2, 3, 4]; // W1..W4
export const DASHED = "6 4";
export const DOTTED = "2 3";

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
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: ACCENT }}>
        Tiered Wireframe Library · v0.1.0
      </div>
      <h1 className="text-2xl font-bold mt-1" style={{ color: INK }}>{title}</h1>
      <p className="text-sm mt-1 max-w-3xl" style={{ color: TEXT_BODY }}>{subtitle}</p>
    </div>
  );
}
