import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  EMPTY_IMPORT_TABLE, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, buildGraphImport, parseGraphJson, parseImportTable, suggestImportMapping,
  type ImportMapping, type ImportTable,
} from "@/lib/graph-import";
import type { EditableGraphDocument } from "@/lib/graph-document";
import type { LibraryComponent } from "@/lib/library";
import { AlertCircle, CheckCircle2, FileUp, Info, Loader2, RotateCcw, Upload } from "lucide-react";

type Format = "csv" | "json";
type Slot = "nodes" | "relationships" | "combined";
type Source = { text: string; fileName: string | null };
type ParseResult = { table: ImportTable; error: string | null };

const PREVIEW_ROWS = 8;
const PREVIEW_COLUMNS = 8;
const MAX_LISTED_ISSUES = 50;
const EMPTY_SOURCE: Source = { text: "", fileName: null };
const EMPTY_MAPPING: ImportMapping = { id: "", label: "", type: "", source: "", target: "", properties: [] };

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function cellText(value: unknown) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function safeParseTable(text: string, format: Format): ParseResult {
  try { return { table: parseImportTable(text, format), error: null }; }
  catch (error) { return { table: EMPTY_IMPORT_TABLE, error: (error as Error).message || "Could not parse input." }; }
}

function sameColumns(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Keeps the mapping in sync with the table's columns; re-suggests only when columns change. */
function useMapping(table: ImportTable) {
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING);
  const columnsRef = useRef<string[]>([]);
  useEffect(() => {
    if (sameColumns(columnsRef.current, table.columns)) return;
    columnsRef.current = table.columns;
    setMapping(suggestImportMapping(table));
  }, [table]);
  return [mapping, setMapping] as const;
}

function SourceInput({
  slot, label, hint, text, fileName, format, onFormat, pending, error, onText, onFile, placeholder,
}: {
  slot: Slot; label: string; hint: string; text: string; fileName: string | null; format?: Format;
  onFormat?: (format: Format) => void; pending: boolean; error: string | null;
  onText: (text: string) => void; onFile: (file: File) => void; placeholder: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = `import-${slot}-text`;
  const errorId = `import-${slot}-error`;
  return (
    <section className="rounded-lg border border-border bg-muted/20 p-3" aria-labelledby={`${inputId}-label`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <label id={`${inputId}-label`} htmlFor={inputId} className="text-sm font-semibold">{label}</label>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {format && onFormat && (
            <div role="radiogroup" aria-label={`${label} format`} className="flex rounded-md border border-input bg-background p-0.5">
              {(["csv", "json"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={format === value}
                  onClick={() => onFormat(value)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase ${format === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  data-testid={`toggle-${slot}-format-${value}`}
                >{value}</button>
              ))}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept={format === "csv" ? ".csv,text/csv,text/plain" : ".json,application/json,text/plain"}
            aria-label={`Choose ${label} file`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onFile(file);
            }}
            data-testid={`input-${slot}-file`}
          />
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => fileRef.current?.click()} disabled={pending} data-testid={`button-${slot}-file`}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}
            {pending ? "Reading…" : "Choose file"}
          </Button>
        </div>
      </div>
      <textarea
        id={inputId}
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        rows={5}
        disabled={pending}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="w-full resize-y rounded border border-input bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
        data-testid={`input-${slot}-text`}
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span data-testid={`text-${slot}-source`}>{fileName ? `Loaded from ${fileName}` : "Paste data or choose a file"}</span>
        <span>Up to {formatBytes(MAX_IMPORT_BYTES)} and {MAX_IMPORT_ROWS.toLocaleString()} rows</span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive" data-testid={`error-${slot}`}>
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}
        </p>
      )}
    </section>
  );
}

function FieldSelect({ id, label, value, columns, onChange, required }: {
  id: string; label: string; value: string; columns: string[]; onChange: (value: string) => void; required?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[11px] font-medium">
      <span>{label}{required && <span className="text-destructive" aria-hidden> *</span>}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-required={required}
        className="rounded border border-input bg-background px-2 py-1.5 text-xs font-normal"
        data-testid={`select-${id}`}
      >
        <option value="">{required ? "Choose a field" : "None"}</option>
        {columns.map((column) => <option key={column} value={column}>{column}</option>)}
      </select>
    </label>
  );
}

function MappingEditor({ name, table, mapping, onChange, relationships }: {
  name: "nodes" | "relationships"; table: ImportTable; mapping: ImportMapping; onChange: (mapping: ImportMapping) => void; relationships?: boolean;
}) {
  const title = relationships ? "Relationship fields" : "Node fields";
  if (!table.columns.length) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground" data-testid={`empty-mapping-${name}`}>
        {relationships ? "No relationship data yet. Relationships are optional." : "Add node data to choose fields."}
      </div>
    );
  }
  const set = (key: keyof ImportMapping) => (value: string) => onChange({ ...mapping, [key]: value });
  return (
    <fieldset className="rounded-lg border border-border p-3" data-testid={`mapping-${name}`}>
      <legend className="px-1 text-xs font-semibold">{title}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <FieldSelect id={`${name}-id`} label="ID" value={mapping.id} columns={table.columns} onChange={set("id")} required={!relationships} />
        <FieldSelect id={`${name}-label`} label="Label" value={mapping.label} columns={table.columns} onChange={set("label")} />
        <FieldSelect id={`${name}-type`} label="Type" value={mapping.type} columns={table.columns} onChange={set("type")} />
        {relationships && (
          <>
            <FieldSelect id={`${name}-source`} label="Source node" value={mapping.source} columns={table.columns} onChange={set("source")} required />
            <FieldSelect id={`${name}-target`} label="Target node" value={mapping.target} columns={table.columns} onChange={set("target")} required />
          </>
        )}
      </div>
      <div className="mt-3">
        <p id={`${name}-properties-label`} className="text-[11px] font-medium">Property columns</p>
        <div role="group" aria-labelledby={`${name}-properties-label`} className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {table.columns.map((column) => {
            const checked = mapping.properties.includes(column);
            return (
              <label key={column} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${checked ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-current"
                  checked={checked}
                  onChange={() => onChange({ ...mapping, properties: checked ? mapping.properties.filter((item) => item !== column) : [...mapping.properties, column] })}
                  data-testid={`checkbox-${name}-property-${column}`}
                />
                {column}
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

function PreviewTable({ caption, columns, rows, total, testId }: {
  caption: string; columns: string[]; rows: { key: string; cells: string[] }[]; total: number; testId: string;
}) {
  if (!total) return <p className="rounded border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground" data-testid={`${testId}-empty`}>{caption}: nothing to show.</p>;
  const shownCols = columns.slice(0, PREVIEW_COLUMNS);
  return (
    <div className="overflow-hidden rounded border border-border" data-testid={testId}>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-left text-[11px]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>{shownCols.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-2 py-1.5">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                {row.cells.slice(0, PREVIEW_COLUMNS).map((cell, index) => <td key={index} className="max-w-[180px] truncate px-2 py-1 font-mono" title={cell}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
        {caption}: showing {rows.length} of {total.toLocaleString()} rows{columns.length > PREVIEW_COLUMNS ? `, ${PREVIEW_COLUMNS} of ${columns.length} columns` : ""}.
      </p>
    </div>
  );
}

function sourcePreviewRows(table: ImportTable) {
  return table.rows.slice(0, PREVIEW_ROWS).map((row) => ({
    key: String(row.number), cells: [String(row.number), ...table.columns.map((column) => cellText(row.values[column]))],
  }));
}

export function GraphImportPanel({
  family, components, onImport,
}: {
  family: EditableGraphDocument["family"];
  components: LibraryComponent[];
  onImport: (document: EditableGraphDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"separate" | "combined">("separate");
  const [formats, setFormats] = useState<{ nodes: Format; relationships: Format }>({ nodes: "csv", relationships: "csv" });
  const [sources, setSources] = useState<Record<Slot, Source>>({ nodes: EMPTY_SOURCE, relationships: EMPTY_SOURCE, combined: EMPTY_SOURCE });
  const [pending, setPending] = useState<Record<Slot, boolean>>({ nodes: false, relationships: false, combined: false });
  const [fileErrors, setFileErrors] = useState<Record<Slot, string | null>>({ nodes: null, relationships: null, combined: null });
  const [importError, setImportError] = useState<string | null>(null);
  const readTokens = useRef<Record<Slot, number>>({ nodes: 0, relationships: 0, combined: 0 });

  const reset = () => {
    // Invalidate any in-flight reads so late results are discarded.
    (Object.keys(readTokens.current) as Slot[]).forEach((slot) => { readTokens.current[slot] += 1; });
    setMode("separate");
    setFormats({ nodes: "csv", relationships: "csv" });
    setSources({ nodes: EMPTY_SOURCE, relationships: EMPTY_SOURCE, combined: EMPTY_SOURCE });
    setPending({ nodes: false, relationships: false, combined: false });
    setFileErrors({ nodes: null, relationships: null, combined: null });
    setImportError(null);
  };

  const setText = (slot: Slot, text: string) => {
    readTokens.current[slot] += 1;
    setPending((current) => ({ ...current, [slot]: false }));
    setFileErrors((current) => ({ ...current, [slot]: null }));
    setSources((current) => ({ ...current, [slot]: { text, fileName: null } }));
    setImportError(null);
  };

  const readFile = (slot: Slot, file: File) => {
    const token = ++readTokens.current[slot];
    setImportError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setFileErrors((current) => ({ ...current, [slot]: `${file.name} is ${formatBytes(file.size)}. Files must be ${formatBytes(MAX_IMPORT_BYTES)} or smaller.` }));
      setPending((current) => ({ ...current, [slot]: false }));
      return;
    }
    if (slot !== "combined") {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".json")) setFormats((current) => ({ ...current, [slot]: "json" }));
      else if (lower.endsWith(".csv")) setFormats((current) => ({ ...current, [slot]: "csv" }));
    }
    setPending((current) => ({ ...current, [slot]: true }));
    setFileErrors((current) => ({ ...current, [slot]: null }));
    file.text().then(
      (text) => {
        if (readTokens.current[slot] !== token) return;
        setSources((current) => ({ ...current, [slot]: { text, fileName: file.name } }));
        setPending((current) => ({ ...current, [slot]: false }));
      },
      () => {
        if (readTokens.current[slot] !== token) return;
        setFileErrors((current) => ({ ...current, [slot]: `Could not read ${file.name}. Check the file and try again.` }));
        setPending((current) => ({ ...current, [slot]: false }));
      },
    );
  };

  const parsed = useMemo((): { nodes: ParseResult; relationships: ParseResult; combinedError: string | null } => {
    if (mode === "combined") {
      const text = sources.combined.text;
      if (!text.trim()) return { nodes: { table: EMPTY_IMPORT_TABLE, error: null }, relationships: { table: EMPTY_IMPORT_TABLE, error: null }, combinedError: null };
      try {
        const graph = parseGraphJson(text);
        return { nodes: { table: graph.nodes, error: null }, relationships: { table: graph.relationships, error: null }, combinedError: null };
      } catch (error) {
        return { nodes: { table: EMPTY_IMPORT_TABLE, error: null }, relationships: { table: EMPTY_IMPORT_TABLE, error: null }, combinedError: (error as Error).message || "Could not parse JSON." };
      }
    }
    return {
      nodes: safeParseTable(sources.nodes.text, formats.nodes),
      relationships: safeParseTable(sources.relationships.text, formats.relationships),
      combinedError: null,
    };
  }, [mode, sources, formats]);

  const [nodeMapping, setNodeMapping] = useMapping(parsed.nodes.table);
  const [relationshipMapping, setRelationshipMapping] = useMapping(parsed.relationships.table);

  // Mapping state updates one render after columns change; detect and treat that frame as stale.
  const mappingStale =
    [nodeMapping.id, nodeMapping.label, nodeMapping.type, ...nodeMapping.properties].some((field) => field && !parsed.nodes.table.columns.includes(field)) ||
    [relationshipMapping.id, relationshipMapping.label, relationshipMapping.type, relationshipMapping.source, relationshipMapping.target, ...relationshipMapping.properties]
      .some((field) => field && !parsed.relationships.table.columns.includes(field));

  const anyPending = pending.nodes || pending.relationships || pending.combined;
  const visibleSlots: Slot[] = mode === "combined" ? ["combined"] : ["nodes", "relationships"];
  const inputErrors = [
    ...visibleSlots.map((slot) => fileErrors[slot]).filter(Boolean),
    ...(mode === "combined" ? [parsed.combinedError] : [parsed.nodes.error, parsed.relationships.error]).filter(Boolean),
  ] as string[];
  const hasData = parsed.nodes.table.rows.length > 0 || parsed.relationships.table.rows.length > 0;

  const result = useMemo(() => {
    if (!hasData || inputErrors.length || mappingStale) return null;
    return buildGraphImport(parsed.nodes.table, parsed.relationships.table, nodeMapping, relationshipMapping, family, components);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, nodeMapping, relationshipMapping, family, components, hasData, inputErrors.length, mappingStale]);

  const canImport = !!result?.document && !anyPending && !mappingStale && !inputErrors.length;

  const doImport = () => {
    if (!canImport) return;
    // Rebuild from the exact current inputs so the imported document can never come from a stale preview.
    const fresh = buildGraphImport(parsed.nodes.table, parsed.relationships.table, nodeMapping, relationshipMapping, family, components);
    if (!fresh.document) { setImportError("The data changed and no longer validates. Review the issues and try again."); return; }
    try {
      onImport(fresh.document);
    } catch (error) {
      setImportError((error as Error).message || "Import failed. Your current graph was not changed.");
      return;
    }
    reset();
    setOpen(false);
  };

  const nodeSourceCols = ["Row", ...parsed.nodes.table.columns];
  const relSourceCols = ["Row", ...parsed.relationships.table.columns];
  const doc = result?.document;
  const issues = result?.issues ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid="button-open-import"><Upload className="mr-1.5 h-3.5 w-3.5" />Import data</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto" data-testid="dialog-graph-import">
        <DialogHeader>
          <DialogTitle>Import graph from CSV or JSON</DialogTitle>
          <DialogDescription>
            Files are read in this browser and never uploaded. Importing creates a <strong>new workspace</strong>; your current graph stays unchanged.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-5">
          <li>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Provide data</h3>
            <div role="radiogroup" aria-label="Input layout" className="mb-3 inline-flex rounded-md border border-input p-0.5">
              {([["separate", "Separate tables"], ["combined", "Combined graph JSON"]] as const).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => { setMode(value); setImportError(null); }}
                  className={`rounded px-3 py-1 text-xs font-medium ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  data-testid={`toggle-mode-${value}`}
                >{text}</button>
              ))}
            </div>
            {mode === "separate" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <SourceInput
                  slot="nodes" label="Nodes" hint="One row per node. Required." text={sources.nodes.text} fileName={sources.nodes.fileName}
                  format={formats.nodes} onFormat={(format) => { setFormats((current) => ({ ...current, nodes: format })); setImportError(null); }}
                  pending={pending.nodes} error={fileErrors.nodes ?? parsed.nodes.error}
                  onText={(text) => setText("nodes", text)} onFile={(file) => readFile("nodes", file)}
                  placeholder={formats.nodes === "csv" ? "id,label,type\nn1,Ada,Person\nn2,Analytical Engine,Machine" : '[{"id":"n1","label":"Ada"}]'}
                />
                <SourceInput
                  slot="relationships" label="Relationships" hint="One row per connection. Optional." text={sources.relationships.text} fileName={sources.relationships.fileName}
                  format={formats.relationships} onFormat={(format) => { setFormats((current) => ({ ...current, relationships: format })); setImportError(null); }}
                  pending={pending.relationships} error={fileErrors.relationships ?? parsed.relationships.error}
                  onText={(text) => setText("relationships", text)} onFile={(file) => readFile("relationships", file)}
                  placeholder={formats.relationships === "csv" ? "source,target,label\nn1,n2,designed" : '[{"source":"n1","target":"n2"}]'}
                />
              </div>
            ) : (
              <SourceInput
                slot="combined" label="Graph JSON" hint='An object with "nodes" and optional "relationships" (or "edges") arrays.'
                text={sources.combined.text} fileName={sources.combined.fileName} format="json"
                pending={pending.combined} error={fileErrors.combined ?? parsed.combinedError}
                onText={(text) => setText("combined", text)} onFile={(file) => readFile("combined", file)}
                placeholder={'{\n  "nodes": [{"id":"n1","label":"Ada"},{"id":"n2","label":"Engine"}],\n  "relationships": [{"source":"n1","target":"n2","label":"designed"}]\n}'}
              />
            )}
          </li>

          <li>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Choose fields</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <MappingEditor name="nodes" table={parsed.nodes.table} mapping={nodeMapping} onChange={(next) => { setNodeMapping(next); setImportError(null); }} />
              <MappingEditor name="relationships" table={parsed.relationships.table} mapping={relationshipMapping} onChange={(next) => { setRelationshipMapping(next); setImportError(null); }} relationships />
            </div>
          </li>

          <li>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Review</h3>
            {!hasData && !inputErrors.length ? (
              <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-8 text-center" data-testid="empty-import-preview">
                <Info className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">Nothing to preview yet</p>
                <p className="text-[11px] text-muted-foreground">Paste rows or choose a file above. The preview updates as you map fields.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold">Source rows</p>
                    <PreviewTable caption="Node source rows" columns={nodeSourceCols} rows={sourcePreviewRows(parsed.nodes.table)} total={parsed.nodes.table.rows.length} testId="preview-source-nodes" />
                    <PreviewTable caption="Relationship source rows" columns={relSourceCols} rows={sourcePreviewRows(parsed.relationships.table)} total={parsed.relationships.table.rows.length} testId="preview-source-relationships" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold">Mapped graph</p>
                    {doc ? (
                      <>
                        <PreviewTable
                          caption="Mapped nodes" columns={["ID", "Label", "Type", "Properties"]} total={doc.nodes.length}
                          rows={doc.nodes.slice(0, PREVIEW_ROWS).map((node) => ({ key: node.id, cells: [node.id, node.label, node.typeTag, cellText(node.properties.join("; "))] }))}
                          testId="preview-mapped-nodes"
                        />
                        <PreviewTable
                          caption="Mapped relationships" columns={["ID", "Source", "Target", "Label", "Type", "Properties"]} total={doc.edges.length}
                          rows={doc.edges.slice(0, PREVIEW_ROWS).map((edge) => ({ key: edge.id, cells: [edge.id, edge.source, edge.target, edge.label, edge.typeTag ?? "", cellText((edge.properties ?? []).join("; "))] }))}
                          testId="preview-mapped-relationships"
                        />
                      </>
                    ) : (
                      <p className="rounded border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground" data-testid="preview-mapped-unavailable">
                        {anyPending ? "Waiting for file to finish reading." : "Mapped graph appears once every issue is resolved. Nothing is imported partially."}
                      </p>
                    )}
                  </div>
                </div>

                {(inputErrors.length > 0 || issues.length > 0) && (
                  <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3" data-testid="list-import-issues">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />{inputErrors.length + issues.length} issue{inputErrors.length + issues.length === 1 ? "" : "s"} must be fixed before import
                    </p>
                    <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px]">
                      {inputErrors.map((message, index) => <li key={`input-${index}`}>Input: {message}</li>)}
                      {issues.slice(0, MAX_LISTED_ISSUES).map((issue, index) => (
                        <li key={index} data-testid={`text-issue-${index}`}>
                          <span className="font-medium capitalize">{issue.table}</span>{issue.row !== undefined && <> row {issue.row}</>}: {issue.message}
                        </li>
                      ))}
                      {issues.length > MAX_LISTED_ISSUES && <li className="text-muted-foreground">and {issues.length - MAX_LISTED_ISSUES} more.</li>}
                    </ul>
                  </div>
                )}
                {doc && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-700" role="status" data-testid="status-import-ready">
                    <CheckCircle2 className="h-3.5 w-3.5" />Ready: <Badge variant="secondary">{doc.nodes.length} nodes</Badge><Badge variant="secondary">{doc.edges.length} relationships</Badge>
                  </p>
                )}
              </div>
            )}
          </li>
        </ol>

        {importError && <p role="alert" className="text-xs text-destructive" data-testid="error-import">{importError}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={reset} data-testid="button-reset-import"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Clear</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); reset(); }} data-testid="button-cancel-import">Cancel</Button>
            <Button type="button" size="sm" onClick={doImport} disabled={!canImport} data-testid="button-confirm-import">
              Create new workspace{doc ? ` (${doc.nodes.length} nodes)` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
