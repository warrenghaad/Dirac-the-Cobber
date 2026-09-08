/**
 * Render tests for TemplateCard (library.tsx) and TierSummary (template-editor.tsx).
 *
 * Covers:
 * - TemplateCard renders a thumbnail and label for each composition in the manifest
 * - TierSummary does NOT show the tier-guard-banner when ≤ 1 Tier-4 slot
 * - TierSummary DOES show the tier-guard-banner when > 1 Tier-4 slot
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock wouter (Link requires a router context) ──────────────────────────────
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", () => {}],
  useSearch: () => "",
  useParams: () => ({}),
}));

// ─── Mock CompositionCanvas (keeps tests fast; we're testing structure not SVG) ─
vi.mock("@/components/CompositionCanvas", () => ({
  CompositionCanvas: ({ composition }: { composition: { id: string } }) => (
    <div data-testid={`composition-canvas-${composition.id}`} />
  ),
  layoutSlots: () => [],
  downloadSVG: () => {},
}));

// ─── Provide a static manifest so useManifest() works without a real API ───────
import { MANIFEST } from "@/lib/library";
vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({
    manifest: MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  ManifestProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TemplateCard } from "@/pages/library";
import { TierSummary } from "@/pages/template-editor";
import type { Composition } from "@/lib/library";
import type { AxesOverrideMap } from "@/components/CompositionCanvas";

// ─── TemplateCard ──────────────────────────────────────────────────────────────

describe("TemplateCard", () => {
  const templateCompositions = MANIFEST.compositions.filter((c) =>
    ["molecule", "organism", "template"].includes(c.atomicLevel)
  );

  it("there is at least one composition to render", () => {
    expect(templateCompositions.length).toBeGreaterThan(0);
  });

  for (const composition of templateCompositions) {
    it(`renders without crashing for composition "${composition.id}"`, () => {
      const { container } = render(<TemplateCard composition={composition} />);
      expect(container.firstChild).not.toBeNull();
    });

    it(`shows the label for composition "${composition.id}"`, () => {
      render(<TemplateCard composition={composition} />);
      expect(screen.getAllByText(composition.label).length).toBeGreaterThan(0);
    });

    it(`renders a thumbnail canvas for composition "${composition.id}"`, () => {
      render(<TemplateCard composition={composition} />);
      expect(
        screen.getByTestId(`composition-canvas-${composition.id}`)
      ).toBeInTheDocument();
    });
  }
});

// ─── TierSummary ──────────────────────────────────────────────────────────────

/** A minimal composition with 3 slots — real component IDs so clamp works. */
const SAMPLE_COMPOSITION: Composition = {
  id: "test-composition",
  atomicLevel: "organism",
  label: "Test Composition",
  description: "Used for TierSummary tests",
  family: "workflow",
  slots: [
    { componentId: "wf.task", role: "task-1", position: { x: 0.2, y: 0.5 } },
    { componentId: "wf.task", role: "task-2", position: { x: 0.5, y: 0.5 } },
    { componentId: "wf.task", role: "task-3", position: { x: 0.8, y: 0.5 } },
  ],
};

describe("TierSummary – tier-guard-banner", () => {
  it("does NOT render the banner when there are zero Tier-4 slots", () => {
    const overrides: AxesOverrideMap = {};
    render(
      <TierSummary composition={SAMPLE_COMPOSITION} axesOverrides={overrides} />
    );
    expect(screen.queryByTestId("tier-guard-banner")).not.toBeInTheDocument();
  });

  it("does NOT render the banner when exactly one slot is Tier-4", () => {
    // a1: 4 exceeds wf.task maxAxes.a1 (3), but overrides bypass clamp in TierSummary
    const overrides: AxesOverrideMap = { 0: { a1: 4 } };
    render(
      <TierSummary composition={SAMPLE_COMPOSITION} axesOverrides={overrides} />
    );
    expect(screen.queryByTestId("tier-guard-banner")).not.toBeInTheDocument();
  });

  it("renders the banner when two or more slots are Tier-4", () => {
    const overrides: AxesOverrideMap = { 0: { a1: 4 }, 1: { a1: 4 } };
    render(
      <TierSummary composition={SAMPLE_COMPOSITION} axesOverrides={overrides} />
    );
    expect(screen.getByTestId("tier-guard-banner")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("2 Tier-4 slots detected");
  });

  it("banner counts three Tier-4 slots correctly", () => {
    const overrides: AxesOverrideMap = { 0: { a1: 4 }, 1: { a1: 4 }, 2: { a1: 4 } };
    render(
      <TierSummary composition={SAMPLE_COMPOSITION} axesOverrides={overrides} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("3 Tier-4 slots detected");
  });

  it("renders per-tier badges for present tiers", () => {
    // With default axes for wf.task: a1=1,a2=2,a3=2,a4=1,a5=1 → effectiveTier = 2
    const overrides: AxesOverrideMap = {};
    render(
      <TierSummary composition={SAMPLE_COMPOSITION} axesOverrides={overrides} />
    );
    expect(screen.getByTestId("tier-summary-t2")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-summary-t4")).not.toBeInTheDocument();
  });
});

