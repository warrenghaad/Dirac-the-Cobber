#!/usr/bin/env node
/**
 * figma-intake.js — inspect Figma sources and preserve their full catalog
 *
 * Usage:
 *   FIGMA_ACCESS_TOKEN=<pat> node scripts/figma-intake.js
 *
 * What it does:
 *   1. Reads docs/wireframe-library/manifest.json for figmaSources entries
 *   2. Fetches each file's component list from the Figma REST API
 *   3. Retains every discovered page/component/component-set as a sourceCatalog
 *      asset, including unmatched candidates
 *   4. Verifies only pre-approved exact source + node mappings; it never assigns
 *      a renderer role from a name match
 *   5. Updates source coverage and copies the canonical manifest to the artifact
 *   6. Prints coverage, unmatched assets, and access failures for review
 *
 * MATCH_RULES are used solely to verify intentional semantic FigJam references.
 * They are not an import mapper: new candidates stay unmatched until a reviewer
 * records an explicit source + node mapping in the manifest.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "../docs/wireframe-library/manifest.json");
const CATALOG_PATH = resolve(__dirname, "../docs/wireframe-library/source-catalog.json");
const ARTIFACT_COPY = resolve(__dirname, "../artifacts/wireframe-library/src/lib/manifest.json");
const ARTIFACT_CATALOG_COPY = resolve(__dirname, "../artifacts/wireframe-library/src/lib/source-catalog.json");

// ---------------------------------------------------------------------------
// Shape/name heuristics — map manifest id → semantic patterns to look for in
// Figma component names. These rules intentionally do not depend on which
// source a component came from: a useful primitive can come from any library.
//
// Keep exclusions next to broad patterns. A raw substring such as "frame",
// "pool", or "arrow" is not enough to establish diagram semantics in a UI kit.
// ---------------------------------------------------------------------------
const MATCH_RULES = [
  {
    manifestId: "prim.node.generic",
    patterns: [/rounded[-\s]rect(?:angle)?/, /generic node/, /rectangle node/, /_rectangle\b/],
    excluded: [/button/, /card/, /image/, /filter/, /frame/],
  },
  { manifestId: "prim.node.sharp", patterns: [/sharp node/, /square node/] },
  {
    manifestId: "prim.node.round",
    patterns: [/\bellipse\b/, /\bcircle\b/, /round node/, /\boval\b/],
    excluded: [/icon/, /navigation/, /action/, /filled/],
  },
  {
    manifestId: "prim.node.pill",
    patterns: [/\bpill\b/, /\bterminator\b/, /start[-\s]end/],
    excluded: [/button/, /badge/],
  },
  { manifestId: "prim.node.diamond", patterns: [/^diamond$/, /generic diamond/, /diamond node/] },
  { manifestId: "prim.node.hexagon", patterns: [/^hexagon$/, /hexagon node/] },
  { manifestId: "prim.node.parallelogram", patterns: [/\bparallelogram\b/] },
  { manifestId: "prim.node.cylinder", patterns: [/\bcylinder\b/, /\bdatabase shape\b/] },
  {
    manifestId: "prim.edge.plain",
    patterns: [/\bplain edge\b/, /^arrow$/, /curvy arrow/],
    excluded: [/navigation/, /keyboard/, /play arrow/, /icon/, /menu/],
  },
  { manifestId: "prim.edge.undirected", patterns: [/undirected edge/, /connector line/, /plain line/] },
  { manifestId: "prim.edge.bidirectional", patterns: [/bidirectional/, /two[-\s]way/, /double arrow/] },
  {
    manifestId: "prim.container.plain",
    patterns: [/\bplain container\b/, /group container/, /\bcontainer\b/],
    excluded: [/image/, /filter/, /frame/],
  },
  { manifestId: "prim.anchor.point", patterns: [/\banchor\b/, /\bpoint\b/, /\bdot\b/] },

  { manifestId: "kg.entity", patterns: [/\bentity\b/, /node entity/, /resource node/], excluded: [/identity/] },
  { manifestId: "kg.class", patterns: [/\bclass\b/, /type node/] },
  { manifestId: "kg.literal", patterns: [/\bliteral\b/, /value node/] },
  {
    manifestId: "kg.property-edge",
    patterns: [/property edge/, /property arrow/, /labeled arrow/, /labelled arrow/, /connector[-\s]labels?/],
  },
  { manifestId: "kg.relation-edge", patterns: [/relation edge/, /relation arrow/] },
  { manifestId: "kg.subclass-edge", patterns: [/subclass/, /dashed arrow/, /line\s*\/\s*dashed/, /taxonomy/] },
  {
    manifestId: "kg.group",
    patterns: [/diagram group/, /group container/, /\bnamespace\b/, /\bsubgraph\b/, /\bartboard\b/],
    excluded: [/image/, /filter/, /frame/, /social/],
  },

  { manifestId: "wf.start-end", patterns: [/\bstart\b/, /\bend\b/, /\bterminator\b/, /\bpill\b/] },
  { manifestId: "wf.task", patterns: [/\btask\b/, /\bactivity\b/, /\bstep\b/] },
  { manifestId: "wf.decision", patterns: [/\bdecision\b/, /decision diamond/, /workflow diamond/, /\bbranch\b/] },
  { manifestId: "wf.parallel", patterns: [/\bparallel\b/, /\bfork\b/, /\bjoin\b/, /parallel hexagon/, /\bgateway\b/] },
  { manifestId: "wf.data", patterns: [/\bdata\b/, /\bartifact\b/, /\bparallelogram\b/, /\btrapezoid\b/] },
  {
    manifestId: "wf.flow-edge",
    patterns: [/\bflow edge\b/, /\bsequence\b/, /\bflow arrow\b/, /\bconnector line\b/, /curvy arrow/],
  },
  { manifestId: "wf.cond-edge", patterns: [/conditional/, /cond edge/, /guarded arrow/] },
  {
    manifestId: "wf.lane",
    patterns: [/\bswimlane\b/, /\bpool\b/, /\blane\b/],
    excluded: [/^places\s*\//, /pool table/, /pooling/],
  },
];

// ---------------------------------------------------------------------------

const token = process.env.FIGMA_ACCESS_TOKEN;

async function figmaGet(path) {
  if (!token) throw new Error("FIGMA_ACCESS_TOKEN is not set");
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Recursively collect component provenance from the complete Figma tree. */
function collectComponents(node, acc = [], context = { page: undefined, componentSet: undefined }) {
  const nextContext = {
    page: node.type === "CANVAS" ? node.name : context.page,
    componentSet: node.type === "COMPONENT_SET" ? node.name : context.componentSet,
  };
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    acc.push({
      id: node.id,
      name: node.name,
      type: node.type,
      page: nextContext.page,
      componentSet: context.componentSet,
      variantProperties: Object.keys(node.componentPropertyDefinitions ?? {}),
    });
  }
  if (node.children) node.children.forEach((c) => collectComponents(c, acc, nextContext));
  return acc;
}

/** Retain pages and non-component document nodes that are not in Figma's component API. */
function collectCatalogNodes(node, acc = [], context = { page: undefined }) {
  const page = node.type === "CANVAS" ? node.name : context.page;
  if (node.type === "CANVAS") {
    acc.push({ id: node.id, name: node.name, type: "PAGE", page });
  } else if (!["DOCUMENT", "COMPONENT", "COMPONENT_SET"].includes(node.type)) {
    acc.push({ id: node.id, name: node.name, type: node.type, page });
  }
  if (node.children) node.children.forEach((child) => collectCatalogNodes(child, acc, { page }));
  return acc;
}

/** Find a node targeted by a source's node-specific Figma link. */
function findNodeById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function matchesRule(name, rule) {
  const lower = name.toLowerCase().trim();
  return (
    rule.patterns.some((pattern) => pattern.test(lower)) &&
    !(rule.excluded ?? []).some((pattern) => pattern.test(lower))
  );
}

/** Recursively collect locally defined components from a FigJam file. */
function collectFigJamComponents(data) {
  const localComponents = Object.entries(data.components ?? {}).map(([id, component]) => ({
    id,
    name: component.name,
    type: "COMPONENT",
    published: false,
    page: undefined,
    componentSet: undefined,
    variantProperties: [],
  }));
  const documentComponents = collectComponents(data.document).map((component) => ({
    ...component,
    published: false,
  }));
  const byId = new Map();
  [...localComponents, ...documentComponents].forEach((component) => byId.set(component.id, component));
  return [...byId.values()];
}

const SHAPE_TERMS = {
  DIAMOND: "diamond node",
  HEXAGON: "hexagon node",
  PARALLELOGRAM_RIGHT: "parallelogram",
  ENG_DATABASE: "cylinder database shape",
};

const LIVE_NODE_TYPES = {
  design: new Set(["COMPONENT", "COMPONENT_SET"]),
  semanticPrimitives: new Set(["SHAPE_WITH_TEXT", "CONNECTOR", "SECTION"]),
};

// A design-file name match can still be a UI control or icon. Keep an exact
// audit record for every design-file node admitted as a manifest renderer
// source. Semantic FigJam primitives are verified by their explicit shape and
// role rules instead.
const APPROVED_DESIGN_REFERENCES = new Map([
  ["dpWgseUU58TAk7wAVl55yt:38:37", "prim.anchor.point"],
]);

/**
 * Collect explicitly named FigJam primitives from a source that has opted in
 * through `intakeMode: "semantic-primitives"`. Ordinary FigJam boards are not
 * scanned this way, preventing arbitrary notes and flows from being mistaken
 * for library vocabulary.
 */
function collectFigJamSemanticPrimitives(node, acc = []) {
  if (["SHAPE_WITH_TEXT", "CONNECTOR", "SECTION"].includes(node.type)) {
    const text = [node.name, node.characters, SHAPE_TERMS[node.shapeType]]
      .filter(Boolean)
      .join(" ");
    acc.push({ id: node.id, name: text, type: node.type, published: false, page: undefined, componentSet: undefined, variantProperties: [] });
  }
  if (node.children) node.children.forEach((child) => collectFigJamSemanticPrimitives(child, acc));
  return acc;
}

/** Find every semantic manifest role that a source item can safely serve. */
function matchManifestIds(componentName) {
  return MATCH_RULES.filter((rule) => matchesRule(componentName, rule)).map((rule) => rule.manifestId);
}

function sourceCatalogEntry(manifest, fileKey) {
  return (manifest.sourceCatalog?.sources ?? []).find((source) => source.provenance?.fileKey === fileKey);
}

function capabilityClassesFor(source, component) {
  const sourceClasses = source?.capabilityClasses ?? ["reference-only"];
  // A reviewed mapping is always graph-capable; otherwise retain the source's
  // declared baseline classification without guessing semantic meaning by name.
  return component.approvedManifestIds?.length
    ? [...new Set(["graph-primitive", ...sourceClasses])]
    : sourceClasses;
}

function catalogAssetId(fileKey, nodeId) {
  return `asset.figma.${fileKey}.${String(nodeId).replaceAll(":", "-")}`;
}

function updateSourceCatalog(manifest, source, figmaComponents, catalogNodes = []) {
  const catalogSource = sourceCatalogEntry(manifest, source.fileKey);
  if (!catalogSource) {
    throw new Error(`Figma source ${source.fileKey} is not registered in sourceCatalog`);
  }

  const approvedByNode = new Map();
  for (const component of manifest.components ?? []) {
    if (component.fileKey !== source.fileKey || !component.figmaNodeId) continue;
    const ids = approvedByNode.get(component.figmaNodeId) ?? [];
    ids.push(component.id);
    approvedByNode.set(component.figmaNodeId, ids);
  }

  const componentAssets = figmaComponents.map((component) => {
    const approvedManifestIds = approvedByNode.get(component.id) ?? [];
    const mappingStatus = approvedManifestIds.length ? "approved" : "unmatched";
    return {
      id: catalogAssetId(source.fileKey, component.id),
      sourceId: catalogSource.id,
      label: component.name || component.id,
      assetType: component.type === "COMPONENT_SET" ? "component-set" : "component",
      capabilityClasses: capabilityClassesFor(catalogSource, { approvedManifestIds }),
      capabilityTags: [
        ...(component.componentSet ? [`set:${component.componentSet}`] : []),
        ...(component.variantProperties?.map((property) => `property:${property}`) ?? []),
        ...(approvedManifestIds.length ? approvedManifestIds.map((id) => `approved:${id}`) : []),
      ],
      provenance: {
        sourceId: catalogSource.id,
        fileKey: source.fileKey,
        nodeId: component.id,
        ...(component.page ? { page: component.page } : {}),
        ...(component.componentSet ? { variant: component.componentSet } : {}),
        ...(component.variantProperties?.length ? { properties: Object.fromEntries(component.variantProperties.map((property) => [property, null])) } : {}),
      },
      mappingStatus,
    };
  });
  const componentNodeIds = new Set(figmaComponents.map((component) => component.id));
  const nodeAssets = catalogNodes.filter((node) => !componentNodeIds.has(node.id)).map((node) => ({
    id: catalogAssetId(source.fileKey, node.id),
    sourceId: catalogSource.id,
    label: node.name || node.id,
    assetType: node.type === "PAGE" ? "page" : "node",
    capabilityClasses: catalogSource.capabilityClasses,
    capabilityTags: [`figma:${String(node.type).toLowerCase()}`],
    provenance: {
      sourceId: catalogSource.id,
      fileKey: source.fileKey,
      nodeId: node.id,
      ...(node.page ? { page: node.page } : {}),
    },
    mappingStatus: "unmatched",
  }));
  const generatedAssets = [...componentAssets, ...nodeAssets];

  // Preserve manually curated reference assets, local assets, and other sources;
  // replace only the deterministic generated inventory for this exact source.
  manifest.sourceCatalog.assets = (manifest.sourceCatalog.assets ?? []).filter(
    (asset) => !(asset.id.startsWith(`asset.figma.${source.fileKey}.`)),
  );
  manifest.sourceCatalog.assets.push(...generatedAssets);

  const approved = generatedAssets.filter((asset) => asset.mappingStatus === "approved").length;
  catalogSource.inventory = {
    pages: [...new Set([
      ...figmaComponents.map((component) => component.page),
      ...catalogNodes.filter((node) => node.type === "PAGE").map((node) => node.name),
    ].filter(Boolean))],
    components: figmaComponents.filter((component) => component.type !== "COMPONENT_SET").length,
    componentSets: figmaComponents.filter((component) => component.type === "COMPONENT_SET").length,
    variants: figmaComponents.reduce((count, component) => count + (component.variantProperties?.length ?? 0), 0),
    tokenBundles: catalogSource.inventory.tokenBundles,
  };
  catalogSource.coverage = {
    total: generatedAssets.length,
    approved,
    unmatched: generatedAssets.length - approved,
    excluded: 0,
    blocked: 0,
  };

  return { approved, unmatched: generatedAssets.filter((asset) => asset.mappingStatus === "unmatched") };
}

function updateCatalogReport(manifest, unmatchedFigma, accessFailures = []) {
  const catalog = manifest.sourceCatalog;
  if (!catalog) return;
  const sources = catalog.sources ?? [];
  catalog.coverage = sources.reduce(
    (total, source) => ({
      total: total.total + source.coverage.total,
      approved: total.approved + source.coverage.approved,
      unmatched: total.unmatched + source.coverage.unmatched,
      excluded: total.excluded + source.coverage.excluded,
      blocked: total.blocked + source.coverage.blocked,
    }),
    { total: 0, approved: 0, unmatched: 0, excluded: 0, blocked: 0 },
  );
  catalog.intakeReport = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sourcesInspected: sources.filter((source) => source.status === "accessible" || source.status === "local-only").length,
    accessFailures,
    unmatchedAssetIds: [
      ...(catalog.assets ?? []).filter((asset) => asset.mappingStatus === "unmatched").map((asset) => asset.id),
      ...(catalog.templateCandidates ?? []).filter((candidate) => candidate.mappingStatus === "unmatched").map((candidate) => candidate.id),
    ],
    excludedAssetIds: (catalog.assets ?? []).filter((asset) => asset.mappingStatus === "excluded").map((asset) => asset.id),
  };
}

/**
 * Verify that every recorded Figma reference resolved during this intake run.
 * Semantic-primitive sources must also continue to serve their assigned role.
 */
export function verifyResolvedReferences(manifest, sourceCandidates) {
  const sourcesByKey = new Map((manifest.figmaSources ?? []).map((source) => [source.fileKey, source]));
  const errors = [];

  for (const component of manifest.components ?? []) {
    const hasNode = component.figmaNodeId !== null && component.figmaNodeId !== undefined;
    const hasFile = component.fileKey !== null && component.fileKey !== undefined;
    if (hasNode !== hasFile) {
      errors.push(`${component.id} must provide figmaNodeId and fileKey together`);
      continue;
    }
    if (!hasNode) continue;

    const source = sourcesByKey.get(component.fileKey);
    if (!source) {
      errors.push(`${component.id} references unregistered Figma source ${component.fileKey}`);
      continue;
    }
    const candidates = sourceCandidates.get(component.fileKey);
    const candidate = candidates?.get(component.figmaNodeId);
    if (!candidate) {
      errors.push(
        `${component.id} references node ${component.figmaNodeId} that was not found in source ${component.fileKey}`,
      );
      continue;
    }
    if (
      source.intakeMode === "semantic-primitives" &&
      !matchManifestIds(candidate.name).includes(component.id)
    ) {
      errors.push(
        `${component.id} is not semantically served by primitive ${candidate.id} ("${candidate.name}")`,
      );
    }
  }

  if (errors.length) {
    throw new Error(`Figma reference verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
}

/**
 * Confirm that every retained reference still resolves through Figma's node
 * endpoint. Source catalogs can be stale or omit an unpublished node, so this
 * is intentionally separate from the semantic-source index check above.
 */
export async function verifyLiveReferences(manifest, fetchFigma = figmaGet) {
  const sourcesByKey = new Map((manifest.figmaSources ?? []).map((source) => [source.fileKey, source]));
  const referencesByFile = new Map();
  const errors = [];

  for (const component of manifest.components ?? []) {
    const hasNode = component.figmaNodeId !== null && component.figmaNodeId !== undefined;
    const hasFile = component.fileKey !== null && component.fileKey !== undefined;
    if (hasNode !== hasFile) {
      errors.push(`${component.id} must provide figmaNodeId and fileKey together`);
      continue;
    }
    if (!hasNode) continue;
    if (!sourcesByKey.has(component.fileKey)) {
      errors.push(`${component.id} references unregistered Figma source ${component.fileKey}`);
      continue;
    }
    const references = referencesByFile.get(component.fileKey) ?? [];
    references.push(component);
    referencesByFile.set(component.fileKey, references);
  }

  for (const [fileKey, components] of referencesByFile) {
    const source = sourcesByKey.get(fileKey);
    const ids = components.map((component) => component.figmaNodeId).join(",");
    let data;
    try {
      data = await fetchFigma(`/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`);
    } catch (error) {
      errors.push(`could not query retained nodes in source ${fileKey}: ${error.message}`);
      continue;
    }

    const allowedTypes =
      source.intakeMode === "semantic-primitives"
        ? LIVE_NODE_TYPES.semanticPrimitives
        : LIVE_NODE_TYPES.design;

    for (const component of components) {
      const node = data.nodes?.[component.figmaNodeId]?.document;
      if (!node) {
        errors.push(`${component.id} references node ${component.figmaNodeId} that no longer resolves in source ${fileKey}`);
      } else if (!allowedTypes.has(node.type)) {
        errors.push(
          `${component.id} references node ${component.figmaNodeId} with unsupported type ${node.type} in source ${fileKey}`,
        );
      } else if (
        source.kind !== "figjam" &&
        APPROVED_DESIGN_REFERENCES.get(`${fileKey}:${component.figmaNodeId}`) !== component.id
      ) {
        errors.push(
          `${component.id} references design node ${component.figmaNodeId} without an approved semantic audit in source ${fileKey}`,
        );
      }
    }
  }

  if (errors.length) {
    throw new Error(`Figma live node verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
}

/**
 * Fetch and verify every source in memory. This function never writes files;
 * callers can persist results only after it resolves successfully.
 */
export async function buildIntake(manifest, { fetchFigma = figmaGet, logger = console } = {}) {
  const sources = manifest.figmaSources ?? [];

  if (!sources.length) {
    logger.log("ℹ️  No figmaSources entries found in manifest. Nothing to do.");
    return { manifest, matchLog: [], unmatchedFigma: [] };
  }

  // Build a mutable index: manifestId → component entry
  const byId = Object.fromEntries(manifest.components.map((c) => [c.id, c]));

  const matchLog = [];
  const unmatchedFigma = [];
  const sourceCandidates = new Map();
  const sourceStats = [];
  const accessFailures = manifest.sourceCatalog?.intakeReport?.accessFailures ?? [];

  for (const source of sources) {
    logger.log(`\n📂  Processing: ${source.label} (${source.fileKey})`);

    let figmaComponents = [];
    let catalogNodes = [];
    try {
      if (source.kind === "figjam") {
        // FigJam files expose local components in file metadata rather than
        // through the published design-library endpoint. They are still valid
        // remix sources, so include them without calling them published.
        const data = await fetchFigma(`/files/${source.fileKey}`);
        figmaComponents =
          source.intakeMode === "semantic-primitives"
            ? collectFigJamSemanticPrimitives(data.document)
            : collectFigJamComponents(data);
        catalogNodes = collectCatalogNodes(data.document);
        const sourceItemLabel = source.intakeMode === "semantic-primitives" ? "named primitive" : "local component";
        logger.log(`   Found ${figmaComponents.length} ${sourceItemLabel}(s) in FigJam board.`);
      } else {
        // Design files: inspect both the published catalog and the complete
        // document tree. Dev Mode-ready local components can be present in the
        // file even when they are not returned by /components.
        const [publishedData, fileData] = await Promise.all([
          fetchFigma(`/files/${source.fileKey}/components`),
          fetchFigma(`/files/${source.fileKey}`),
        ]);
        if (source.nodeId) {
          const linkedNode = findNodeById(fileData.document, source.nodeId);
          if (!linkedNode) {
            throw new Error(`linked node ${source.nodeId} was not found in the full file tree`);
          }
          logger.log(`   Inspected linked node ${linkedNode.id}: ${linkedNode.name} (${linkedNode.type}).`);
        }
        const publishedComponents = (publishedData.meta?.components ?? []).map((component) => ({
          id: component.node_id,
          name: component.name,
          type: "COMPONENT",
          published: true,
        }));
        const documentComponents = collectComponents(fileData.document).map((component) => ({
          ...component,
          published: false,
        }));
        const byNodeId = new Map();
        [...documentComponents, ...publishedComponents].forEach((component) => byNodeId.set(component.id, component));
        figmaComponents = [...byNodeId.values()];
        catalogNodes = collectCatalogNodes(fileData.document);
        logger.log(
          `   Found ${figmaComponents.length} component node(s) (${publishedComponents.length} published, full file inspected).`
        );
      }
    } catch (e) {
      throw new Error(`Failed to inspect Figma source ${source.fileKey}: ${e.message}`);
    }

    sourceCandidates.set(source.fileKey, new Map(figmaComponents.map((component) => [component.id, component])));
    const catalogResult = updateSourceCatalog(manifest, source, figmaComponents, catalogNodes);
    unmatchedFigma.push(...catalogResult.unmatched);
    const newMatchCount = catalogResult.approved;
    for (const fc of figmaComponents) {
      const verifiedIds = (byId[fc.id] ? [fc.id] : [])
        .concat(
          manifest.components
            .filter((entry) => entry.fileKey === source.fileKey && entry.figmaNodeId === fc.id)
            .map((entry) => entry.id),
        );
      for (const manifestId of [...new Set(verifiedIds)]) {
        matchLog.push({ manifestId, figmaName: fc.name, nodeId: fc.id, fileKey: source.fileKey });
      }
    }

    sourceStats.push({ source, newMatchCount });
  }

  // Do not update intake statuses or permit persistence until every existing
  // reference has resolved against both the semantic source index and Figma's
  // direct node endpoint.
  verifyResolvedReferences(manifest, sourceCandidates);
  await verifyLiveReferences(manifest, fetchFigma);

  for (const { source, newMatchCount } of sourceStats) {
    const sourceMatchCount = manifest.components.filter(
      (component) => component.figmaNodeId !== null && component.fileKey === source.fileKey
    ).length;
    const sourceItemLabel = source.intakeMode === "semantic-primitives" ? "primitive" : "component";
    source.intakeStatus = `audited — ${sourceMatchCount} ${sourceItemLabel}(s) verified`;
    logger.log(
      `✅  ${source.label}: ${sourceMatchCount} ${sourceItemLabel}(s) verified (${newMatchCount} approved source node(s) retained).`
    );
  }

  updateCatalogReport(manifest, unmatchedFigma, accessFailures);
  return { manifest, matchLog, unmatchedFigma };
}

export async function run({
  manifest = null,
  fetchFigma = figmaGet,
  logger = console,
  writeFile = writeFileSync,
  manifestPath = MANIFEST_PATH,
  catalogPath = CATALOG_PATH,
  artifactCopyPath = ARTIFACT_COPY,
  catalogCopyPath = ARTIFACT_CATALOG_COPY,
} = {}) {
  const inputManifest = manifest ?? JSON.parse(readFileSync(manifestPath, "utf-8"));
  // Runtime manifests intentionally carry a catalog summary only. Rehydrate
  // the full review inventory before a new intake so no unmatched material is
  // discarded on the next generation.
  if (inputManifest.sourceCatalog && !inputManifest.sourceCatalog.assets) {
    inputManifest.sourceCatalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
  }
  const result = await buildIntake(inputManifest, { fetchFigma, logger });

  // The only persistence point: buildIntake has fetched and verified every
  // reference successfully before either mirror is touched.
  const fullCatalog = result.manifest.sourceCatalog;
  const catalogSummary = {
    ...fullCatalog,
    assets: undefined,
    intakeReport: fullCatalog?.intakeReport && {
      ...fullCatalog.intakeReport,
      unmatchedAssetIds: [],
      excludedAssetIds: [],
    },
  };
  delete catalogSummary.assets;
  const runtimeManifest = { ...result.manifest, sourceCatalog: catalogSummary };
  const updated = JSON.stringify(runtimeManifest, null, 2) + "\n";
  // The normal manifest remains renderer-sized. The complete inventory is
  // persisted separately and only read by catalog-specific API/UI paths.
  const fallbackManifest = { ...runtimeManifest };
  delete fallbackManifest.sourceCatalog;
  writeFile(manifestPath, updated);
  writeFile(catalogPath, JSON.stringify(fullCatalog, null, 2) + "\n");
  writeFile(artifactCopyPath, JSON.stringify(fallbackManifest, null, 2) + "\n");
  writeFile(catalogCopyPath, JSON.stringify(fullCatalog, null, 2) + "\n");
  logger.log("\n✅  Manifest updated at:");
  logger.log("    docs/wireframe-library/manifest.json");
  logger.log("    docs/wireframe-library/source-catalog.json");
  logger.log("    artifacts/wireframe-library/src/lib/manifest.json");
  logger.log("    artifacts/wireframe-library/src/lib/source-catalog.json");

  // Gap report
  const gaps = result.manifest.components.filter((c) => c.figmaNodeId === null);
  logger.log(`\n📊  Gap report — ${gaps.length} component(s) still served by React reference set:`);
  gaps.forEach((c) => logger.log(`    • ${c.id}`));

  if (result.matchLog.length) {
    logger.log(`\n🔗  Matched ${result.matchLog.length} Figma component(s):`);
    result.matchLog.forEach((m) =>
      logger.log(`    • ${m.manifestId} ← "${m.figmaName}" (${m.fileKey}:${m.nodeId})`)
    );
  }

  if (result.unmatchedFigma.length) {
    logger.log(`\n⚠️   ${result.unmatchedFigma.length} Figma component(s) were retained as unmatched catalog assets:`);
    result.unmatchedFigma.slice(0, 20).forEach((u) => logger.log(`    • "${u.label}" (${u.provenance.fileKey}:${u.provenance.nodeId})`));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!token) {
    console.error("❌  FIGMA_ACCESS_TOKEN is not set.");
    console.error("   Generate one at: figma.com → Settings → Security → Personal access tokens");
    console.error("   Then run:  FIGMA_ACCESS_TOKEN=<token> node scripts/figma-intake.js");
    process.exit(1);
  }
  run().catch((e) => {
    console.error("Fatal:", e.message);
    process.exit(1);
  });
}
