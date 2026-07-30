// End-to-end demo: POST a need to the librarian API, render the returned plan.
// The api-server owns the /api path on the shared proxy.
import { useCallback, useEffect, useState } from "react";
import type { DiagramPlan, ValidationReport } from "@workspace/wireframe-librarian";
import { SheetHeader, INK } from "./_shared/tokens";
import PlanRenderer from "./PlanRenderer";

const NEED = "map who works where";

interface FetchError {
  message: string;
  /** True when the API server responded but LLM extraction failed server-side. */
  llmError: boolean;
}

export default function LibrarianPlanDemo() {
  const [result, setResult] = useState<{ plan: DiagramPlan; validation: ValidationReport } | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPlan = useCallback(() => {
    setError(null);
    setLoading(true);

    fetch("/api/librarian/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ need: NEED }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw { message: body?.message ?? `API ${r.status}`, llmError: body?.llmError === true };
        }
        return r.json();
      })
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        const fe = e as Partial<FetchError>;
        setError({
          message: fe.message ?? String(e),
          llmError: fe.llmError === true,
        });
        setLoading(false);
      });
  }, []);

  // Fetch on first render
  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return (
    <div className="p-8" style={{ background: "white", minHeight: "100vh" }}>
      <SheetHeader
        title="Librarian → renderer spoke"
        subtitle={`Live plan for the need "${NEED}" — fetched from POST /api/librarian/plan and drawn by PlanRenderer. Axes drive every visual channel.`}
      />
      {loading && (
        <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Generating diagram…
        </div>
      )}
      {error && !loading && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">
            {error.llmError ? "AI extraction failed" : "Could not reach the librarian API"}
          </p>
          <p className="whitespace-pre-wrap">{error.message}</p>
          {!error.llmError && (
            <p className="mt-1 text-red-500 text-xs">Is the API Server workflow running?</p>
          )}
          <button
            onClick={fetchPlan}
            className="mt-3 rounded border border-red-400 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
      {result && !loading && (
        <>
          <PlanRenderer plan={result.plan} />
          <div className="mt-4 text-sm" style={{ color: INK }}>
            <span className="font-semibold">Validation:</span>{" "}
            {result.validation.valid ? "✓ plan satisfies all library constraints" : "✗ violations found"}
            {result.validation.issues.map((i) => (
              <div key={i.rule + (i.placementId ?? "")} className="text-red-600">
                [{i.severity}] {i.rule}: {i.message}
              </div>
            ))}
            {result.plan.notes.map((n) => (
              <div key={n} className="text-gray-500">{n}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
