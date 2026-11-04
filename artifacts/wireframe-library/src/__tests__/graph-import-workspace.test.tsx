import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphImportPanel } from "@/components/GraphImportPanel";
import { MANIFEST } from "@/lib/library";
import { blankGraphDocument, parseStoredWorkspaceCollection } from "@/lib/graph-document";
import { MAX_IMPORT_BYTES } from "@/lib/graph-import";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: () => ({ manifest: MANIFEST, isLoading: false, isError: false, refetch: vi.fn() }),
}));
import { GraphWorkspace } from "@/components/GraphWorkspace";

const KEY = "tiered-wireframe-library.workspaces.v1";
const setText = (slot: string, text: string) => fireEvent.change(screen.getByTestId(`input-${slot}-text`), { target: { value: text } });
const choose = (id: string, value: string) => fireEvent.change(screen.getByTestId(`select-${id}`), { target: { value } });
function file(name: string, read: () => Promise<string>, size?: number) {
  const result = new File(["placeholder"], name);
  Object.defineProperty(result, "text", { value: read });
  if (size) Object.defineProperty(result, "size", { value: size });
  return result;
}
function upload(slot: string, value: File) {
  fireEvent.change(screen.getByTestId(`input-${slot}-file`), { target: { files: [value] } });
}
function openPanel() { fireEvent.click(screen.getByTestId("button-open-import")); }

describe("guided graph import", () => {
  beforeEach(() => window.localStorage.clear());

  it("maps CSV fields, previews without mutations, and imports an editable, persistent new workspace", async () => {
    const previous = blankGraphDocument();
    previous.title = "Keep my graph";
    const { unmount } = render(<GraphWorkspace seedDocument={previous} />);
    openPanel();
    const before = window.localStorage.getItem(KEY);
    setText("nodes", 'key,title,kind,note\na,"Alice, A",person,"Paris, France"\nb,Team,group,London');
    setText("relationships", "key,start,end,title,kind,score\nr,a,b,member of,membership,2");
    choose("nodes-id", "key");
    choose("nodes-label", "title");
    choose("nodes-type", "kind");
    choose("relationships-id", "key");
    choose("relationships-label", "title");
    choose("relationships-type", "kind");
    choose("relationships-source", "start");
    choose("relationships-target", "end");
    fireEvent.click(screen.getByTestId("checkbox-nodes-property-note"));
    fireEvent.click(screen.getByTestId("checkbox-relationships-property-score"));
    expect(screen.getByTestId("preview-mapped-nodes")).toHaveTextContent("Alice, A");
    expect(screen.getByTestId("preview-mapped-relationships")).toHaveTextContent("membership");
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(screen.getByTestId("button-confirm-import")).toBeEnabled();
    fireEvent.click(screen.getByTestId("button-confirm-import"));

    expect(screen.queryByTestId("dialog-graph-import")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Label for a")).toHaveValue("Alice, A");
    expect(screen.getByLabelText("Property 1 for a")).toHaveValue("note: Paris, France");
    expect(screen.getByLabelText("Type for r")).toHaveValue("membership");
    fireEvent.change(screen.getByLabelText("Property 1 for a"), { target: { value: "note: Paris, France (updated)" } });
    fireEvent.change(screen.getByLabelText("Type for r"), { target: { value: "employment" } });
    fireEvent.change(screen.getByLabelText("Property 1 for r"), { target: { value: "score: 3" } });
    const collection = parseStoredWorkspaceCollection(window.localStorage.getItem(KEY))!;
    expect(collection.workspaces).toHaveLength(2);
    expect(collection.workspaces.find((doc) => doc.id === previous.id)).toEqual(previous);
    const imported = collection.workspaces.find((doc) => doc.id === collection.activeId)!;
    expect(imported.nodes).toHaveLength(2);
    expect(imported.edges[0]).toMatchObject({ typeTag: "employment", properties: ["score: 3"] });
    expect(imported.nodes[0].properties).toEqual(["note: Paris, France (updated)"]);
    unmount();
    render(<GraphWorkspace />);
    expect(screen.getByLabelText("Label for a")).toHaveValue("Alice, A");
    expect(screen.getByLabelText("Type for r")).toHaveValue("employment");
    expect(screen.getByLabelText("Property 1 for r")).toHaveValue("score: 3");
    expect(screen.getByTestId("graph-edge-r")).toBeInTheDocument();
  });

  it("reports invalid row numbers, blocks partial imports and does not mutate when cancelled", () => {
    render(<GraphWorkspace />);
    openPanel();
    const before = window.localStorage.getItem(KEY);
    setText("nodes", "id,label\na,A\nb,B");
    setText("relationships", "id,source,target\nr,a,missing");
    expect(screen.getByTestId("list-import-issues")).toHaveTextContent('relationships row 2: Target node "missing" does not exist.');
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    expect(window.localStorage.getItem(KEY)).toBe(before);
    setText("relationships", "id,source,target\nr,a,b");
    expect(screen.getByTestId("button-confirm-import")).toBeEnabled();
    setText("nodes", "id,label\na,A\na,Duplicate");
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    expect(screen.getByTestId("list-import-issues")).toHaveTextContent("nodes row 3");
    fireEvent.click(screen.getByTestId("button-cancel-import"));
    expect(window.localStorage.getItem(KEY)).toBe(before);
    openPanel();
    expect(screen.getByTestId("input-nodes-text")).toHaveValue("");
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
  });

  it("imports a combined JSON file with mapped properties only after explicit confirmation", async () => {
    const onImport = vi.fn();
    render(<GraphImportPanel family="knowledge-graph" components={MANIFEST.components} onImport={onImport} />);
    openPanel();
    fireEvent.click(screen.getByTestId("toggle-mode-combined"));
    const data = '{"nodes":[{"id":"a","label":"A","properties":["name, value"]},{"id":"b","label":"B"}],"edges":[{"id":"r","source":"a","target":"b","type":"owns","properties":["weight: 1"]}]}';
    upload("combined", file("graph.json", () => Promise.resolve(data)));
    await waitFor(() => expect(screen.getByTestId("button-confirm-import")).toBeEnabled());
    expect(screen.getByTestId("preview-mapped-relationships")).toHaveTextContent("owns");
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-confirm-import"));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0].edges[0]).toMatchObject({ id: "r", typeTag: "owns", properties: ["weight: 1"] });
    expect(onImport.mock.calls[0][0].nodes[0].properties).toEqual(["name, value"]);
  });

  it("supports separate JSON arrays and reevaluates the preview when mappings change", () => {
    const onImport = vi.fn();
    render(<GraphImportPanel family="workflow" components={MANIFEST.components} onImport={onImport} />);
    openPanel();
    fireEvent.click(screen.getByTestId("toggle-nodes-format-json"));
    fireEvent.click(screen.getByTestId("toggle-relationships-format-json"));
    setText("nodes", '[{"id":"a","name":"Step A","alternate":"Other"},{"id":"b","name":"Step B","alternate":"Other B"}]');
    setText("relationships", '[{"source":"a","target":"b","label":"next"}]');
    choose("nodes-label", "alternate");
    expect(screen.getByTestId("preview-mapped-nodes")).toHaveTextContent("Other B");
    choose("relationships-target", "label");
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    choose("relationships-target", "target");
    fireEvent.click(screen.getByTestId("button-confirm-import"));
    expect(onImport.mock.calls[0][0]).toMatchObject({ family: "workflow", nodes: [expect.objectContaining({ label: "Other" }), expect.objectContaining({ label: "Other B" })] });
  });

  it("handles malformed, oversized and unreadable files without importing previously valid data", async () => {
    const onImport = vi.fn();
    render(<GraphImportPanel family="knowledge-graph" components={MANIFEST.components} onImport={onImport} />);
    openPanel();
    setText("nodes", "id,label\na,A");
    upload("nodes", file("large.csv", vi.fn(), MAX_IMPORT_BYTES + 1));
    expect(screen.getByTestId("error-nodes")).toHaveTextContent("Files must");
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    upload("nodes", file("broken.csv", () => Promise.reject(new Error("Read failed"))));
    await waitFor(() => expect(screen.getByTestId("error-nodes")).toHaveTextContent("Could not read"));
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    upload("nodes", file("bad.csv", () => Promise.resolve('id,label\na,"unclosed')));
    await waitFor(() => expect(screen.getByTestId("error-nodes")).toHaveTextContent("unclosed"));
    expect(onImport).not.toHaveBeenCalled();
  });

  it("discards late file reads after clearing or closing and resets field choices", async () => {
    const onImport = vi.fn();
    render(<GraphImportPanel family="knowledge-graph" components={MANIFEST.components} onImport={onImport} />);
    openPanel();
    let finish!: (text: string) => void;
    upload("nodes", file("slow.csv", () => new Promise((resolve) => { finish = resolve; })));
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    fireEvent.click(screen.getByTestId("button-reset-import"));
    setText("nodes", "id,label\nnew,New");
    await act(async () => finish("id,label\nold,Old"));
    expect(screen.getByTestId("input-nodes-text")).toHaveValue("id,label\nnew,New");
    expect(screen.getByTestId("preview-mapped-nodes")).not.toHaveTextContent("Old");
    fireEvent.click(screen.getByTestId("button-cancel-import"));
    openPanel();
    expect(screen.getByTestId("button-confirm-import")).toBeDisabled();
    expect(within(screen.getByTestId("dialog-graph-import")).getByText("Nothing to preview yet")).toBeInTheDocument();
  });
});
