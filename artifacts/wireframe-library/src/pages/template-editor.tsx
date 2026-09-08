import { useRef, useState, useMemo, useEffect } from "react";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { CompositionCanvas, downloadSVG, layoutSlots, type AxesOverrideMap } from "@/components/CompositionCanvas";
import {
  AXIS_IDS,
  clampAxes,
  effectiveTier,
  type AxisCoords,
  type Composition,
  type CompositionSlot,
  type LibraryComponent,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";
import { Download, ArrowLeft, RotateCcw, ExternalLink, AlertTriangle } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AXIS_META: Record<string, { name: string }> = {
  a1: { name: "Shape" },
  a2: { name: "Color" },
  a3: { name: "Size" },
  a4: { name: "Stroke" },
  a5: { name: "Labels" },
};

const LEVEL_LABEL: Record<string, string> = {
  atom: "Atom",
  molecule: "Molecule",
  organism: "Organism",
  template: "Template",
  page: "Page",
};

function encodeAxesParam(overrides: AxesOverrideMap): string {
  const parts: string[] = [];
  for (const [idxStr, partial] of Object.entries(overrides)) {
    if (!partial) continue;
    const a1 = partial.a1 ?? 0;
    const a2 = partial.a2 ?? 0;
    const a3 = partial.a3 ?? 0;
    const a4 = partial.a4 ?? 0;
    const a5 = partial.a5 ?? 0;
    const vals = [a1, a2, a3, a4, a5];
    // Skip any entry where values are not valid single digits in [0, 4].
    if (vals.some((v) => !Number.isInteger(v) || v < 0 || v > 4)) continue;
    parts.push(`${idxStr}:${a1}${a2}${a3}${a4}${a5}`);
  }
  return parts.sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0])).join(",");
}

/** Parse the compact ?axes= string into a raw map (no composition clamping). */
function parseAxesParam(param: string): AxesOverrideMap {
  const result: AxesOverrideMap = {};
  if (!param) return result;
  for (const part of param.split(",")) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const idx = parseInt(part.slice(0, colonIdx), 10);
    const encoded = part.slice(colonIdx + 1);
    if (!Number.isFinite(idx) || idx < 0 || encoded.length !== 5) continue;
    const digits = encoded.split("").map(Number);
    if (digits.some((d) => isNaN(d) || d < 0 || d > 4)) continue;
    result[idx] = { a1: digits[0], a2: digits[1], a3: digits[2], a4: digits[3], a5: digits[4] };
  }
  return result;
}

/**
 * Validate + clamp raw URL-parsed overrides against the actual composition.
 * Invalid slot indices (out of range) are dropped; axis values are clamped
 * to each component's maxAxes so restored state is always legal.
 */
function normalizeAxesOverrides(raw: AxesOverrideMap, composition: Composition): AxesOverrideMap {
  const clamped: AxesOverrideMap = {};
  for (const [idxStr, partial] of Object.entries(raw)) {
    const idx = Number(idxStr);
    const slot = composition.slots[idx];
    if (!slot) continue; // index out of range — discard
    const component = MANIFEST.components.find((c) => c.id === slot.componentId) ?? null;
    const base = resolveSlotAxes(slot, component);
    const merged: AxisCoords = {
      a1: partial?.a1 ?? base.a1,
      a2: partial?.a2 ?? base.a2,
      a3: partial?.a3 ?? base.a3,
      a4: partial?.a4 ?? base.a4,
      a5: partial?.a5 ?? base.a5,
    };
    clamped[idx] = component ? clampAxes(component, merged) : merged;
  }
  return clamped;
}

function resolveSlotAxes(slot: CompositionSlot, component: LibraryComponent | null): AxisCoords {
  const base: AxisCoords = component?.axes ?? { a1: 1, a2: 0, a3: 2, a4: 0, a5: 0 };
  const merged = { ...base, ...(slot.axes ?? {}) };
  return component ? clampAxes(component, merged) : merged;
}

// ─── TierGuard ────────────────────────────────────────────────────────────────

type TierSummaryProps = {
  composition: Composition;
  axesOverrides: AxesOverrideMap;
};

export function TierSummary({ composition, axesOverrides }: TierSummaryProps) {
  const { manifest } = useManifest();
  const tierCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    composition.slots.forEach((slot, i) => {
      const component = manifest.components.find((c) => c.id === slot.componentId) ?? null;
      const base = resolveSlotAxes(slot, component);
      const partial = axesOverrides[i];
      const resolved: AxisCoords = partial
        ? {
            a1: partial.a1 ?? base.a1,
            a2: partial.a2 ?? base.a2,
            a3: partial.a3 ?? base.a3,
            a4: partial.a4 ?? base.a4,
            a5: partial.a5 ?? base.a5,
          }
        : base;
      const t = effectiveTier(resolved);
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return counts;
  }, [composition.slots, axesOverrides, manifest.components]);

  const tier4Count = tierCounts[4] ?? 0;

  return (
    <div className="space-y-2">
      {/* Tier badge row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tier summary
        </span>
        {[1, 2, 3, 4].map((t) => {
          const count = tierCounts[t] ?? 0;
          if (!count) return null;
          return (
            <Badge
              key={t}
              variant={t === 4 ? "destructive" : t === 1 ? "default" : "secondary"}
              className="text-[9px]"
              data-testid={`tier-summary-t${t}`}
            >
              T{t} × {count}
            </Badge>
          );
        })}
      </div>

      {/* Tier-4 rule violation */}
      {tier4Count > 1 && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
          data-testid="tier-guard-banner"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-[11px] text-destructive">
            <span className="font-semibold">{tier4Count} Tier-4 slots detected.</span>{" "}
            Tier 4 is allowed for at most <em>one</em> hero component per view. Reduce emphasis on some slots.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── SlotPanel ────────────────────────────────────────────────────────────────

type SlotPanelProps = {
  index: number;
  slot: CompositionSlot;
  axes: AxisCoords;
  component: LibraryComponent | null;
  onAxesChange: (index: number, axes: AxisCoords) => void;
};

function SlotPanel({ index, slot, axes, component, onAxesChange }: SlotPanelProps) {
  const tier = effectiveTier(axes);
  const isEdgeLike = slot.role === "edge" || slot.componentId.includes("edge");
  const isContainerLike = slot.role === "container" || slot.componentId.includes("group");

  return (
    <div className="space-y-3 rounded-lg border border-card-border bg-card p-4" data-testid={`slot-panel-${index}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold">{slot.role}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{slot.componentId}</span>
        </div>
        <div className="flex items-center gap-1">
          {isEdgeLike && <Badge variant="secondary" className="text-[9px]">edge</Badge>}
          {isContainerLike && <Badge variant="secondary" className="text-[9px]">container</Badge>}
          <Badge
            variant={tier === 4 ? "destructive" : tier === 1 ? "default" : "secondary"}
            className="text-[9px]"
            data-testid={`slot-tier-badge-${index}`}
          >
            T{tier}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {AXIS_IDS.map((k) => {
          const max = component?.maxAxes[k] ?? 4;
          return (
            <div key={k} className="grid grid-cols-[60px_1fr_28px] items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">
                {k.toUpperCase()} · {AXIS_META[k].name}
              </span>
              <Slider
                data-testid={`slot-${index}-slider-${k}`}
                min={0}
                max={4}
                step={1}
                value={[axes[k]]}
                onValueChange={([v]) => {
                  const next = { ...axes, [k]: v };
                  onAxesChange(index, component ? clampAxes(component, next) : next);
                }}
              />
              <span className="text-right text-[10px] tabular-nums text-muted-foreground">
                {axes[k]}/{max}
              </span>
            </div>
          );
        })}
      </div>
      {component && (
        <p className="text-[10px] text-muted-foreground">
          tier {component.tier} · {component.family} · {component.shape}
        </p>
      )}
    </div>
  );
}

// ─── TemplateEditorPage ───────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const svgRef = useRef<SVGSVGElement>(null);
  const { manifest } = useManifest();

  const composition: Composition | undefined = manifest.compositions.find(
    (c) => c.id === id
  );

  // Initialise from URL on first render; subsequent syncs are handled by the effect below.
  const [axesOverrides, setAxesOverrides] = useState<AxesOverrideMap>(() => {
    const params = new URLSearchParams(search);
    const raw = parseAxesParam(params.get("axes") ?? "");
    // Clamp against the composition and its component maxAxes so restored state
    // is always valid. If composition is undefined (unknown id) the not-found
    // guard below renders before any slots are accessed.
    if (!composition) return raw;
    return normalizeAxesOverrides(raw, composition);
  });

  // Keep the URL in sync whenever overrides change (replaceState so Back still works).
  useEffect(() => {
    const encoded = encodeAxesParam(axesOverrides);
    const params = new URLSearchParams(window.location.search);
    if (encoded) {
      params.set("axes", encoded);
    } else {
      params.delete("axes");
    }
    const qs = params.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState(null, "", next);
  }, [axesOverrides]);

  if (!composition) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          Composition <span className="font-mono">{id}</span> not found.
        </p>
        <Link href="/?tab=templates">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Templates
          </Button>
        </Link>
      </div>
    );
  }

  const viewport = { w: 640, h: 480 };
  const records = layoutSlots(composition, viewport, axesOverrides, manifest.components);

  const handleAxesChange = (slotIndex: number, newAxes: AxisCoords) => {
    setAxesOverrides((prev) => ({ ...prev, [slotIndex]: newAxes }));
  };

  const handleReset = () => {
    setAxesOverrides({});
    // The useEffect will fire and strip the ?axes param via replaceState.
  };

  const handleDownload = () => {
    downloadSVG(svgRef, `${composition.id}.svg`);
  };

  const handleSendToPlanner = () => {
    const params = new URLSearchParams({
      family: composition.family,
      hint: `${composition.label}: ${composition.description}`,
      templateId: composition.id,
    });
    navigate(`/?${params.toString()}`);
  };

  const levelLabel = LEVEL_LABEL[composition.atomicLevel] ?? composition.atomicLevel;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <Link href="/?tab=templates">
          <button className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" /> Templates Browser
          </button>
        </Link>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Template Editor
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="template-editor-title">
              {composition.label}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{composition.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[9px] uppercase tracking-wide"
              data-testid="badge-atomic-level"
            >
              {levelLabel}
            </Badge>
            <Badge variant="outline" className="font-mono text-[9px]">
              {composition.family}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {composition.id}
            </Badge>
          </div>
        </div>
      </header>

      {/* Tier summary & guard */}
      <div className="mb-6">
        <TierSummary composition={composition} axesOverrides={axesOverrides} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Canvas panel */}
        <div className="space-y-3">
          <Card
            className="flex items-center justify-center overflow-hidden p-4 bg-muted/30"
            data-testid="panel-canvas"
          >
            <CompositionCanvas
              composition={composition}
              axesOverrides={axesOverrides}
              svgRef={svgRef}
              className="max-w-full rounded"
            />
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              data-testid="button-export-svg"
            >
              <Download className="mr-2 h-3.5 w-3.5" /> Export SVG
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSendToPlanner}
              data-testid="button-send-to-planner"
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Send to Planner
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              data-testid="button-reset-all-slots"
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset all slots
            </Button>
          </div>
        </div>

        {/* Per-slot sliders panel */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Slot overrides · {composition.slots.length} slots
          </div>
          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {records.map((r) => (
              <SlotPanel
                key={r.index}
                index={r.index}
                slot={r.slot}
                axes={r.axes}
                component={r.component}
                onAxesChange={handleAxesChange}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
