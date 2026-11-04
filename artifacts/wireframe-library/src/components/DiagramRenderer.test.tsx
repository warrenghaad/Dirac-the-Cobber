import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiagramPlan } from "@workspace/api-client-react";
import { MANIFEST } from "@/lib/library";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({
    manifest: MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/CompositionCanvas", () => ({
  CompositionCanvas: ({ composition }: { composition: { id: string } }) => (
    <g data-testid={`composition-${composition.id}`} />
  ),
}));

vi.mock("@/components/Glyph", () => ({
  Glyph: ({ component }: { component: { id: string } }) => (
    <g data-testid={`glyph-${component.id}`} />
  ),
}));

import { DiagramRenderer } from "@/components/DiagramRenderer";

const AXES = { a1: 1, a2: 2, a3: 2, a4: 1, a5: 1 };

function planWith(compositionId?: string): DiagramPlan {
  return {
    need: "show a task",
    title: "Show a task",
    family: "workflow",
    axisMeanings: {},
    tier1Draft: [],
    placements: [
      {
        id: "task",
        componentId: "wf.task",
        axes: AXES,
        content: { label: "Task", compositionId },
      },
    ],
    notes: [],
  };
}

describe("DiagramRenderer composition nodes", () => {
  it("renders CompositionCanvas when compositionId resolves in the manifest", () => {
    render(<DiagramRenderer plan={planWith("org.workflow-decision-branch")} />);

    expect(screen.getByTestId("composition-org.workflow-decision-branch")).toBeInTheDocument();
    expect(screen.queryByTestId("glyph-wf.task")).not.toBeInTheDocument();
  });

  it("falls back to Glyph when compositionId is absent or unknown", () => {
    const { rerender } = render(<DiagramRenderer plan={planWith()} />);
    expect(screen.getByTestId("glyph-wf.task")).toBeInTheDocument();

    rerender(<DiagramRenderer plan={planWith("org.does-not-exist")} />);
    expect(screen.getByTestId("glyph-wf.task")).toBeInTheDocument();
  });
});