import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MANIFEST } from "@/lib/library";
import { blankGraphDocument, graphDocumentFromComposition, parseStoredGraphDocument } from "@/lib/graph-document";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({
    manifest: MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { GraphWorkspace } from "@/components/GraphWorkspace";

const STORAGE_KEY = "tiered-wireframe-library.graph-workspace.v1";

describe("GraphWorkspace", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("synchronizes data edits with the canvas and persists them", async () => {
    render(<GraphWorkspace seedDocument={blankGraphDocument("knowledge-graph")} />);

    fireEvent.click(screen.getByTestId("button-add-node"));
    fireEvent.click(screen.getByTestId("button-add-node"));
    fireEvent.change(screen.getByLabelText("Label for node-1"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Type for node-1"), { target: { value: "person" } });
    fireEvent.click(screen.getByTestId("button-add-edge"));

    expect(screen.getByTestId("graph-node-node-1")).toHaveAttribute("aria-label", "Alice, person");
    expect(screen.getByTestId("graph-edge-edge-1")).toBeInTheDocument();

    await waitFor(() => {
      const stored = parseStoredGraphDocument(window.localStorage.getItem(STORAGE_KEY));
      expect(stored?.nodes.find((node) => node.id === "node-1")?.label).toBe("Alice");
      expect(stored?.edges).toHaveLength(1);
    });
  });

  it("supports canvas connection mode and clear invalid-connection feedback", () => {
    const document = graphDocumentFromComposition(MANIFEST.compositions.find((item) => item.id === "tpl.simple-workflow")!);
    document.edges = [];
    render(<GraphWorkspace seedDocument={document} />);

    fireEvent.click(screen.getByTestId("button-connect-nodes"));
    fireEvent.click(screen.getByTestId(`graph-node-${document.nodes[0].id}`));
    fireEvent.click(screen.getByTestId(`graph-node-${document.nodes[1].id}`));

    expect(screen.getByTestId("edge-row-edge-1")).toBeInTheDocument();
    const row = within(screen.getByTestId("edge-row-edge-1"));
    fireEvent.change(row.getByLabelText("Target for edge-1"), { target: { value: document.nodes[0].id } });
    expect(screen.getByTestId("badge-graph-validity")).toHaveTextContent("Needs attention");
    expect(screen.getByTestId("panel-graph-validation")).toHaveTextContent("two different nodes");
  });

  it("persists node positions after a canvas drag", async () => {
    const document = graphDocumentFromComposition(MANIFEST.compositions.find((item) => item.id === "mol.kg-entity-labeled")!);
    const original = { ...document.nodes[0].position };
    render(<GraphWorkspace seedDocument={document} />);

    const canvas = screen.getByRole("application");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 960,
      bottom: 600,
      width: 960,
      height: 600,
      toJSON: () => ({}),
    });
    const node = screen.getByTestId(`graph-node-${document.nodes[0].id}`);
    const pointerEvent = (type: string, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: clientY },
      });
      return event;
    };
    fireEvent(node, pointerEvent("pointerdown", original.x, original.y));
    fireEvent(canvas, pointerEvent("pointermove", original.x + 80, original.y + 60));
    fireEvent(canvas, pointerEvent("pointerup", original.x + 80, original.y + 60));

    await waitFor(() => {
      const stored = parseStoredGraphDocument(window.localStorage.getItem(STORAGE_KEY));
      expect(stored?.nodes[0].position.x).toBeGreaterThan(original.x);
      expect(stored?.nodes[0].position.y).toBeGreaterThan(original.y);
    });
  });

  it("starts from an approved baseline and restores a locally saved document", async () => {
    const { unmount } = render(<GraphWorkspace seedDocument={blankGraphDocument()} />);
    fireEvent.change(screen.getByLabelText("Start from approved baseline"), { target: { value: "tpl.knowledge-graph-overview" } });
    fireEvent.click(screen.getByTestId("button-apply-template"));
    expect(screen.getByText("Knowledge Graph Overview", { selector: "strong" })).toBeInTheDocument();

    await waitFor(() => expect(parseStoredGraphDocument(window.localStorage.getItem(STORAGE_KEY))?.template.id).toBe("tpl.knowledge-graph-overview"));
    unmount();
    render(<GraphWorkspace />);
    expect(screen.getByText("Knowledge Graph Overview", { selector: "h2" })).toBeInTheDocument();
  });
});