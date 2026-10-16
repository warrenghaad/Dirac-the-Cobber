import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/lib/library";
import { EditableGraphDocumentSchema, GRAPH_CANVAS, parseStoredGraphDocument, validateGraphDocument } from "@/lib/graph-document";
import { buildGraphImport, EMPTY_IMPORT_TABLE, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsvTable, parseGraphJson, parseImportTable, suggestImportMapping } from "@/lib/graph-import";

const components = MANIFEST.components;
const nodes = parseCsvTable("id,name,kind,city\na,Alice,person,Paris\nb,Team,group,London");
const edges = parseCsvTable("id,from,to,name,kind,weight\nr,a,b,member of,membership,2");
const nodeMapping = { ...suggestImportMapping(nodes), type: "kind", properties: ["city"] };
const edgeMapping = { ...suggestImportMapping(edges), type: "kind", properties: ["weight"] };
const build = (n = nodes, e = edges, nm = nodeMapping, em = edgeMapping) =>
  buildGraphImport(n, e, nm, em, "knowledge-graph", components);

describe("CSV and JSON graph import", () => {
  it("parses quoted CSV, escaped quotes, BOM, CRLF and multiline fields with physical row numbers", () => {
    const table = parseCsvTable('\uFEFFid,label,note\r\n\r\na,"Alice, A.","said ""hi""\nnext line"\r\nb,Bob,plain\r\n');
    expect(table.columns).toEqual(["id", "label", "note"]);
    expect(table.rows).toEqual([
      { number: 3, values: { id: "a", label: "Alice, A.", note: 'said "hi"\nnext line' } },
      { number: 5, values: { id: "b", label: "Bob", note: "plain" } },
    ]);
  });

  it.each([
    ['id,id\na,b', "headers"], ['id,\na,b', "headers"], ['id,label\na', "row 2"],
    ['id,label\na,"bad', "unclosed"], ['id,label\na,ab"cd', "unexpected quote"],
    ['id,label\na,"ok"bad', "closing quote"],
  ])("rejects malformed CSV %s", (text, message) => {
    expect(() => parseCsvTable(text)).toThrow(message);
  });

  it("accepts JSON arrays and combined JSON, including edges alias and arbitrary union columns", () => {
    expect(parseImportTable('[{"id":"a"},{"id":"b","other":0}]', "json").columns).toEqual(["id", "other"]);
    const parsed = parseGraphJson('{"nodes":[{"id":1,"label":"One"}],"edges":[]}');
    expect(parsed.nodes.rows[0].number).toBe(1);
    expect(parsed.relationships.rows).toEqual([]);
    expect(parseImportTable("", "csv")).toEqual(EMPTY_IMPORT_TABLE);
  });

  it.each([
    "{}", "null", "[]", '{"nodes":{}}', '{"nodes":[null]}',
    '{"nodes":[],"edges":[],"relationships":[]}', '{"nodes":[],"relationships":"bad"}', '{"nodes":[],"relationships":null}',
  ])("rejects invalid combined JSON: %s", (text) => {
    expect(() => parseGraphJson(text)).toThrow();
  });

  it("rejects oversized input and too many rows", () => {
    expect(() => parseImportTable("x".repeat(MAX_IMPORT_BYTES + 1), "csv")).toThrow("2 MB");
    expect(() => parseCsvTable("id\n" + "a\n".repeat(MAX_IMPORT_ROWS + 1))).toThrow("rows");
    expect(() => parseImportTable(JSON.stringify(Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ id: "a" }))), "json")).toThrow("rows");
  });

  it("maps all fields into validated editable documents and round-trips relationship metadata", () => {
    const result = build();
    expect(result.issues).toEqual([]);
    expect(result.document?.nodes[0]).toMatchObject({ id: "a", label: "Alice", typeTag: "person", properties: ["city: Paris"] });
    expect(result.document?.edges[0]).toMatchObject({ id: "r", source: "a", target: "b", label: "member of", typeTag: "membership", properties: ["weight: 2"] });
    expect(EditableGraphDocumentSchema.safeParse(result.document).success).toBe(true);
    expect(validateGraphDocument(result.document!, components).valid).toBe(true);
    expect(parseStoredGraphDocument(JSON.stringify(result.document))?.edges[0].properties).toEqual(["weight: 2"]);
    expect(nodes.rows[0].values.name).toBe("Alice");
  });

  it("preserves JSON property objects, arrays, booleans, zero and existing string lists", () => {
    const table = parseImportTable('[{"id":0,"properties":["a,b","owner"],"nested":{"x":1,"y":2},"enabled":false,"count":0}]', "json");
    const mapping = { ...suggestImportMapping(table), properties: ["properties", "nested", "enabled", "count"] };
    const result = build(table, EMPTY_IMPORT_TABLE, mapping);
    expect(result.document?.nodes[0]).toMatchObject({ id: "0", label: "0", properties: ["a,b", "owner", 'nested: {"x":1,"y":2}', "enabled: false", "count: 0"] });
  });

  it("uses deterministic unique, finite positions within the canvas", () => {
    const table = parseImportTable(JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ id: i }))), "json");
    const mapping = suggestImportMapping(table);
    const first = build(table, EMPTY_IMPORT_TABLE, mapping).document!;
    const second = build(table, EMPTY_IMPORT_TABLE, mapping).document!;
    expect(first.nodes.map((node) => node.position)).toEqual(second.nodes.map((node) => node.position));
    expect(new Set(first.nodes.map((node) => JSON.stringify(node.position))).size).toBe(101);
    first.nodes.forEach(({ position }) => {
      expect(position.x).toBeGreaterThan(0);
      expect(position.x).toBeLessThan(GRAPH_CANVAS.width);
      expect(position.y).toBeGreaterThan(0);
      expect(position.y).toBeLessThan(GRAPH_CANVAS.height);
    });
  });

  it.each([
    ["id,label\na,A\na,B", "id,source,target\nr,a,b", "Duplicate ID"],
    ["id,label\n,A", "", "Node ID is required"],
    ["id,label\na,", "", "label is required"],
    ["id,label\na,A\nb,B", "id,source,target\nr,a,missing", "Target node"],
    ["id,label\na,A\nb,B", "id,source,target\nr,missing,b", "Source node"],
    ["id,label\na,A", "id,source,target\nr,a,a", "two different"],
    ["id,label\na,A\nb,B", "id,source,target\nr,a,b\nr,b,a", "Duplicate ID"],
    ["id,label\na,A\nb,B", "id,source,target\na,a,b", "unique across"],
  ])("reports row-level errors atomically", (n, e, message) => {
    const nt = parseCsvTable(n), et = parseCsvTable(e);
    const result = build(nt, et, suggestImportMapping(nt), suggestImportMapping(et));
    expect(result.document).toBeNull();
    expect(result.issues.some((issue) => issue.row !== undefined && issue.message.includes(message))).toBe(true);
  });

  it("requires mappings, rejects stale columns, and does not accept object IDs", () => {
    expect(build(nodes, edges, { ...nodeMapping, id: "" }).issues[0].message).toContain("Choose");
    expect(build(nodes, edges, { ...nodeMapping, label: "missing" }).issues[0].message).toContain("unavailable");
    const nt = parseImportTable('[{"id":{"bad":1}}]', "json");
    expect(build(nt, EMPTY_IMPORT_TABLE, suggestImportMapping(nt)).issues[0]).toMatchObject({ row: 1, table: "nodes" });
    expect(build(EMPTY_IMPORT_TABLE, EMPTY_IMPORT_TABLE).document).toBeNull();
  });

  it("generates relationship IDs deterministically without colliding with node IDs", () => {
    const nt = parseCsvTable("id\nrelationship-1\nb");
    const et = parseCsvTable("source,target\nrelationship-1,b");
    const result = build(nt, et, suggestImportMapping(nt), suggestImportMapping(et));
    expect(result.document?.edges[0].id).toBe("relationship-1-edge");
  });

  it("chooses workflow visuals when importing into workflow family", () => {
    const result = buildGraphImport(nodes, edges, nodeMapping, edgeMapping, "workflow", components);
    expect(result.document?.family).toBe("workflow");
    expect(result.document?.nodes[0].componentId).toBe("wf.task");
  });
});
