import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Glyph } from "@/components/Glyph";
import { LibrarianExplorer } from "@/components/LibrarianExplorer";
import {
  MANIFEST, FAMILIES, componentsByFamily, clampAxes, emphasis, effectiveTier,
  AXIS_IDS, PALETTE, tint, type AxisCoords, type LibraryComponent,
} from "@/lib/library";
import { Download, RotateCcw } from "lucide-react";

const AXIS_META: Record<string, { name: string; meaning: string }> = {
  a1: { name: "Shape semantics", meaning: "silhouette encodes category" },
  a2: { name: "Color", meaning: "chromatic differentiation" },
  a3: { name: "Size", meaning: "modular ×1.25 footprint scale" },
  a4: { name: "Stroke & line", meaning: "weight + dash vocabulary" },
  a5: { name: "Label density", meaning: "none → property table" },
};

function TierBadge({ tier }: { tier: number }) {
  return (
    <Badge
      variant={tier === 1 ? "default" : "secondary"}
      className="text-[10px] tracking-wide"
      data-testid={`badge-tier-${tier}`}
    >
      TIER {tier}
    </Badge>
  );
}

function ComponentCard({ c, selected, onSelect }: { c: LibraryComponent; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      data-testid={`card-component-${c.id}`}
      className={`flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover-elevate ${
        selected ? "border-primary ring-1 ring-primary" : "border-card-border"
      }`}
    >
      <div className="flex h-24 items-center justify-center">
        <Glyph component={c} axes={c.axes} hueIndex={PALETTE.indexOf(PALETTE[0])} scale={0.85} />
      </div>
      <div className="text-xs font-semibold">{c.id}</div>
      <div className="flex items-center gap-2">
        <TierBadge tier={c.tier} />
        <span className="text-[10px] text-muted-foreground">E = {emphasis(c.axes)}</span>
      </div>
    </button>
  );
}

function Playground({ component }: { component: LibraryComponent }) {
  const [axes, setAxes] = useState<AxisCoords>(component.axes);
  const [hueIndex, setHueIndex] = useState(0);
  const [prevId, setPrevId] = useState(component.id);
  if (component.id !== prevId) {
    setPrevId(component.id);
    setAxes(component.axes);
  }

  const tier = effectiveTier(axes);
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (tier === 4) w.push("Tier 4 — allowed for at most ONE hero component per view.");
    if (component.tier === 1 && (axes.a2 !== 0 || axes.a3 !== 2 || axes.a4 !== 0 || axes.a5 !== 0))
      w.push("Leaving the Tier-1 equal-consequence profile: this now carries emphasis.");
    return w;
  }, [axes, tier, component.tier]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8" data-testid="panel-preview">
        <Glyph component={component} axes={axes} hueIndex={hueIndex} scale={1.4} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span data-testid="text-component-id" className="font-mono text-xs">{component.id}</span>
          <TierBadge tier={tier} />
          <span data-testid="text-emphasis">E = {emphasis(axes)}</span>
        </div>
        {warnings.map((w) => (
          <p key={w} className="max-w-md text-center text-xs text-destructive">{w}</p>
        ))}
      </Card>

      <Card className="space-y-5 p-5">
        {AXIS_IDS.map((k) => {
          const axis = MANIFEST.axes.find((a) => a.id === k)!;
          const max = component.maxAxes[k];
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {k.toUpperCase()} · {AXIS_META[k].name}
                </span>
                <span className="text-[10px] text-muted-foreground">max {max}</span>
              </div>
              <Slider
                data-testid={`slider-${k}`}
                min={0}
                max={4}
                step={1}
                value={[axes[k]]}
                onValueChange={([v]) => setAxes((prev) => clampAxes(component, { ...prev, [k]: v }))}
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                {axes[k]}: {axis.levels[axes[k]]}
              </div>
            </div>
          );
        })}

        {axes.a2 >= 2 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide">Hue (class)</div>
            <div className="flex gap-1.5">
              {PALETTE.map((c, i) => (
                <button
                  key={c}
                  data-testid={`button-hue-${i}`}
                  onClick={() => setHueIndex(i)}
                  className={`h-7 w-7 rounded-md border-2 ${hueIndex === i ? "border-foreground" : "border-transparent"}`}
                  style={{ background: tint(c, 0.6) }}
                  aria-label={`hue ${i}`}
                />
              ))}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          data-testid="button-reset-axes"
          onClick={() => setAxes(component.axes)}
          className="w-full"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to manifest defaults
        </Button>
      </Card>
    </div>
  );
}

function LibrarianRules() {
  const r = MANIFEST.librarianRules;
  return (
    <Card className="space-y-4 p-6 text-sm">
      <div>
        <h3 className="mb-1 font-semibold">Start</h3>
        <p className="text-muted-foreground">{r.start}</p>
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Axis priority (one meaning per axis)</h3>
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
          {r.axisPriority.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Constraints</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {r.constraints.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="mb-1 font-semibold">Tiers</h3>
        <ul className="space-y-0.5 text-muted-foreground">
          {MANIFEST.tiers.map((t) => (
            <li key={t.tier}><span className="font-medium text-foreground">Tier {t.tier}</span> — {t.rule}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default function LibraryPage() {
  const [selectedId, setSelectedId] = useState(MANIFEST.components[0].id);
  const selected = MANIFEST.components.find((c) => c.id === selectedId)!;

  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify(MANIFEST, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wireframe-library-manifest.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Tiered Wireframe Library · v{MANIFEST.version}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Component Library & Design Logic</h1>
          <Button variant="outline" size="sm" onClick={downloadManifest} data-testid="button-download-manifest">
            <Download className="mr-2 h-3.5 w-3.5" /> manifest.json
          </Button>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tier 1 primitives are equal-consequence; complexity grows along five parallel, independent, linear axes.
          Select any component and move the axis sliders — clamped to each component's declared maximum coordinates.
        </p>
      </header>

      <Tabs defaultValue="library">
        <TabsList className="mb-6">
          <TabsTrigger value="library" data-testid="tab-library">Library</TabsTrigger>
          <TabsTrigger value="playground" data-testid="tab-playground">Axis Playground</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Librarian Rules</TabsTrigger>
          <TabsTrigger value="explorer" data-testid="tab-explorer">Librarian Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-8">
          {FAMILIES.map((f) => (
            <section key={f.key}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {componentsByFamily(f.key).map((c) => (
                  <ComponentCard key={c.id} c={c} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-mono">{selectedId}</span> — open the Axis Playground tab to adjust its coordinates.
          </p>
        </TabsContent>

        <TabsContent value="playground">
          <Playground component={selected} />
        </TabsContent>

        <TabsContent value="rules">
          <LibrarianRules />
        </TabsContent>

        <TabsContent value="explorer">
          <LibrarianExplorer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
