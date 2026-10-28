import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Glyph } from "@/components/Glyph";
import {
  FAMILIES, componentsByFamily, clampAxes, emphasis, effectiveTier,
  AXIS_IDS, PALETTE, tint, type AxisCoords, type LibraryComponent, type Composition,
  type SourceAsset, type SourceCatalog, type SourceCatalogEntry, type VisualLanguage,
} from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";
import { Link, useSearch } from "wouter";
import { CompositionCanvas } from "@/components/CompositionCanvas";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Copy, Download, ExternalLink, Loader2, Play, RotateCcw, Sparkles, ArrowRight,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiagramRenderer } from "@/components/DiagramRenderer";
import GraphWorkspace from "@/components/GraphWorkspace";
import { graphDocumentFromPlan, type EditableGraphDocument } from "@/lib/graph-document";
import type { DiagramPlan, DraftPlacement, PlanResult, ValidationReport } from "@/lib/diagram-types";
import { decodeDiagramSnapshot, encodeDiagramSnapshot } from "@/lib/diagram-share";
import {
  useCreateDiagramPlan,
  usePromoteDiagramPlan,
  type PromoteDiagramPlanRequest,
  type PromoteDiagramPlanResult,
} from "@workspace/api-client-react";

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
        <Glyph component={c} axes={c.axes} hueIndex={0} scale={0.85} />
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
  const palette = manifest.tokens.palette;
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
              {palette.map((c, i) => (
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

// ─── Source Catalog ──────────────────────────────────────────────────────────

function sourceLocation(source: SourceCatalogEntry) {
  const { fileKey, localPath, page, nodeId } = source.provenance;
  return [fileKey ? `Figma ${fileKey}` : localPath, page, nodeId ? `node ${nodeId}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function SourceCard({
  source,
  assets,
  assetCount,
  templateCount,
  isLoadingAssets,
  onLoadAssets,
}: {
  source: SourceCatalogEntry;
  assets: SourceAsset[];
  assetCount: number;
  templateCount: number;
  isLoadingAssets: boolean;
  onLoadAssets: (sourceId: string, offset: number) => void;
}) {
  const usableStatus = source.status === "accessible" || source.status === "local-only";
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  return (
    <Card className="flex flex-col overflow-hidden border-card-border transition-colors hover-elevate" data-testid={`card-source-${source.id}`}>
      <div className="border-b border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">{source.label}</h3>
            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="font-mono">{source.id}</span>
              {sourceLocation(source) && <span className="normal-case tracking-normal">{sourceLocation(source)}</span>}
            </div>
          </div>
          <Badge variant={usableStatus ? "default" : "secondary"} className="text-[10px] capitalize">
            {source.status.replace("-", " ")}
          </Badge>
        </div>
      </div>
      <div className="space-y-4 p-4 text-sm">
        {source.accessNote && <p className="rounded border border-amber-300/40 bg-amber-50/50 p-2.5 text-xs leading-relaxed text-amber-900">{source.accessNote}</p>}
        <div className="flex flex-wrap gap-1.5">
          {source.capabilityClasses.map((capability) => <Badge key={capability} variant="outline" className="text-[10px] font-normal">{capability.replaceAll("-", " ")}</Badge>)}
        </div>
        {source.visualLanguages && <p className="text-xs text-muted-foreground">{source.visualLanguages.join(" · ")}</p>}
        {source.tokenModes && source.tokenModes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Token modes ({source.tokenModes.length})</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {source.tokenModes.slice(0, 8).map((mode) => <Badge key={mode} variant="secondary" className="text-[10px] font-normal">{mode}</Badge>)}
              {source.tokenModes.length > 8 && <Badge variant="outline" className="text-[10px]">+{source.tokenModes.length - 8} modes</Badge>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded border border-border bg-muted/10 p-2"><div className="font-mono text-base font-semibold">{source.coverage.approved}</div><div className="text-[9px] uppercase text-muted-foreground">approved</div></div>
          <div className="rounded border border-border bg-muted/10 p-2"><div className="font-mono text-base font-semibold">{source.coverage.unmatched}</div><div className="text-[9px] uppercase text-muted-foreground">unmatched</div></div>
          <div className="rounded border border-border bg-muted/10 p-2"><div className="font-mono text-base font-semibold">{source.coverage.total}</div><div className="text-[9px] uppercase text-muted-foreground">total</div></div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {source.inventory.components} components · {source.inventory.componentSets} sets · {source.inventory.variants} variants · {source.inventory.tokenBundles} bundles
          {source.inventory.pages.length > 0 ? ` · ${source.inventory.pages.length} pages: ${source.inventory.pages.slice(0, 3).join(", ")}${source.inventory.pages.length > 3 ? "…" : ""}` : ""}
        </p>
        {(assetCount > 0 || templateCount > 0) && (
          <details className="rounded border border-border bg-muted/10 p-2.5" onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            setIsInventoryOpen(isOpen);
            if (isOpen && assets.length === 0) onLoadAssets(source.id, 0);
          }}>
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Browse catalogued material · {assetCount.toLocaleString()} assets · {templateCount} template candidates
            </summary>
            {isInventoryOpen && isLoadingAssets && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading source inventory…</div>}
            {isInventoryOpen && assets.length > 0 && (
              <ul className="mt-2 space-y-2">
                {assets.map((asset) => (
                  <li key={asset.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                    <div className="text-xs font-medium text-foreground">{asset.label}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                      <span>{asset.assetType}</span>
                      <span>{asset.mappingStatus}</span>
                      {asset.tokenCount !== undefined && <span>{asset.tokenCount.toLocaleString()} tokens</span>}
                      {asset.provenance.tokenMode && <span>{asset.provenance.tokenMode}</span>}
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[9px] text-muted-foreground">
                      {asset.provenance.fileKey ?? asset.provenance.localPath ?? asset.id}
                      {asset.provenance.nodeId ? ` · node ${asset.provenance.nodeId}` : ""}
                      {asset.provenance.page ? ` · ${asset.provenance.page}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {isInventoryOpen && assets.length < assetCount && (
              <Button variant="outline" size="sm" className="mt-3 w-full text-xs" disabled={isLoadingAssets} onClick={() => onLoadAssets(source.id, assets.length)}>
                Show 100 more of {assetCount.toLocaleString()} assets
              </Button>
            )}
          </details>
        )}
      </div>
    </Card>
  );
}

function SourcesBrowser() {
  const [catalog, setCatalog] = useState<SourceCatalog | null>(null);
  const [assetsBySource, setAssetsBySource] = useState<Record<string, SourceAsset[]>>({});
  const [loadingSources, setLoadingSources] = useState<Set<string>>(new Set());
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${import.meta.env.BASE_URL}api/librarian/catalog`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        return response.json() as Promise<SourceCatalog>;
      })
      .then((nextCatalog) => { if (!cancelled) setCatalog(nextCatalog); })
      .catch(async () => {
        // API outages must not make the approved baseline disappear. This
        // chunk is intentionally imported only after opening Sources.
        try {
          const { default: offlineCatalog } = await import("@/lib/source-catalog.json");
          if (!cancelled) setCatalog(offlineCatalog as SourceCatalog);
        } catch {
          if (!cancelled) setCatalogError("The source catalog could not be loaded.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  const loadAssets = (sourceId: string, offset: number) => {
    if (loadingSources.has(sourceId)) return;
    setLoadingSources((current) => new Set(current).add(sourceId));
    const finish = () => setLoadingSources((current) => {
      const next = new Set(current);
      next.delete(sourceId);
      return next;
    });
    void fetch(`${import.meta.env.BASE_URL}api/librarian/catalog/assets?sourceId=${encodeURIComponent(sourceId)}&offset=${offset}&limit=100`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog asset request failed (${response.status})`);
        return response.json() as Promise<{ items: SourceAsset[] }>;
      })
      .then(({ items }) => setAssetsBySource((current) => ({ ...current, [sourceId]: [...(current[sourceId] ?? []), ...items] })))
      .catch(async () => {
        try {
          const { default: offlineCatalog } = await import("@/lib/source-catalog.json");
          const items = (offlineCatalog as SourceCatalog).assets?.filter((asset) => asset.sourceId === sourceId).slice(offset, offset + 100) ?? [];
          setAssetsBySource((current) => ({ ...current, [sourceId]: [...(current[sourceId] ?? []), ...items] }));
        } catch {
          // The catalog summary remains visible and the request can be retried.
        }
      })
      .finally(finish);
  };

  if (!catalog) {
    return <Card className="flex min-h-[200px] flex-col items-center justify-center border-dashed p-8 text-center text-sm text-muted-foreground">{catalogError ?? <><Loader2 className="mb-3 h-5 w-5 animate-spin" />Loading source catalog…</>}</Card>;
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-lg font-semibold">Source-backed baseline</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Every source remains visible with access state, provenance, capability class, token modes, and coverage. Unmatched and blocked material is retained instead of being silently discarded.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded border bg-card px-3 py-2"><div className="font-mono text-base font-semibold">{catalog.coverage.approved}</div><div className="text-muted-foreground">approved</div></div>
          <div className="rounded border bg-card px-3 py-2"><div className="font-mono text-base font-semibold">{catalog.coverage.unmatched}</div><div className="text-muted-foreground">unmatched</div></div>
          <div className="rounded border bg-card px-3 py-2"><div className="font-mono text-base font-semibold">{catalog.coverage.blocked}</div><div className="text-muted-foreground">blocked</div></div>
        </div>
      </div>
      {catalog.intakeReport && catalog.intakeReport.accessFailures.length > 0 && <Card className="border-amber-300/40 bg-amber-50/40 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Access and registration blockers</div><ul className="mt-2 space-y-1 text-xs text-amber-900">{catalog.intakeReport.accessFailures.map((failure) => <li key={failure}>{failure}</li>)}</ul></Card>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {catalog.sources.map((source) => <SourceCard key={source.id} source={source} assets={assetsBySource[source.id] ?? []} assetCount={source.coverage.total} templateCount={catalog.templateCandidates.filter((candidate) => candidate.sourceId === source.id).length} isLoadingAssets={loadingSources.has(source.id)} onLoadAssets={loadAssets} />)}
      </div>
      <Card className="p-5">
        <h3 className="font-semibold">Template candidates</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.templateCandidates.map((candidate) => <div key={candidate.id} className="rounded border border-border bg-muted/10 p-3"><div className="text-xs font-semibold">{candidate.label}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{candidate.sourceId}</div><div className="mt-2 text-[10px] text-muted-foreground">{candidate.mappingStatus.replace("-", " ")}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

export default function LibraryPage() {
  const { manifest } = useManifest();
  const search = useSearch();

  // Capture the handoff parameters before cleaning the address bar. Wouter
  // observes history updates, so a ref keeps the values available after
  // replaceState triggers a re-render.
  const initialParamsRef = useRef<URLSearchParams | null>(null);
  if (initialParamsRef.current === null) {
    initialParamsRef.current = new URLSearchParams(search);
  }
  const initialParams = initialParamsRef.current;
  const hintParam = initialParams.get("hint") ?? "";
  const familyParam = initialParams.get("family") ?? "";
  const templateIdParam = initialParams.get("templateId") ?? "";
  const shareNeedParam = initialParams.get("need") ?? "";
  const shareViewParam = initialParams.get("view") ?? "";
  const shareSnapshotParam = initialParams.get("snapshot") ?? "";
  const shareResult = decodeDiagramSnapshot(shareSnapshotParam);

  const initialTab = hintParam
    ? "diagram"
    : shareNeedParam
      ? "diagram"
      : (new URLSearchParams(search).get("tab") ?? "library");

  const [activeTab, setActiveTab] = useState(initialTab);
  const [workspaceSeed, setWorkspaceSeed] = useState<EditableGraphDocument | null>(null);
  const [selectedId, setSelectedId] = useState(manifest.components[0]?.id ?? "");
  const selected = manifest.components.find((c) => c.id === selectedId) ?? manifest.components[0];

  useEffect(() => {
    if (!hintParam) return;

    const cleanParams = new URLSearchParams(window.location.search);
    cleanParams.delete("hint");
    cleanParams.delete("family");
    cleanParams.delete("templateId");
    const nextUrl = cleanParams.toString()
      ? `${window.location.pathname}?${cleanParams.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [hintParam]);

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
          <TabsTrigger value="diagram" data-testid="tab-diagram">Diagram Planner</TabsTrigger>
          <TabsTrigger value="workspace" data-testid="tab-workspace">Graph Workspace</TabsTrigger>
          <TabsTrigger value="playground" data-testid="tab-playground">Axis Playground</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Librarian Rules</TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
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
          <DiagramGeneratorTab
            initialHint={hintParam}
            initialNeed={shareNeedParam}
            initialFamily={familyParam}
            initialView={shareViewParam}
            initialResult={shareResult}
            initialSnapshotInvalid={Boolean(shareSnapshotParam && !shareResult)}
            initialTemplateId={templateIdParam}
            onOpenWorkspace={(document) => {
              setWorkspaceSeed(document);
              setActiveTab("workspace");
            }}
          />
        </TabsContent>

        <TabsContent value="workspace">
          <GraphWorkspace seedDocument={workspaceSeed} onSeedConsumed={() => setWorkspaceSeed(null)} />
        </TabsContent>

        <TabsContent value="playground">
          <Playground component={selected} />
        </TabsContent>

        <TabsContent value="rules">
          <LibrarianRules />
        </TabsContent>

        <TabsContent value="sources">
          {activeTab === "sources" && <SourcesBrowser />}
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

// ─── Diagram Planner sub-components ──────────────────────────────────────────

interface FetchError {
  message: string;
  llmError: boolean;
}

type VisualLanguageChoice = "auto" | VisualLanguage;
type View = "overview" | "detail";
type PromotionFamily = "tier1" | "knowledge-graph" | "workflow" | "cross-family";
type PromotionLevel = "molecule" | "organism" | "template";
const VIEW_OPTIONS: { value: View; label: string; description: string }[] = [
  { value: "overview", label: "Overview", description: "Terse labels (A5 ≤ 2)" },
  { value: "detail", label: "Detail", description: "Show key properties (A5 = 3)" },
];

const SAMPLE_NEEDS = [
  "map who works where",
  "show how an order flows from cart to delivery",
  "model a library with books, authors, and genres",
  "describe a user registration workflow with email verification",
  "represent a company org chart with departments and roles",
];

const COMPOSITION_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function suggestedTemplateId(plan: DiagramPlan) {
  const slug = plan.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "diagram";
  return `tpl.${slug}`;
}

function PlannerToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-3 py-1.5 text-left transition-colors ${
              value === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span className="text-xs font-medium">{opt.label}</span>
            <span className="ml-1 text-[10px] opacity-70">— {opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Tier1Draft({ draft }: { draft: DraftPlacement[] }) {
  const nodes = draft.filter((d) => !d.from && !d.to);
  const edges = draft.filter((d) => d.from && d.to);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Equal-consequence Tier-1 structure checkpoint — all shapes identical, no emphasis applied.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nodes ({nodes.length})
          </div>
          <div className="space-y-1">
            {nodes.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono text-[10px] text-muted-foreground">{n.id}</span>
                <Badge variant="outline" className="text-[9px]">{n.componentId}</Badge>
                {n.label && <span className="truncate font-medium">{n.label}</span>}
              </div>
            ))}
            {nodes.length === 0 && <p className="text-xs text-muted-foreground">No nodes</p>}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Edges ({edges.length})
          </div>
          <div className="space-y-1">
            {edges.map((e) => (
              <div
                key={e.id ?? `${e.from}-${e.to}`}
                className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {e.from} → {e.to}
                </span>
                {e.label && <span className="truncate text-muted-foreground italic">{e.label}</span>}
              </div>
            ))}
            {edges.length === 0 && <p className="text-xs text-muted-foreground">No edges</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanValidationPanel({ report }: { report: ValidationReport }) {
  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {report.valid ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <span className={`text-sm font-semibold ${report.valid ? "text-green-700" : "text-destructive"}`}>
          {report.valid ? "Plan is valid" : "Plan has errors"}
        </span>
        {errors.length > 0 && (
          <Badge variant="destructive" className="text-[9px]">
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {warnings.length > 0 && (
          <Badge variant="secondary" className="text-[9px]">
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      {report.issues.length > 0 && (
        <div className="space-y-1.5">
          {report.issues.map((issue, i) => (
            <div
              key={i}
              className={`flex gap-2 rounded border px-3 py-2 text-xs ${
                issue.severity === "error"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-amber-300/40 bg-amber-50/60 text-amber-800"
              }`}
            >
              {issue.severity === "error" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <div>
                <span className="font-semibold">{issue.rule}</span>
                {issue.placementId && (
                  <span className="ml-1 font-mono text-[10px] opacity-70">({issue.placementId})</span>
                )}
                <p className="mt-0.5 opacity-90">{issue.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {report.issues.length === 0 && (
        <p className="text-xs text-muted-foreground">No issues found.</p>
      )}
    </div>
  );
}

function JsonCollapsible({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <pre className="overflow-x-auto rounded-b-lg bg-muted/40 px-4 py-3 text-[11px] leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AxisMeaningsPanel({ axisMeanings }: { axisMeanings: DiagramPlan["axisMeanings"] }) {
  const entries = Object.entries(axisMeanings).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([axis, meaning]) => (
        <div
          key={axis}
          className="flex items-center gap-1.5 rounded border border-primary/20 bg-primary/5 px-2 py-1"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{axis}</span>
          <span className="text-[10px] text-muted-foreground">{meaning}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Merged Diagram Planner tab ────────────────────────────────────────────────

type DiagramGeneratorTabProps = {
  initialHint?: string;
  initialNeed?: string;
  initialFamily?: string;
  initialView?: string;
  initialResult?: PlanResult | null;
  initialSnapshotInvalid?: boolean;
  initialTemplateId?: string;
  onOpenWorkspace: (document: EditableGraphDocument) => void;
};

type ShareFamily = "workflow" | "knowledge-graph";

function parseShareFamily(value: string): ShareFamily | undefined {
  return value === "workflow" || value === "knowledge-graph" ? value : undefined;
}

function parseView(value: string): View {
  return VIEW_OPTIONS.some((option) => option.value === value)
    ? (value as View)
    : "overview";
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand?.("copy") ?? false;
  textArea.remove();
  if (!copied) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }
}

function DiagramGeneratorTab({
  initialHint = "",
  initialNeed = "",
  initialFamily = "",
  initialView = "",
  initialResult = null,
  initialSnapshotInvalid = false,
  initialTemplateId = "",
  onOpenWorkspace,
}: DiagramGeneratorTabProps) {
  const { manifest, refetch: refetchManifest } = useManifest();
  const [need, setNeed] = useState(initialNeed || initialHint);
  const [hintBannerDismissed, setHintBannerDismissed] = useState(false);
  const [visualLanguage, setVisualLanguage] = useState<VisualLanguageChoice>("auto");
  const [view, setView] = useState<View>(() => parseView(initialView));
  const [result, setResult] = useState<PlanResult | null>(initialResult);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyLinkError, setCopyLinkError] = useState("");
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionId, setPromotionId] = useState("");
  const [promotionLabel, setPromotionLabel] = useState("");
  const [promotionDescription, setPromotionDescription] = useState("");
  const [promotionFamily, setPromotionFamily] = useState<PromotionFamily>("workflow");
  const [promotionLevel, setPromotionLevel] = useState<PromotionLevel>("template");
  const [promotionSuccess, setPromotionSuccess] = useState<PromoteDiagramPlanResult | null>(null);
  const languageOptions = useMemo(
    () => [
      { value: "auto" as const, label: "Auto-detect", description: "Inferred from your need" },
      ...manifest.visualLanguages.map((language) => ({
        value: language.id,
        label: language.label,
        description: language.description,
      })),
    ],
    [manifest.visualLanguages],
  );

  // --- refinement (raw fetch; no generated hook for /refine) ---
  const [refinement, setRefinement] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<FetchError | null>(null);

  const refinementInputRef = useRef<HTMLTextAreaElement>(null);
  const autoGenerationStartedRef = useRef(false);

  const mutation = useCreateDiagramPlan({
    mutation: {
      onSuccess(data) {
        setResult(data as { plan: DiagramPlan; validation: ValidationReport });
        setRefineError(null);
      },
    },
  });

  const promotion = usePromoteDiagramPlan({
    mutation: {
      onSuccess(data) {
        setPromotionSuccess(data);
        setPromotionOpen(false);
        void refetchManifest();
      },
    },
  });

  useEffect(() => {
    const shareNeed = initialNeed.trim();
    if (!shareNeed || initialResult || autoGenerationStartedRef.current) return;

    autoGenerationStartedRef.current = true;
    const family = parseShareFamily(initialFamily);
    mutation.mutate({
      data: {
        need: shareNeed,
        ...(family ? { family } : {}),
        ...(visualLanguage !== "auto" ? { visualLanguage } : {}),
        view,
      },
    });
  }, [initialFamily, initialNeed, initialResult, mutation, view, visualLanguage]);

  const handleGenerate = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!need.trim() || mutation.isPending) return;
    setResult(null);
    setLinkCopied(false);
    setCopyLinkError("");
    mutation.mutate({
      data: {
        need: need.trim(),
        ...(visualLanguage !== "auto" ? { visualLanguage } : {}),
        view,
      },
    });
  };

  const handleCopyLink = async () => {
    if (!result) return;

    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("tab", "diagram");
      shareUrl.searchParams.set("need", result.plan.need);
      shareUrl.searchParams.set("family", result.plan.family);
      shareUrl.searchParams.set("view", view);
      shareUrl.searchParams.set("snapshot", encodeDiagramSnapshot(result));
      shareUrl.searchParams.delete("hint");
      shareUrl.searchParams.delete("templateId");

      await copyText(shareUrl.toString());
      setLinkCopied(true);
      setCopyLinkError("");
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch (error) {
      setLinkCopied(false);
      setCopyLinkError(error instanceof Error ? error.message : "Could not copy the share link.");
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
        ...(visualLanguage !== "auto" ? { visualLanguage } : {}),
        view,
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
    setLinkCopied(false);
    setCopyLinkError("");
    mutation.reset();
    setRefineError(null);
    setRefinement("");
    setNeed("");
    setPromotionOpen(false);
    setPromotionSuccess(null);
    promotion.reset();
  };

  const openPromotion = () => {
    if (!result) return;
    setPromotionId(suggestedTemplateId(result.plan));
    setPromotionLabel(result.plan.title);
    setPromotionDescription(`Reusable pattern for: ${result.plan.need}`);
    setPromotionFamily(result.plan.family);
    setPromotionLevel("template");
    setPromotionSuccess(null);
    promotion.reset();
    setPromotionOpen(true);
  };

  const handlePromotion = (event: React.FormEvent) => {
    event.preventDefault();
    if (!result || !result.validation.valid || promotion.isPending) return;
    promotion.mutate({
      data: {
        plan: result.plan as PromoteDiagramPlanRequest["plan"],
        id: promotionId.trim(),
        label: promotionLabel.trim(),
        ...(promotionDescription.trim() ? { description: promotionDescription.trim() } : {}),
        family: promotionFamily,
        atomicLevel: promotionLevel,
      },
    });
  };

  const promotionMetadataValid =
    COMPOSITION_ID_PATTERN.test(promotionId.trim()) && promotionLabel.trim().length > 0;

  const templateComposition = initialTemplateId
    ? manifest.compositions.find((composition) => composition.id === initialTemplateId)
    : undefined;

  return (
    <div className="space-y-6">
      {initialHint && !hintBannerDismissed && (
        <div
          className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3"
          data-testid="hint-banner"
          role="note"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-primary">
              {templateComposition
                ? `Template: ${templateComposition.label}`
                : "Template context loaded"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {initialFamily && <span className="mr-2 font-mono">{initialFamily}</span>}
              The description has been pre-filled below. Edit it or generate right away.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHintBannerDismissed(true)}
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss template context"
            data-testid="hint-banner-dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {initialSnapshotInvalid && (
        <div
          className="rounded-md border border-amber-300/50 bg-amber-50/70 px-4 py-3 text-xs text-amber-800"
          role="alert"
          data-testid="invalid-share-snapshot"
        >
          This share link contains an invalid diagram snapshot. The planner will regenerate it from
          the saved request instead.
        </div>
      )}

      {/* Input form */}
      <Card className="p-5">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Describe your diagram need
            </label>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
              disabled={mutation.isPending}
              placeholder='e.g. "map who works where" or "show how an order flows from cart to delivery"'
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              data-testid="input-diagram-need"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted-foreground">Try:</span>
              {SAMPLE_NEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNeed(s)}
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PlannerToggleGroup
              label="Visual language"
              options={languageOptions}
              value={visualLanguage}
              onChange={(v) => setVisualLanguage(v as VisualLanguageChoice)}
            />
            <PlannerToggleGroup
              label="Detail level"
              options={VIEW_OPTIONS}
              value={view}
              onChange={(v) => setView(v as View)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!need.trim() || mutation.isPending}
              data-testid="button-generate-diagram"
              className="gap-2"
            >
              {mutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Building plan…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" />Generate diagram</>
              )}
            </Button>
            {result && !mutation.isPending && (
              <Button variant="outline" onClick={handleReset} data-testid="button-reset-diagram" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />Start over
              </Button>
            )}
            {result && !mutation.isPending && (
              <span className="text-xs text-muted-foreground">
                Last: <span className="italic">"{result.plan.need}"</span>
              </span>
            )}
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {mutation.error instanceof Error
                ? mutation.error.message
                : "An unexpected error occurred. Please try again."}
            </div>
          )}
        </form>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4" data-testid="panel-results">
          {/* Header: title, selected visual language, counts, axis encoding */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{result.plan.title}</h2>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-visual-language">
                  {manifest.visualLanguages.find((language) => language.id === result.plan.visualLanguage)?.label
                    ?? result.plan.visualLanguage
                    ?? result.plan.family}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {result.plan.placements.filter((p) => p.content.from === undefined).length} nodes ·{" "}
                  {result.plan.placements.filter((p) => p.content.from !== undefined).length} edges
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="visual-language-alternatives">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Alternatives
                </span>
                {manifest.visualLanguages
                  .filter((language) => language.id !== result.plan.visualLanguage)
                  .map((language) => (
                    <button
                      key={language.id}
                      type="button"
                      onClick={() => setVisualLanguage(language.id)}
                      className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {language.label}
                    </button>
                  ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-3">
              {Object.keys(result.plan.axisMeanings).length > 0 && (
                <div className="text-right">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Axis encoding
                  </div>
                  <AxisMeaningsPanel axisMeanings={result.plan.axisMeanings} />
                </div>
              )}
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  data-testid="button-copy-diagram-link"
                  className="gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
                {linkCopied && (
                  <span className="text-[10px] text-green-600" role="status">
                    Link copied
                  </span>
                )}
                {copyLinkError && (
                  <span className="max-w-48 text-right text-[10px] text-destructive" role="alert">
                    {copyLinkError}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tier-1 draft + emphasized diagram side-by-side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="default" className="text-[10px] tracking-wide">TIER 1 DRAFT</Badge>
                <span className="text-xs text-muted-foreground">Equal-consequence structure</span>
              </div>
              <Tier1Draft draft={result.plan.tier1Draft} />
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] tracking-wide">EMPHASIZED DIAGRAM</Badge>
                <span className="text-xs text-muted-foreground">Final plan with axis encoding</span>
              </div>
              <div className="overflow-auto rounded-lg border border-border">
                <DiagramRenderer plan={result.plan} />
              </div>
            </Card>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/25 bg-primary/[0.03] p-4" data-testid="panel-open-workspace">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><ArrowRight className="h-4 w-4 text-primary" />Continue editing in Graph Workspace</div>
              <p className="mt-1 text-xs text-muted-foreground">Turn this valid plan into independent node, relationship, and layout data. Your selected family and template context are preserved.</p>
            </div>
            <Button onClick={() => onOpenWorkspace(graphDocumentFromPlan(result.plan, templateComposition ? {
              id: templateComposition.id,
              label: templateComposition.label,
              family: result.plan.family,
              sourceId: templateComposition.sourceMetadata?.sourceId ?? "figma.visual-logic-primitives",
              visualLanguage: result.plan.family === "workflow" ? "workflow" : "knowledge graph",
              mappingStatus: "approved",
            } : undefined))} data-testid="button-open-graph-workspace">
              Open editable graph
            </Button>
          </Card>

          {/* Validation report */}
          <Card className="p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validation report
            </div>
            <PlanValidationPanel report={result.validation} />
          </Card>

          {/* Promotion */}
          {result.validation.valid && (
            <Card className="space-y-4 border-primary/25 p-5" data-testid="panel-promote-template">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <h3 className="text-sm font-semibold">Reusable template</h3>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                    This valid diagram can become a composition in the shared manifest. The development
                    workspace writes it atomically after validating the complete manifest; published
                    deployments remain read-only.
                  </p>
                </div>
                {!promotionOpen && !promotionSuccess && (
                  <Button onClick={openPromotion} data-testid="button-save-as-template">
                    Save as template
                  </Button>
                )}
              </div>

              {promotionOpen && (
                <form onSubmit={handlePromotion} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="promotion-id" className="mb-1 block text-xs font-semibold">
                      Template ID
                    </label>
                    <input
                      id="promotion-id"
                      value={promotionId}
                      onChange={(event) => setPromotionId(event.target.value)}
                      placeholder="tpl.order-fulfillment"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                      data-testid="input-template-id"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Use lowercase dotted segments, e.g. <span className="font-mono">tpl.order-flow</span>.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="promotion-label" className="mb-1 block text-xs font-semibold">
                      Display label
                    </label>
                    <input
                      id="promotion-label"
                      value={promotionLabel}
                      onChange={(event) => setPromotionLabel(event.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="input-template-label"
                    />
                  </div>
                  <div>
                    <label htmlFor="promotion-family" className="mb-1 block text-xs font-semibold">
                      Family
                    </label>
                    <select
                      id="promotion-family"
                      value={promotionFamily}
                      onChange={(event) => setPromotionFamily(event.target.value as PromotionFamily)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="select-template-family"
                    >
                      <option value="workflow">Workflow</option>
                      <option value="knowledge-graph">Knowledge graph</option>
                      <option value="tier1">Tier 1</option>
                      <option value="cross-family">Cross-family</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="promotion-level" className="mb-1 block text-xs font-semibold">
                      Atomic level
                    </label>
                    <select
                      id="promotion-level"
                      value={promotionLevel}
                      onChange={(event) => setPromotionLevel(event.target.value as PromotionLevel)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="select-template-level"
                    >
                      <option value="molecule">Molecule</option>
                      <option value="organism">Organism</option>
                      <option value="template">Template</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="promotion-description" className="mb-1 block text-xs font-semibold">
                      Description <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <textarea
                      id="promotion-description"
                      value={promotionDescription}
                      onChange={(event) => setPromotionDescription(event.target.value)}
                      rows={2}
                      maxLength={500}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="input-template-description"
                    />
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <Button
                      type="submit"
                      disabled={!promotionMetadataValid || promotion.isPending}
                      data-testid="button-confirm-save-template"
                    >
                      {promotion.isPending ? (
                        <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</>
                      ) : (
                        "Save to manifest"
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setPromotionOpen(false)}>
                      Cancel
                    </Button>
                    {!promotionMetadataValid && (
                      <span className="text-xs text-destructive">
                        Enter a label and a valid dotted template ID.
                      </span>
                    )}
                  </div>
                  {promotion.isError && (
                    <div className="sm:col-span-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {promotion.error instanceof Error
                        ? promotion.error.message
                        : "Could not save this template. Please try again."}
                    </div>
                  )}
                </form>
              )}

              {promotionSuccess && (
                <div className="rounded border border-green-300/60 bg-green-50/60 px-3 py-2 text-xs text-green-800">
                  Saved <span className="font-mono">{promotionSuccess.composition.id}</span> to the manifest.
                  It is now available in the Compositions and Templates tabs.
                </div>
              )}
            </Card>
          )}

          {/* Plan notes */}
          {result.plan.notes.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plan notes
              </div>
              <ul className="space-y-1.5">
                {result.plan.notes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 text-primary">·</span>
                    {note}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Raw JSON collapsible */}
          <JsonCollapsible label="Plan JSON (full)" data={result.plan} />

          {/* Refinement */}
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
                Refine this diagram
              </label>
              <textarea
                ref={refinementInputRef}
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine();
                }}
                disabled={refining}
                placeholder='e.g. "also show the returns flow" or "remove the warehouse step"'
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                data-testid="input-diagram-refinement"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                The AI will update the diagram while preserving everything you haven't asked to change. Tip: ⌘↵ / Ctrl↵
              </p>
            </div>
            <Button
              onClick={handleRefine}
              disabled={refining || !refinement.trim()}
              data-testid="button-refine-diagram"
              className="gap-2"
            >
              {refining ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Refining…</>
              ) : (
                <><ArrowRight className="h-3.5 w-3.5" />Apply refinement</>
              )}
            </Button>
            {refineError && <ErrorBanner error={refineError} onDismiss={() => setRefineError(null)} />}
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!result && !mutation.isPending && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <div className="mb-3 rounded-full bg-primary/10 p-4">
            <Play className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mb-1 text-sm font-semibold">Enter a need to get started</h3>
          <p className="max-w-sm text-xs text-muted-foreground">
            Describe what you want to map or model — the librarian will build a Tier-1 draft, apply
            emphasis, validate the plan, and render the diagram.
          </p>
        </div>
      )}
    </div>
  );
}

async function postJson(url: string, body: unknown): Promise<{ plan: DiagramPlan; validation: ValidationReport }> {
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
  return r.json();
}
