import { useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { CompositionCanvas, downloadSVG, layoutSlots, type AxesOverrideMap } from "@/components/CompositionCanvas";
import {
  AXIS_IDS,
  clampAxes,
  type AxisCoords,
  type Composition,
  type CompositionSlot,
  type LibraryComponent,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";
import { Download, ArrowLeft } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AXIS_META: Record<string, { name: string }> = {
  a1: { name: "Shape" },
  a2: { name: "Color" },
  a3: { name: "Size" },
  a4: { name: "Stroke" },
  a5: { name: "Labels" },
};

function resolveSlotAxes(slot: CompositionSlot, component: LibraryComponent | null): AxisCoords {
  const base: AxisCoords = component?.axes ?? { a1: 1, a2: 0, a3: 2, a4: 0, a5: 0 };
  const merged = { ...base, ...(slot.axes ?? {}) };
  return component ? clampAxes(component, merged) : merged;
}

// ─── SlotPanel ────────────────────────────────────────────────────────────────

function slotMeta(component: LibraryComponent): string {
  return `tier ${component.tier} · ${component.family} · ${component.shape}`;
}

type SlotPanelProps = {
  index: number;
  slot: CompositionSlot;
  axes: AxisCoords;
  component: LibraryComponent | null;
  onAxesChange: (index: number, axes: AxisCoords) => void;
};

function SlotPanel({ index, slot, axes, component, onAxesChange }: SlotPanelProps) {
  const isEdgeLike = slot.role === "edge" || slot.componentId.includes("edge");
  const isContainerLike = slot.role === "container" || slot.componentId.includes("group");

  return (
    <div className="space-y-3 rounded-lg border border-card-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-semibold">{slot.role}</span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{slot.componentId}</span>
        </div>
        <div className="flex gap-1">
          {isEdgeLike && (
            <Badge variant="secondary" className="text-[9px]">edge</Badge>
          )}
          {isContainerLike && (
            <Badge variant="secondary" className="text-[9px]">container</Badge>
          )}
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
        <p className="text-[10px] text-muted-foreground">{slotMeta(component)}</p>
      )}
    </div>
  );
}

// ─── CompositionPage ──────────────────────────────────────────────────────────

export default function CompositionPage() {
  const { id } = useParams<{ id: string }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const { manifest } = useManifest();

  const composition: Composition | undefined = manifest.compositions.find(
    (c) => c.id === id
  );

  // Per-slot axes state
  const [axesOverrides, setAxesOverrides] = useState<AxesOverrideMap>({});

  if (!composition) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          Composition <span className="font-mono">{id}</span> not found.
        </p>
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Library
          </Button>
        </Link>
      </div>
    );
  }

  // Resolve effective axes for each slot (for the slider UI)
  const viewport = { w: 640, h: 480 };
  const records = layoutSlots(composition, viewport, axesOverrides, manifest.components);

  const handleAxesChange = (slotIndex: number, newAxes: AxisCoords) => {
    setAxesOverrides((prev) => ({ ...prev, [slotIndex]: newAxes }));
  };

  const handleReset = () => setAxesOverrides({});

  const handleDownload = () => {
    downloadSVG(svgRef, `${composition.id}.svg`);
  };

  const levelLabel = {
    atom: "Atom",
    molecule: "Molecule",
    organism: "Organism",
    template: "Template",
    page: "Page",
  }[composition.atomicLevel] ?? composition.atomicLevel;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <Link href="/">
          <button className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" /> Component Library
          </button>
        </Link>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Composition Preview
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{composition.label}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{composition.description}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">{levelLabel}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{composition.id}</Badge>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Canvas panel */}
        <div className="space-y-3">
          <Card className="flex items-center justify-center overflow-hidden p-4 bg-muted/30">
            <CompositionCanvas
              composition={composition}
              axesOverrides={axesOverrides}
              svgRef={svgRef}
              className="max-w-full rounded"
            />
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-3.5 w-3.5" /> Download SVG
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset all axes
            </Button>
          </div>
        </div>

        {/* Per-slot sliders panel */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Per-slot axis overrides · {composition.slots.length} slots
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
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
