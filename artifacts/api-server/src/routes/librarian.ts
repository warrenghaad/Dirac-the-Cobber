import { Router, type IRouter } from "express";
import {
  AtomicLevel,
  CompositionsResponse,
  CreateDiagramPlanBody,
  CreateDiagramPlanResponse,
  ValidateDiagramPlanBody,
  ValidateDiagramPlanResponse,
  RefineDiagramPlanBody,
} from "@workspace/api-zod";
import {
  buildPlan,
  validatePlan,
  type DiagramPlan,
  type PlanRequest,
} from "@workspace/wireframe-librarian";
import { loadManifest } from "../lib/manifest";
import { extractWithLLM, isLLMConfigured, refineWithLLM } from "../lib/llmExtract";

const router: IRouter = Router();

router.get("/librarian/manifest", (_req, res) => {
  res.json(loadManifest());
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

router.post("/librarian/plan", async (req, res) => {
  const parsed = CreateDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const reqData = parsed.data as PlanRequest;
  const manifest = loadManifest();

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
        const llmResult = await extractWithLLM(reqData.need, reqData.family);
        if (llmResult) {
          planRequest = {
            ...reqData,
            // LLM supplies structure; deterministic engine owns axes/tiers.
            family: reqData.family ?? llmResult.family,
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

  const { refinement, currentPlan } = parsed.data;

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
      family: llmResult.family,
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
