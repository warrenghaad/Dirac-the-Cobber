/**
 * Regression tests confirming that composition routes resolve against the live
 * (API-sourced) manifest rather than the bundled static copy.
 *
 * The `useManifest` hook is mocked with an extended manifest that contains a
 * composition / component not present in the bundled JSON.  Each routed page
 * must render its content (not the "not found" fallback) using that live data.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ManifestData } from "@/lib/library";
import { MANIFEST as STATIC_MANIFEST } from "@/lib/library";

// ─── Mock wouter ──────────────────────────────────────────────────────────────
const mockParams: Record<string, string> = {};
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/", () => {}],
  useSearch: () => "",
  useParams: () => mockParams,
}));

// ─── Mock CompositionCanvas (keep tests fast) ─────────────────────────────────
vi.mock("@/components/CompositionCanvas", () => ({
  CompositionCanvas: ({ composition }: { composition: { id: string } }) => (
    <div data-testid={`composition-canvas-${composition.id}`} />
  ),
  layoutSlots: () => [],
  downloadSVG: () => {},
}));

// ─── A manifest that has an API-only composition and component ─────────────────
const API_ONLY_COMPONENT = {
  id: "api-only.node",
  family: "tier1",
  tier: 1,
  shape: "rect",
  axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 0 },
  maxAxes: { a1: 2, a2: 2, a3: 3, a4: 2, a5: 2 },
  figmaNodeId: null,
};

const API_ONLY_COMPOSITION = {
  id: "api-only-composition",
  atomicLevel: "molecule",
  label: "API Only Composition",
  description: "Only exists in the live manifest, not the bundle.",
  family: "workflow",
  slots: [
    {
      componentId: "api-only.node",
      role: "node",
      position: { x: 0.5, y: 0.5 },
    },
  ],
};

const LIVE_MANIFEST: ManifestData = {
  ...STATIC_MANIFEST,
  components: [...STATIC_MANIFEST.components, API_ONLY_COMPONENT],
  compositions: [...STATIC_MANIFEST.compositions, API_ONLY_COMPOSITION],
};

// ─── Mock useManifest with the live manifest ──────────────────────────────────
vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({
    manifest: LIVE_MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  ManifestProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CompositionPage from "@/pages/composition";
import TemplateEditorPage from "@/pages/template-editor";

// ─── CompositionPage ──────────────────────────────────────────────────────────

describe("CompositionPage – live manifest", () => {
  it("resolves an API-only composition by id and renders its label", () => {
    mockParams.id = API_ONLY_COMPOSITION.id;
    render(<CompositionPage />);

    // Should NOT show the not-found fallback
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();

    // Should render the composition label from the live manifest
    expect(
      screen.getAllByText(API_ONLY_COMPOSITION.label).length
    ).toBeGreaterThan(0);
  });

  it("shows 'not found' for an id that exists in neither bundle nor live manifest", () => {
    mockParams.id = "does-not-exist-anywhere";
    render(<CompositionPage />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});

// ─── TemplateEditorPage ───────────────────────────────────────────────────────

describe("TemplateEditorPage – live manifest", () => {
  it("resolves an API-only composition and renders its label", () => {
    mockParams.id = API_ONLY_COMPOSITION.id;
    render(<TemplateEditorPage />);

    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(API_ONLY_COMPOSITION.label).length
    ).toBeGreaterThan(0);
  });
});
