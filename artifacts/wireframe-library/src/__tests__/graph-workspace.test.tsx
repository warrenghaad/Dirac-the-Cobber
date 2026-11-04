import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MANIFEST } from "@/lib/library";
import { blankGraphDocument, graphDocumentFromComposition, parseStoredGraphDocument, parseStoredWorkspaceCollection } from "@/lib/graph-document";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({
    manifest: MANIFEST,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { GraphWorkspace } from "@/components/GraphWorkspace";

const COLLECTION_KEY = "tiered-wireframe-library.workspaces.v1";
const RECOVERY_KEY = "tiered-wireframe-library.workspaces.recovery.v1";
const LEGACY_KEY = "tiered-wireframe-library.graph-workspace.v1";

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
      const col = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      const stored = col?.workspaces.find(w => w.id === col.activeId);
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
      const col = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      const stored = col?.workspaces.find(w => w.id === col.activeId);
      expect(stored?.nodes[0].position.x).toBeGreaterThan(original.x);
      expect(stored?.nodes[0].position.y).toBeGreaterThan(original.y);
    });
  });

  it("starts from an approved baseline and restores a locally saved document", async () => {
    const { unmount } = render(<GraphWorkspace seedDocument={blankGraphDocument()} />);
    fireEvent.change(screen.getByLabelText("Start from approved baseline"), { target: { value: "tpl.knowledge-graph-overview" } });
    fireEvent.click(screen.getByTestId("button-apply-template"));
    expect(screen.getByText("Knowledge Graph Overview", { selector: "strong" })).toBeInTheDocument();

    await waitFor(() => {
      const col = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      expect(col?.workspaces.find(w => w.id === col.activeId)?.template.id).toBe("tpl.knowledge-graph-overview");
    });
    unmount();
    render(<GraphWorkspace />);
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Knowledge Graph Overview");
  });

  it("migrates legacy single-document format to workspace format", async () => {
    const legacyDoc = blankGraphDocument();
    legacyDoc.id = "legacy-1";
    legacyDoc.title = "Legacy Title";
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyDoc));

    render(<GraphWorkspace />);

    // Save triggered by effect initializing collection
    await waitFor(() => {
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Legacy Title");
    const col = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
    expect(col?.workspaces.some(w => w.id === legacyDoc.id)).toBe(true);
  });

  it("migrates legacy documents with positions produced outside the canvas bounds", async () => {
    const legacyDoc = blankGraphDocument();
    legacyDoc.id = "legacy-large";
    legacyDoc.title = "Large legacy graph";
    legacyDoc.nodes = Array.from({ length: 13 }, (_, index) => ({
      id: `node-${index + 1}`,
      label: `Node ${index + 1}`,
      typeTag: "entity",
      properties: [],
      componentId: "kg.entity",
      axes: { a1: 1, a2: 0, a3: 2, a4: 0, a5: 2 },
      position: { x: 150, y: index === 12 ? 650 : 140 },
    }));
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyDoc));

    render(<GraphWorkspace />);

    await waitFor(() => {
      const collection = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      expect(collection?.workspaces[0].nodes[12].position.y).toBe(650);
    });
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Large legacy graph");
  });

  it("reports malformed collection data explicitly without crashing", async () => {
    const valid = blankGraphDocument();
    valid.title = "Recovered Title";
    window.localStorage.setItem(COLLECTION_KEY, JSON.stringify({
      version: 1,
      activeId: valid.id,
      workspaces: [valid, { id: "damaged" }],
    }));

    render(<GraphWorkspace />);

    expect(screen.getByTestId("text-persistence-status")).toHaveTextContent("Recovered 1 valid workspace; skipped 1 damaged entry. Original data was preserved.");
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Recovered Title");
    expect(window.localStorage.getItem(RECOVERY_KEY)).toContain('"damaged"');
  });

  it("preserves separate damaged payloads instead of replacing an earlier backup", async () => {
    window.localStorage.setItem(RECOVERY_KEY, "earlier incident");
    window.localStorage.setItem(COLLECTION_KEY, '{"version":1,"workspaces":"damaged"}');

    render(<GraphWorkspace />);

    await waitFor(() => expect(window.localStorage.getItem(`${RECOVERY_KEY}.2`)).toContain('"damaged"'));
    expect(window.localStorage.getItem(RECOVERY_KEY)).toBe("earlier incident");
  });

  it("blocks destructive saves when damaged data cannot be backed up", async () => {
    window.localStorage.setItem(COLLECTION_KEY, '{"version":1,"workspaces":"damaged"}');
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (key.toString().startsWith(RECOVERY_KEY)) throw new DOMException("Storage full", "QuotaExceededError");
      originalSetItem(key as string, value as string);
    });

    render(<GraphWorkspace />);
    fireEvent.click(screen.getByTestId("button-add-node"));

    await waitFor(() => expect(screen.getByTestId("text-persistence-status")).toHaveTextContent("Storage limit reached"));
    expect(window.localStorage.getItem(COLLECTION_KEY)).toContain('"workspaces":"damaged"');
    expect(screen.queryByLabelText("Label for node-1")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("handles quota storage errors when saving collections", async () => {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
      if (key === COLLECTION_KEY) throw new DOMException("Storage full", "QuotaExceededError");
      originalSetItem(key as string, val as string);
    });

    render(<GraphWorkspace seedDocument={blankGraphDocument()} />);

    fireEvent.click(screen.getByTestId("button-add-node"));

    await waitFor(() => {
      expect(screen.getByText(/Storage limit reached/)).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("allows duplicating, naming, and archiving a workspace", async () => {
    render(<GraphWorkspace seedDocument={blankGraphDocument()} />);

    fireEvent.change(screen.getByTestId("input-workspace-title"), { target: { value: "Project Alpha" } });
    fireEvent.blur(screen.getByTestId("input-workspace-title"));
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Project Alpha");

    fireEvent.click(screen.getByTestId("button-duplicate-workspace"));
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Project Alpha (Copy)");

    fireEvent.click(screen.getByTestId("button-archive-workspace"));
    expect(screen.getByText("Workspace archived.")).toBeInTheDocument();

    // It should switch back to the remaining active workspace
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Project Alpha");

    fireEvent.change(screen.getByTestId("select-workspace"), {
      target: { value: screen.getByRole("option", { name: "Project Alpha (Copy) (Archived)" }).getAttribute("value") },
    });
    expect(screen.getByTestId("input-workspace-title")).toHaveValue("Project Alpha (Copy)");
    fireEvent.click(screen.getByTestId("button-archive-workspace"));
    expect(screen.getByText("Workspace reopened.")).toBeInTheDocument();
  });

  it("creates and persists a real editable workspace for a fresh browser", async () => {
    const { unmount } = render(<GraphWorkspace />);
    fireEvent.click(screen.getByTestId("button-add-node"));
    expect(screen.getByLabelText("Label for node-1")).toBeInTheDocument();

    await waitFor(() => {
      const collection = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      expect(collection?.workspaces.find((workspace) => workspace.id === collection.activeId)?.nodes).toHaveLength(1);
    });

    unmount();
    render(<GraphWorkspace />);
    expect(screen.getByLabelText("Label for node-1")).toBeInTheDocument();
  });

  it("round-trips large and incomplete editable graphs after refresh", async () => {
    const { unmount } = render(<GraphWorkspace />);
    for (let index = 0; index < 13; index += 1) {
      fireEvent.click(screen.getByTestId("button-add-node"));
    }
    fireEvent.click(screen.getByTestId("button-add-edge"));
    fireEvent.change(screen.getByLabelText("Source for edge-1"), { target: { value: "" } });

    await waitFor(() => {
      const collection = parseStoredWorkspaceCollection(window.localStorage.getItem(COLLECTION_KEY));
      const active = collection?.workspaces.find((workspace) => workspace.id === collection.activeId);
      expect(active?.nodes).toHaveLength(13);
      expect(active?.edges[0].source).toBe("");
    });

    unmount();
    render(<GraphWorkspace />);
    expect(screen.getByTestId("node-row-node-13")).toBeInTheDocument();
    expect(screen.getByLabelText("Source for edge-1")).toHaveValue("");
  });

  it("clears connection mode when switching workspaces", () => {
    render(<GraphWorkspace />);
    fireEvent.click(screen.getByTestId("button-add-node"));
    fireEvent.click(screen.getByTestId("button-add-node"));
    const originalId = screen.getByTestId("select-workspace").getAttribute("value");
    fireEvent.click(screen.getByTestId("button-connect-nodes"));
    fireEvent.click(screen.getByTestId("graph-node-node-1"));
    fireEvent.click(screen.getByTestId("button-duplicate-workspace"));

    fireEvent.change(screen.getByTestId("select-workspace"), { target: { value: originalId } });
    fireEvent.click(screen.getByTestId("graph-node-node-2"));
    expect(screen.queryByTestId("edge-row-edge-1")).not.toBeInTheDocument();
  });
});