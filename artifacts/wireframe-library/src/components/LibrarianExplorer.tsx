import { useState } from "react";
import { useCreateDiagramPlan } from "@workspace/api-client-react";
import type { DiagramPlan, DraftPlacement, ValidationReport } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlanRenderer } from "@/components/PlanRenderer";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Play } from "lucide-react";

// ── family / view options ────────────────────────────────────────────────────

type Family = "auto" | "workflow" | "knowledge-graph";
type View = "overview" | "detail";

const FAMILY_OPTIONS: { value: Family; label: string; description: string }[] = [
  { value: "auto", label: "Auto-detect", description: "Inferred from your need" },
  { value: "workflow", label: "Workflow", description: "Process / sequence" },
  { value: "knowledge-graph", label: "Knowledge Graph", description: "Entities & relations" },
];

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

// ── sub-components ────────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
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
                <Badge variant="outline" className="text-[9px]">
                  {n.componentId}
                </Badge>
                {n.label && <span className="truncate font-medium">{n.label}</span>}
              </div>
            ))}
            {nodes.length === 0 && (
              <p className="text-xs text-muted-foreground">No nodes</p>
            )}
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
            {edges.length === 0 && (
              <p className="text-xs text-muted-foreground">No edges</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationPanel({ report }: { report: ValidationReport }) {
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
                  <span className="ml-1 font-mono text-[10px] opacity-70">
                    ({issue.placementId})
                  </span>
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

function AxisMeanings({ axisMeanings }: { axisMeanings: DiagramPlan["axisMeanings"] }) {
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

// ── main component ────────────────────────────────────────────────────────────

export function LibrarianExplorer() {
  const [need, setNeed] = useState("");
  const [family, setFamily] = useState<Family>("auto");
  const [view, setView] = useState<View>("overview");
  const [result, setResult] = useState<{ plan: DiagramPlan; validation: ValidationReport } | null>(null);

  const mutation = useCreateDiagramPlan({
    mutation: {
      onSuccess(data) {
        setResult(data as { plan: DiagramPlan; validation: ValidationReport });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!need.trim()) return;
    mutation.mutate({
      data: {
        need: need.trim(),
        ...(family !== "auto" ? { family } : {}),
        view,
      },
    });
  };

  const handleSample = (sample: string) => {
    setNeed(sample);
  };

  return (
    <div className="space-y-6">
      {/* Input form */}
      <Card className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Describe your need
            </label>
            <textarea
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              placeholder='e.g. "map who works where" or "show how an order flows from cart to delivery"'
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="input-need"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted-foreground">Try:</span>
              {SAMPLE_NEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSample(s)}
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ToggleGroup
              label="Diagram family"
              options={FAMILY_OPTIONS}
              value={family}
              onChange={(v) => setFamily(v as Family)}
            />
            <ToggleGroup
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
              data-testid="button-generate"
              className="gap-2"
            >
              {mutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {mutation.isPending ? "Building plan…" : "Generate diagram"}
            </Button>
            {result && !mutation.isPending && (
              <span className="text-xs text-muted-foreground">
                Last generated for: <span className="italic">"{result.plan.need}"</span>
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
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{result.plan.title}</h2>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {result.plan.family}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {result.plan.placements.filter((p) => p.content.from === undefined).length} nodes ·{" "}
                  {result.plan.placements.filter((p) => p.content.from !== undefined).length} edges
                </span>
              </div>
            </div>
            {Object.keys(result.plan.axisMeanings).length > 0 && (
              <div className="text-right">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Axis encoding
                </div>
                <AxisMeanings axisMeanings={result.plan.axisMeanings} />
              </div>
            )}
          </div>

          {/* Tier-1 draft + final diagram side-by-side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="default" className="text-[10px] tracking-wide">
                  TIER 1 DRAFT
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Equal-consequence structure
                </span>
              </div>
              <Tier1Draft draft={result.plan.tier1Draft} />
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] tracking-wide">
                  EMPHASIZED DIAGRAM
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Final plan with axis encoding
                </span>
              </div>
              <div className="overflow-auto rounded-lg border border-border">
                <PlanRenderer plan={result.plan} />
              </div>
            </Card>
          </div>

          {/* Validation report */}
          <Card className="p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validation report
            </div>
            <ValidationPanel report={result.validation} />
          </Card>

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

export default LibrarianExplorer;
