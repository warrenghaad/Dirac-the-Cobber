import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  MANIFEST,
  sizeOf,
  type LibraryComponent,
  type ManifestData,
} from "@/lib/library";
import type { DiagramPlan } from "@/lib/diagram-types";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: vi.fn(),
}));

import { useManifest } from "@/lib/manifest-context";
import { Glyph, glyphColors } from "@/components/Glyph";
import { CompositionCanvas, layoutSlots } from "@/components/CompositionCanvas";
import { DiagramRenderer } from "@/components/DiagramRenderer";

const LIVE_TOKENS: ManifestData["tokens"] = {
  ...MANIFEST.tokens,
  ink: "#123456",
  paper: "#FEDCBA",
  accent: "#ABCDEF",
  palette: ["#2468AC"],
  tintSteps: [1, 0.8, 0.6, 0.4, 0.2],
  sizeScale: {
    ...MANIFEST.tokens.sizeScale,
    widths: [10, 20, 30, 40, 50],
    aspect: 2,
  },
  strokeScale: [9, 10, 11, 12, 13],
  dashVocabulary: {
    ...MANIFEST.tokens.dashVocabulary,
    dashed: [13, 7],
  },
};

const COMPONENT: LibraryComponent = {
  id: "test.subclass",
  family: "tier1",
  tier: 1,
  shape: "rectangle",
  axes: { a1: 1, a2: 1, a3: 2, a4: 2, a5: 1 },
  maxAxes: { a1: 4, a2: 4, a3: 4, a4: 4, a5: 4 },
  figmaNodeId: null,
};

const LIVE_MANIFEST: ManifestData = {
  ...MANIFEST,
  tokens: LIVE_TOKENS,
  components: [...MANIFEST.components, COMPONENT],
};

beforeEach(() => {
  vi.mocked(useManifest).mockReturnValue({
    manifest: LIVE_MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("live manifest design tokens", () => {
  it("updates an already-mounted glyph when the manifest refreshes", () => {
    vi.mocked(useManifest).mockReturnValue({
      manifest: MANIFEST,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container, rerender } = render(
      <Glyph component={COMPONENT} axes={COMPONENT.axes} name="Refreshing node" />,
    );

    const fallbackSize = sizeOf(COMPONENT.axes.a3, MANIFEST.tokens);
    expect(container.querySelector("svg")).toHaveAttribute(
      "width",
      String(fallbackSize.w + 6),
    );
    expect(container.querySelector("rect")).toHaveAttribute(
      "stroke",
      MANIFEST.tokens.accent,
    );

    vi.mocked(useManifest).mockReturnValue({
      manifest: LIVE_MANIFEST,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    rerender(
      <Glyph component={COMPONENT} axes={COMPONENT.axes} name="Refreshing node" />,
    );

    expect(container.querySelector("svg")).toHaveAttribute("width", "36");
    expect(container.querySelector("rect")).toHaveAttribute("stroke", LIVE_TOKENS.accent);
    expect(container.querySelector("rect")).toHaveAttribute("stroke-width", "11");
    expect(container.querySelector("rect")).toHaveAttribute("stroke-dasharray", "13 7");
  });

  it("uses live size and color values in glyphs and token utilities", () => {
    expect(sizeOf(2, LIVE_TOKENS)).toEqual({ w: 30, h: 60 });
    expect(glyphColors(COMPONENT.axes, 0, LIVE_TOKENS)).toEqual({
      stroke: LIVE_TOKENS.accent,
      fill: "rgba(171, 205, 239, 0.2)",
    });

    const { container } = render(
      <Glyph component={COMPONENT} axes={COMPONENT.axes} name="Live node" />,
    );

    const svg = container.querySelector("svg");
    const rect = container.querySelector("rect");
    const label = container.querySelector("text");

    expect(svg).toHaveAttribute("width", "36");
    expect(svg).toHaveAttribute("height", "66");
    expect(rect).toHaveAttribute("stroke", LIVE_TOKENS.accent);
    expect(rect).toHaveAttribute("stroke-width", "11");
    expect(rect).toHaveAttribute("stroke-dasharray", "13 7");
    expect(label).toHaveAttribute("fill", LIVE_TOKENS.ink);
  });

  it("uses live size values when laying out composition slots", () => {
    const composition = {
      id: "test.composition",
      atomicLevel: "molecule",
      label: "Test",
      description: "Test composition",
      family: "tier1",
      slots: [
        {
          componentId: COMPONENT.id,
          role: "node",
          position: { x: 0.5, y: 0.5 },
        },
      ],
    };

    const [record] = layoutSlots(
      composition,
      { w: 640, h: 480 },
      {},
      [COMPONENT],
      LIVE_TOKENS,
    );

    expect(record.sw).toBe(30);
    expect(record.sh).toBe(60);

    const { container } = render(<CompositionCanvas composition={composition} />);
    const rect = container.querySelector("rect");
    expect(rect).toHaveAttribute("width", "30");
    expect(rect).toHaveAttribute("height", "60");
    expect(rect).toHaveAttribute("stroke-width", "11");
    expect(rect).toHaveAttribute("stroke-dasharray", "13 7");
  });

  it("uses live paper, ink, palette, and size values in generated diagrams", () => {
    const plan: DiagramPlan = {
      need: "test",
      title: "Live tokens",
      family: "workflow",
      axisMeanings: {},
      tier1Draft: [],
      notes: [],
      placements: [
        {
          id: "node-1",
          componentId: "wf.task",
          axes: { a1: 1, a2: 2, a3: 2, a4: 2, a5: 1 },
          content: { label: "Node", hueIndex: 0 },
        },
        {
          id: "node-2",
          componentId: "wf.task",
          axes: { a1: 1, a2: 2, a3: 2, a4: 2, a5: 1 },
          content: { label: "Node 2", hueIndex: 0 },
        },
        {
          id: "edge-1",
          componentId: "wf.edge",
          axes: { a1: 1, a2: 2, a3: 2, a4: 2, a5: 0 },
          content: { from: "node-1", to: "node-2", hueIndex: 0 },
        },
      ],
    };

    const { container } = render(<DiagramRenderer plan={plan} />);
    const svg = container.querySelector("svg");
    const rect = container.querySelector("rect");
    const label = container.querySelector("text");
    const line = container.querySelector("line");

    expect(svg).toHaveStyle({ background: LIVE_TOKENS.paper });
    expect(rect).toHaveAttribute("width", "30");
    expect(rect).toHaveAttribute("height", "60");
    expect(rect).toHaveAttribute("stroke", LIVE_TOKENS.palette[0]);
    expect(rect).toHaveAttribute("stroke-width", "11");
    expect(rect).toHaveAttribute("fill", "rgba(36, 104, 172, 0.2)");
    expect(label).toHaveAttribute("fill", LIVE_TOKENS.ink);
    expect(line).toHaveAttribute("stroke-width", "11");
    expect(line).toHaveAttribute("stroke-dasharray", "13 7");
  });
});
