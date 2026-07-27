// End-to-end demo: POST a need to the librarian API, render the returned plan.
// The api-server owns the /api path on the shared proxy.
import { useEffect, useState } from "react";
import type { DiagramPlan, ValidationReport } from "@workspace/wireframe-librarian";
import { SheetHeader, INK } from "./_shared/tokens";
import PlanRenderer from "./PlanRenderer";

const NEED = "map who works where";

export default function LibrarianPlanDemo() {
  const [result, setResult] = useState<{ plan: DiagramPlan; validation: ValidationReport } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/librarian/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ need: NEED }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
        return r.json();
      })
      .then(setResult)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="p-8" style={{ background: "white", minHeight: "100vh" }}>
      <SheetHeader
        title="Librarian → renderer spoke"
        subtitle={`Live plan for the need “${NEED}” — fetched from POST /api/librarian/plan and drawn by PlanRenderer. Axes drive every visual channel.`}
      />
      {error && (
        <pre className="text-sm text-red-600 whitespace-pre-wrap">
          Could not reach the librarian API. Is the API Server workflow running?{"\n"}{error}
        </pre>
      )}
      {result && (
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
