import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Glyph } from "@/components/Glyph";
import { LibrarianExplorer } from "@/components/LibrarianExplorer";
import {
  FAMILIES, componentsByFamily, clampAxes, emphasis, effectiveTier,
  AXIS_IDS, PALETTE, tint, type AxisCoords, type LibraryComponent, type Composition,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";
import { Link, useSearch } from "wouter";
import { CompositionCanvas } from "@/components/CompositionCanvas";
import { Download, RotateCcw, ExternalLink, ChevronDown, ChevronRight, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DiagramRenderer } from "@/components/DiagramRenderer";
import type { PlanResult } from "@/lib/diagram-types";

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
  const { manifest } = useManifest();
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
          const axis = manifest.axes.find((a) => a.id === k)!;
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

type GeneratorResult = PlanResult;

const ATOMIC_LEVEL_ORDER = ["atom", "molecule", "organism", "template", "page"];
function LibrarianRules() {
  const { manifest } = useManifest();
  const r = manifest.librarianRules;
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
          {manifest.tiers.map((t) => (
            <li key={t.tier}><span className="font-medium text-foreground">Tier {t.tier}</span> — {t.rule}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export default function LibraryPage() {
  const { manifest } = useManifest();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const initialTab = urlParams.get("tab") ?? "library";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedId, setSelectedId] = useState(manifest.components[0]?.id ?? "");
  const selected = manifest.components.find((c) => c.id === selectedId) ?? manifest.components[0];

  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
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
          Tiered Wireframe Library · v{manifest.version}
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="library" data-testid="tab-library">Library</TabsTrigger>
          <TabsTrigger value="compositions" data-testid="tab-compositions">Compositions</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
          <TabsTrigger value="diagram" data-testid="tab-diagram">Diagram Generator</TabsTrigger>
          <TabsTrigger value="playground" data-testid="tab-playground">Axis Playground</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Librarian Rules</TabsTrigger>
          <TabsTrigger value="explorer" data-testid="tab-explorer">Librarian Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-8">
          {FAMILIES.map((f) => (
            <section key={f.key}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {componentsByFamily(manifest.components, f.key).map((c) => (
                  <ComponentCard key={c.id} c={c} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-mono">{selectedId}</span> — open the Axis Playground tab to adjust its coordinates.
          </p>
        </TabsContent>

        <TabsContent value="compositions" className="space-y-6">
          <CompositionsGallery />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <TemplatesBrowser />
        </TabsContent>

        <TabsContent value="diagram">
          <DiagramGeneratorTab />
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

function ErrorBanner({ error, onDismiss }: { error: FetchError; onDismiss: () => void }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive mb-1">
        {error.llmError ? "AI generation failed" : "Could not reach the API"}
      </p>
      <p className="text-destructive/80 whitespace-pre-wrap">{error.message}</p>
      {!error.llmError && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Is the API Server workflow running?
        </p>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

// ─── Templates Browser ────────────────────────────────────────────────────────

const TEMPLATES_LEVELS = ["molecule", "organism", "template"] as const;
const TEMPLATES_LEVEL_LABELS: Record<string, string> = {
  molecule: "Molecules",
  organism: "Organisms",
  template: "Templates",
};

export function TemplateCard({ composition }: { composition: Composition }) {
  const levelLabel = TEMPLATES_LEVEL_LABELS[composition.atomicLevel] ?? composition.atomicLevel;
  return (
    <Link href={`/templates/${composition.id}`}>
      <div
        className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 hover-elevate transition-colors cursor-pointer group"
        data-testid={`template-card-${composition.id}`}
      >
        {/* 160×120 thumbnail */}
        <div className="flex h-[120px] items-center justify-center overflow-hidden rounded bg-muted/30">
          <CompositionCanvas
            composition={composition}
            scale={0.35}
            className="pointer-events-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">
              {composition.label}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="secondary"
              className="text-[9px] bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
            >
              {levelLabel}
            </Badge>
            <Badge variant="outline" className="font-mono text-[9px]">
              {composition.family}
            </Badge>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground line-clamp-2">
            {composition.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

function TemplatesBrowser() {
  const { manifest } = useManifest();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (level: string) =>
    setCollapsed((prev) => ({ ...prev, [level]: !prev[level] }));

  const sections = TEMPLATES_LEVELS.map((level) => ({
    level,
    label: TEMPLATES_LEVEL_LABELS[level],
    items: manifest.compositions.filter((c) => c.atomicLevel === level),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Browse compositions by atomic design level. Click any card to open the interactive template
        editor where you can adjust slot axes and export or send the result to the planner.
      </p>
      {sections.map(({ level, label, items }) => (
        <section key={level}>
          <button
            onClick={() => toggle(level)}
            className="mb-3 flex w-full items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`section-toggle-${level}`}
            aria-expanded={!collapsed[level]}
          >
            {collapsed[level] ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
            {label}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal">
              {items.length}
            </span>
          </button>
          {!collapsed[level] && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <TemplateCard key={c.id} composition={c} />
              ))}
            </div>
          )}
        </section>
      ))}
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No compositions found at molecule, organism, or template level.
        </p>
      )}
    </div>
  );
}

// ─── Compositions Gallery ─────────────────────────────────────────────────────

function CompositionCard({ composition }: { composition: Composition }) {
  const levelLabel =
    ({ atom: "Atom", molecule: "Molecule", organism: "Organism", template: "Template", page: "Page" } as Record<string, string>)[
      composition.atomicLevel
    ] ?? composition.atomicLevel;

  return (
    <Link href={`/composition/${composition.id}`}>
      <div className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 hover-elevate transition-colors cursor-pointer group">
        <div className="flex h-40 items-center justify-center overflow-hidden rounded bg-muted/30">
          <CompositionCanvas
            composition={composition}
            scale={0.38}
            className="pointer-events-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold group-hover:text-primary transition-colors">{composition.label}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-[9px]">{levelLabel}</Badge>
            <span className="font-mono text-[9px] text-muted-foreground">{composition.id}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{composition.description}</p>
        </div>
      </div>
    </Link>
  );
}

function CompositionsGallery() {
  const { manifest } = useManifest();
  const byLevel = ATOMIC_LEVEL_ORDER.map((level) => ({
    level,
    label: { atom: "Atoms", molecule: "Molecules", organism: "Organisms", template: "Templates", page: "Pages" }[level] ?? level,
    items: manifest.compositions.filter((c) => c.atomicLevel === level),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Compositions combine primitives into molecules, organisms, and templates. Click any card to open the interactive preview.
      </p>
      {byLevel.map(({ level, label, items }) => (
        <section key={level}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CompositionCard key={c.id} composition={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface FetchError {
  message: string;
  llmError: boolean;
}

function NotesList({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
      {notes.map((n, i) => (
        <li key={i} className="font-mono leading-relaxed">
          {n}
        </li>
      ))}
    </ul>
  );
}

function DiagramGeneratorTab() {
  // --- initial generation ---
  const [need, setNeed] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<FetchError | null>(null);
  const [result, setResult] = useState<GeneratorResult | null>(null);

  // --- refinement ---
  const [refinement, setRefinement] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<FetchError | null>(null);

  const refinementInputRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = async () => {
    if (!need.trim()) return;
    setGenerating(true);
    setGenError(null);
    setResult(null);
    setRefineError(null);
    try {
      const data = await postJson("/api/librarian/plan", { need: need.trim() });
      setResult(data);
    } catch (e) {
      const fe = e as Partial<FetchError>;
      setGenError({ message: fe.message ?? String(e), llmError: fe.llmError === true });
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refinement.trim() || !result) return;
    setRefining(true);
    setRefineError(null);
    try {
      const data = await postJson("/api/librarian/refine", {
        refinement: refinement.trim(),
        currentPlan: result.plan,
      });
      setResult(data);
      setRefinement("");
    } catch (e) {
      const fe = e as Partial<FetchError>;
      setRefineError({ message: fe.message ?? String(e), llmError: fe.llmError === true });
    } finally {
      setRefining(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setGenError(null);
    setRefineError(null);
    setRefinement("");
    setNeed("");
  };

  return (
    <div className="space-y-6">
      {/* Need input */}
      <Card className="p-6 space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
            Describe your diagram need
          </label>
          <div className="flex gap-2">
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
              disabled={generating}
              placeholder="e.g. show the order fulfilment workflow, or map who works where"
              className="flex-1 min-h-[72px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              data-testid="input-diagram-need"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tip: ⌘↵ / Ctrl↵ to generate
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating || !need.trim()}
            data-testid="button-generate-diagram"
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Generate diagram</>
            )}
          </Button>
          {result && (
            <Button variant="outline" onClick={handleReset} data-testid="button-reset-diagram">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />Start over
            </Button>
          )}
        </div>
        {genError && <ErrorBanner error={genError} onDismiss={() => setGenError(null)} />}
      </Card>

      {/* Diagram result */}
      {result && (
        <>
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{result.plan.title}</h3>
              <Badge variant="secondary" className="text-[10px] capitalize">
                {result.plan.family}
              </Badge>
            </div>
            <DiagramRenderer plan={result.plan} />
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>
                {result.validation.valid
                  ? "✓ satisfies all library constraints"
                  : `✗ ${result.validation.issues.length} issue(s)`}
              </span>
            </div>
            {result.validation.issues.length > 0 && (
              <ul className="text-[11px] text-destructive space-y-0.5">
                {result.validation.issues.map((i) => (
                  <li key={i.rule + (i.placementId ?? "")}>
                    [{i.severity}] {i.rule}: {i.message}
                  </li>
                ))}
              </ul>
            )}
            <NotesList notes={result.plan.notes} />
          </Card>

          {/* Refinement input */}
          <Card className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
                Refine this diagram
              </label>
              <div className="flex gap-2">
                <textarea
                  ref={refinementInputRef}
                  value={refinement}
                  onChange={(e) => setRefinement(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine();
                  }}
                  disabled={refining}
                  placeholder='e.g. "also show the returns flow" or "remove the warehouse step"'
                  className="flex-1 min-h-[60px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  data-testid="input-diagram-refinement"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The AI will update the diagram while preserving everything you haven't asked to change.
              </p>
            </div>
            <Button
              onClick={handleRefine}
              disabled={refining || !refinement.trim()}
              data-testid="button-refine-diagram"
            >
              {refining ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Refining…</>
              ) : (
                <><ArrowRight className="mr-2 h-4 w-4" />Apply refinement</>
              )}
            </Button>
            {refineError && (
              <ErrorBanner error={refineError} onDismiss={() => setRefineError(null)} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

async function postJson(url: string, body: unknown): Promise<GeneratorResult> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    const err: Partial<FetchError> & { llmError?: boolean } = {
      message: (b as { message?: string }).message ?? `API ${r.status}`,
      llmError: (b as { llmError?: boolean }).llmError === true,
    };
    throw err;
  }
  return r.json() as Promise<GeneratorResult>;
}
