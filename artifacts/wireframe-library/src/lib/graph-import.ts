import type { LibraryComponent } from "@/lib/library";
import {
  blankGraphDocument, DEFAULT_AXES, EditableGraphDocumentSchema, GRAPH_CANVAS,
  validateGraphDocument, type EditableGraphDocument,
} from "@/lib/graph-document";

export type ImportTable = { columns: string[]; rows: { number: number; values: Record<string, unknown> }[] };
export type ImportMapping = { id: string; label: string; type: string; source: string; target: string; properties: string[] };
export type ImportIssue = { table: "nodes" | "relationships" | "document"; row?: number; message: string };
export const EMPTY_IMPORT_TABLE: ImportTable = { columns: [], rows: [] };
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function tableFromJson(value: unknown): ImportTable {
  if (!Array.isArray(value)) throw new Error("Expected an array of row objects.");
  if (value.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows per table.`);
  const columns = new Set<string>();
  const rows = value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Row ${index + 1} must be an object.`);
    Object.keys(row).forEach((key) => columns.add(key));
    return { number: index + 1, values: row as Record<string, unknown> };
  });
  return { columns: [...columns], rows };
}

/** Strict CSV: quoted commas, escaped quotes, CRLF, and multiline cells are supported. */
export function parseCsvTable(text: string): ImportTable {
  const input = text.replace(/^\uFEFF/, "");
  const records: { number: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false;
  let line = 1, startLine = 1;
  const finishCell = () => { cells.push(cell); cell = ""; closed = false; };
  const finishRow = () => {
    finishCell();
    if (cells.length > 1 || cells.some((value) => value.trim())) records.push({ number: startLine, cells });
    cells = [];
    if (records.length > MAX_IMPORT_ROWS + 1) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows per table.`);
  };
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i += 1; }
        else { quoted = false; closed = true; }
      } else { cell += ch; if (ch === "\n") line += 1; }
    } else if (ch === ",") finishCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      finishRow(); line += 1; startLine = line;
    } else if (ch === '"') {
      if (cell || closed) throw new Error(`CSV row ${line}: unexpected quote.`);
      quoted = true;
    } else {
      if (closed) throw new Error(`CSV row ${line}: unexpected text after a closing quote.`);
      cell += ch;
    }
  }
  if (quoted) throw new Error(`CSV row ${startLine}: unclosed quoted field.`);
  finishRow();
  if (!records.length) return EMPTY_IMPORT_TABLE;
  const columns = records[0].cells.map((value) => value.trim());
  if (columns.some((column) => !column) || new Set(columns).size !== columns.length) {
    throw new Error("CSV headers must be non-empty and unique.");
  }
  const rows = records.slice(1).map(({ number, cells: values }) => {
    if (values.length !== columns.length) throw new Error(`CSV row ${number}: expected ${columns.length} fields, received ${values.length}.`);
    return { number, values: Object.fromEntries(columns.map((column, index) => [column, values[index]])) };
  });
  return { columns, rows };
}

/** A separate table accepts CSV or a JSON row array. */
export function parseImportTable(text: string, format: "csv" | "json"): ImportTable {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("Each input must be 2 MB or smaller.");
  if (!text.trim()) return EMPTY_IMPORT_TABLE;
  return format === "csv" ? parseCsvTable(text) : tableFromJson(JSON.parse(text.replace(/^\uFEFF/, "")));
}

/** Combined JSON accepts {nodes: [...], relationships: [...]} (or edges). */
export function parseGraphJson(text: string): { nodes: ImportTable; relationships: ImportTable } {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("Each input must be 2 MB or smaller.");
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error('Expected an object with "nodes" and optional "relationships" arrays.');
  const graph = value as Record<string, unknown>;
  if (!Object.hasOwn(graph, "nodes")) throw new Error('JSON must contain a "nodes" array.');
  if (Object.hasOwn(graph, "edges") && Object.hasOwn(graph, "relationships")) throw new Error('Use either "edges" or "relationships", not both.');
  return {
    nodes: tableFromJson(graph.nodes),
    relationships: tableFromJson(Object.hasOwn(graph, "relationships") ? graph.relationships : Object.hasOwn(graph, "edges") ? graph.edges : []),
  };
}

export function suggestImportMapping(table: ImportTable): ImportMapping {
  const find = (...names: string[]) => names.map((name) => table.columns.find((column) => column.toLowerCase() === name)).find(Boolean) ?? "";
  return {
    id: find("id"), label: find("label", "name"), type: find("type", "typetag"),
    source: find("source", "from"), target: find("target", "to"),
    properties: table.columns.filter((column) => column.toLowerCase() === "properties"),
  };
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return String(value).trim();
  throw new Error("ID, label, type, source and target fields must contain text or scalar values.");
}

function propertiesFor(values: Record<string, unknown>, columns: string[]): string[] {
  return columns.flatMap((column) => {
    const value = values[column];
    if (value === undefined || value === null || value === "") return [];
    // Preserve the editor's existing list-of-strings representation losslessly.
    if (column.toLowerCase() === "properties" && Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
    return [`${column}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`];
  });
}

export function buildGraphImport(
  nodesTable: ImportTable,
  relationshipsTable: ImportTable,
  nodeMapping: ImportMapping,
  relationshipMapping: ImportMapping,
  family: EditableGraphDocument["family"],
  components: LibraryComponent[],
): { document: EditableGraphDocument | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const document = blankGraphDocument(family);
  document.title = "Imported graph";
  const component = (edge: boolean) => {
    const preferred = edge
      ? family === "workflow" ? ["wf.flow-edge", "prim.edge.plain"] : ["kg.relation-edge", "prim.edge.plain"]
      : family === "workflow" ? ["wf.task", "prim.node.generic"] : ["kg.entity", "prim.node.generic"];
    const found = preferred.map((id) => components.find((item) => item.id === id)).find(Boolean);
    return { componentId: found?.id ?? (edge ? "prim.edge.plain" : "prim.node.generic"), axes: found?.axes ?? DEFAULT_AXES };
  };
  const checkMapping = (table: ImportTable, mapping: ImportMapping, name: ImportIssue["table"], required: (keyof ImportMapping)[]) => {
    if (!table.rows.length) return;
    for (const field of required) if (!mapping[field]) issues.push({ table: name, message: `Choose a field for ${field}.` });
    for (const field of [mapping.id, mapping.label, mapping.type, mapping.source, mapping.target, ...mapping.properties]) {
      if (field && !table.columns.includes(field)) issues.push({ table: name, message: `Field "${field}" is unavailable.` });
    }
  };
  if (!nodesTable.rows.length) issues.push({ table: "nodes", message: "Import at least one node." });
  checkMapping(nodesTable, nodeMapping, "nodes", ["id"]);
  checkMapping(relationshipsTable, relationshipMapping, "relationships", ["source", "target"]);
  if (issues.length) return { document: null, issues };
  const allIds = new Set<string>();
  const nodeIds = new Set<string>();
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodesTable.rows.length)));
  const rows = Math.ceil(nodesTable.rows.length / columns);
  nodesTable.rows.forEach((row, index) => {
    try {
      const id = scalar(row.values[nodeMapping.id]);
      const label = nodeMapping.label ? scalar(row.values[nodeMapping.label]) : id;
      if (!id) throw new Error("Node ID is required.");
      if (allIds.has(id)) throw new Error(`Duplicate ID "${id}".`);
      if (!label) throw new Error("Node label is required.");
      allIds.add(id); nodeIds.add(id);
      document.nodes.push({
        id, label, typeTag: nodeMapping.type ? scalar(row.values[nodeMapping.type]) : "",
        properties: propertiesFor(row.values, nodeMapping.properties), ...component(false),
        position: {
          x: columns === 1 ? GRAPH_CANVAS.width / 2 : 90 + (index % columns) * (GRAPH_CANVAS.width - 180) / (columns - 1),
          y: rows === 1 ? GRAPH_CANVAS.height / 2 : 80 + Math.floor(index / columns) * (GRAPH_CANVAS.height - 160) / (rows - 1),
        },
      });
    } catch (error) { issues.push({ table: "nodes", row: row.number, message: (error as Error).message }); }
  });
  // Reserve mapped IDs before generating IDs, so generated IDs never hide collisions.
  const reservedIds = new Set([...nodeIds, ...relationshipsTable.rows.flatMap((row) => {
    try { return relationshipMapping.id ? [scalar(row.values[relationshipMapping.id])] : []; } catch { return []; }
  })]);
  relationshipsTable.rows.forEach((row, index) => {
    try {
      let id = relationshipMapping.id ? scalar(row.values[relationshipMapping.id]) : `relationship-${index + 1}`;
      if (!relationshipMapping.id) {
        while (reservedIds.has(id) || allIds.has(id)) id = `${id}-edge`;
      }
      const source = scalar(row.values[relationshipMapping.source]);
      const target = scalar(row.values[relationshipMapping.target]);
      if (!id) throw new Error("Relationship ID is required.");
      if (allIds.has(id)) throw new Error(`Duplicate ID "${id}". IDs must be unique across nodes and relationships.`);
      if (!source || !nodeIds.has(source)) throw new Error(`Source node "${source}" does not exist.`);
      if (!target || !nodeIds.has(target)) throw new Error(`Target node "${target}" does not exist.`);
      if (source === target) throw new Error("A connection must join two different nodes.");
      allIds.add(id);
      document.edges.push({
        id, source, target, label: relationshipMapping.label ? scalar(row.values[relationshipMapping.label]) : "",
        typeTag: relationshipMapping.type ? scalar(row.values[relationshipMapping.type]) : "",
        properties: propertiesFor(row.values, relationshipMapping.properties), ...component(true),
      });
    } catch (error) { issues.push({ table: "relationships", row: row.number, message: (error as Error).message }); }
  });
  const parsed = EditableGraphDocumentSchema.safeParse(document);
  if (!parsed.success) issues.push({ table: "document", message: "Imported data does not match the editable document format." });
  const report = validateGraphDocument(document, components);
  report.issues.filter((issue) => issue.severity === "error").forEach((issue) => issues.push({ table: "document", message: issue.message }));
  return { document: issues.length || !parsed.success ? null : parsed.data, issues };
}
