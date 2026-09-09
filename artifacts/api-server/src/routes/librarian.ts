import { Router, type IRouter } from "express";
import {
  AtomicLevel,
  CompositionsResponse,
  PromoteDiagramPlanBody,
  PromoteDiagramPlanResponse,
  CreateDiagramPlanBody,
  CreateDiagramPlanResponse,
  ValidateDiagramPlanBody,
  ValidateDiagramPlanResponse,
  RefineDiagramPlanBody,
} from "@workspace/api-zod";
import {
  buildPlan,
  classifyVisualLanguageFromManifest,
  visualLanguageFamily,
  validatePlan,
  type DiagramPlan,
  type PlanRequest,
} from "@workspace/wireframe-librarian";
import { loadManifest, loadSourceCatalog } from "../lib/manifest";
import { extractWithLLM, isLLMConfigured, refineWithLLM } from "../lib/llmExtract";
import {
  appendPromotedComposition,
  assertManifestWriteAllowed,
  ManifestWriteDisabledError,
  planToComposition,
} from "../lib/promotion";

const router: IRouter = Router();

function isSameWorkspaceOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

router.get("/librarian/manifest", (_req, res) => {
  res.json(loadManifest());
});

router.get("/librarian/catalog", (_req, res) => {
  // The runtime manifest carries this summary too, but catalog clients should
  // never need to download the complete source-node inventory to render it.
  res.json(loadManifest().sourceCatalog ?? null);
});

router.get("/librarian/catalog/assets", (req, res) => {
  const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : "";
  const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "100"), 10) || 100));
  if (!sourceId) {
    res.status(400).json({ message: "sourceId is required." });
    return;
  }

  const catalog = loadSourceCatalog();
  if (!catalog.sources.some((source) => source.id === sourceId)) {
    res.status(404).json({ message: `Unknown sourceId "${sourceId}".` });
    return;
  }
  const assets = (catalog.assets ?? []).filter((asset) => asset.sourceId === sourceId);
  res.json({ items: assets.slice(offset, offset + limit), total: assets.length, offset, limit });
});

router.get("/librarian/compositions", (req, res) => {
  const manifest = loadManifest();
  const compositions = manifest.compositions ?? [];

  const levelParam = req.query.level;
  const validLevels = Object.values(AtomicLevel);
  if (levelParam !== undefined && !validLevels.includes(levelParam as string)) {
    res.status(400).json({
      message: `Invalid level "${levelParam}". Must be one of: ${validLevels.join(", ")}.`,
    });
    return;
  }

  const filtered = levelParam
    ? compositions.filter((c: { atomicLevel?: string }) => c.atomicLevel === levelParam)
    : compositions;

  res.json(CompositionsResponse.parse({ compositions: filtered }));
});

router.post("/librarian/compositions/promote", async (req, res) => {
  const origin = req.get("origin");
  const host = req.get("host");
  if (!isSameWorkspaceOrigin(origin, host)) {
    res.status(403).json({ message: "Template promotion requests must come from this workspace." });
    return;
  }
  try {
    assertManifestWriteAllowed();
  } catch (err) {
    res.status(403).json({ message: err instanceof Error ? err.message : "Template promotion is disabled." });
    return;
  }

  const parsed = PromoteDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const manifest = loadManifest();
  const validation = validatePlan(parsed.data.plan as DiagramPlan, manifest);
  if (!validation.valid) {
    res.status(400).json({
      message: "Only valid diagram plans can be promoted.",
      validation,
    });
    return;
  }

  const { plan, ...metadata } = parsed.data;
  const composition = planToComposition(plan as DiagramPlan, metadata, manifest);

  try {
    await appendPromotedComposition(composition);
    res.status(201).json(PromoteDiagramPlanResponse.parse({ composition }));
  } catch (err) {
    if (err instanceof ManifestWriteDisabledError) {
      res.status(403).json({ message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Unable to save the composition.";
    const status = message.includes("already exists") ? 409 : 400;
    req.log.warn({ err }, "composition promotion failed");
    res.status(status).json({ message });
  }
});

router.post("/librarian/plan", async (req, res) => {
  const parsed = CreateDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const reqData = parsed.data as PlanRequest;
  const manifest = loadManifest();
  const selectedVisualLanguage =
    reqData.visualLanguage ?? classifyVisualLanguageFromManifest(reqData.need, manifest);

  // Build the plan request, potentially enriched by LLM extraction.
  let planRequest: PlanRequest = reqData;
  const extraNotes: string[] = [];

  // Only attempt LLM extraction when no explicit nodes were provided.
  if (!reqData.nodes || reqData.nodes.length === 0) {
    if (!isLLMConfigured()) {
      extraNotes.push(
        "AI extraction not configured (AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY missing); " +
          "falling back to deterministic keyword extraction.",
      );
    } else {
      try {
        const llmResult = await extractWithLLM(
          reqData.need,
          reqData.family ?? visualLanguageFamily(selectedVisualLanguage),
        );
        if (llmResult) {
          planRequest = {
            ...reqData,
            // LLM supplies structure; deterministic engine owns axes/tiers.
            family: reqData.family,
            visualLanguage: selectedVisualLanguage,
            nodes: llmResult.nodes,
            edges: llmResult.edges,
            groups: reqData.groups ?? llmResult.groups,
          };
          extraNotes.push(...llmResult.notes);
        }
      } catch (llmErr) {
        // LLM is configured but failed — surface the error so the caller can
        // show a user-facing message and offer a retry.  Do NOT silently fall
        // back to deterministic: for free-form needs the keyword extractor
        // produces a misleading diagram that the user has no way to identify
        // as wrong unless they read the notes carefully.
        req.log.warn({ err: llmErr }, "LLM extraction failed");
        const detail = llmErr instanceof Error ? llmErr.message : String(llmErr);
        res.status(503).json({
          message: `AI extraction failed — ${detail}. Please retry or simplify your description.`,
          llmError: true,
        });
        return;
      }
    }
  }

  try {
    const plan = buildPlan(planRequest, manifest);

    // Prepend extraction notes so callers know which path was taken.
    if (extraNotes.length > 0) {
      plan.notes.unshift(...extraNotes);
    }

    const validation = validatePlan(plan, manifest);
    res.json(CreateDiagramPlanResponse.parse({ plan, validation }));
  } catch (err) {
    req.log.warn({ err }, "plan build failed");
    res.status(400).json({ message: err instanceof Error ? err.message : "Plan build failed" });
  }
});

router.post("/librarian/refine", async (req, res) => {
  const parsed = RefineDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const { refinement, currentPlan, family, view } = parsed.data;

  if (!isLLMConfigured()) {
    res.status(503).json({
      message: "AI refinement requires an LLM (AI_INTEGRATIONS_OPENAI_BASE_URL / OPENAI_API_KEY not set).",
      llmError: true,
    });
    return;
  }

  const manifest = loadManifest();

  let llmResult;
  try {
    llmResult = await refineWithLLM(currentPlan, refinement);
    if (!llmResult) {
      res.status(503).json({
        message: "AI refinement is not available (LLM not configured).",
        llmError: true,
      });
      return;
    }
  } catch (llmErr) {
    req.log.warn({ err: llmErr }, "LLM refinement failed");
    const detail = llmErr instanceof Error ? llmErr.message : String(llmErr);
    res.status(503).json({
      message: `AI refinement failed — ${detail}. Please retry or simplify your instruction.`,
      llmError: true,
    });
    return;
  }

  try {
    const planRequest: PlanRequest = {
      need: currentPlan.need,
      family: family ?? llmResult.family,
      visualLanguage: currentPlan.visualLanguage,
      compositionIds: currentPlan.compositionIds,
      view,
      nodes: llmResult.nodes,
      edges: llmResult.edges,
      groups: llmResult.groups,
    };

    const plan = buildPlan(planRequest, manifest);

    // Prepend refinement notes, then carry forward original plan notes as history.
    const historyNotes = currentPlan.notes.filter((n: string) =>
      n.startsWith("Refined by LLM") || n.startsWith("Structure extracted by LLM"),
    );
    plan.notes.unshift(...llmResult.notes);
    if (historyNotes.length > 0) {
      plan.notes.push("— Previous notes —", ...historyNotes);
    }

    const validation = validatePlan(plan, manifest);
    res.json(CreateDiagramPlanResponse.parse({ plan, validation }));
  } catch (err) {
    req.log.warn({ err }, "plan build failed after refinement");
    res.status(400).json({ message: err instanceof Error ? err.message : "Plan build failed" });
  }
});

router.post("/librarian/validate", (req, res) => {
  const parsed = ValidateDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const report = validatePlan(parsed.data as DiagramPlan, loadManifest());
  res.json(ValidateDiagramPlanResponse.parse(report));
});

export default router;
