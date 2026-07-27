import { Router, type IRouter } from "express";
import {
  CreateDiagramPlanBody,
  CreateDiagramPlanResponse,
  ValidateDiagramPlanBody,
  ValidateDiagramPlanResponse,
} from "@workspace/api-zod";
import {
  buildPlan,
  validatePlan,
  type DiagramPlan,
  type PlanRequest,
} from "@workspace/wireframe-librarian";
import { loadManifest } from "../lib/manifest";
import { extractWithLLM, isLLMConfigured } from "../lib/llmExtract";

const router: IRouter = Router();

router.get("/librarian/manifest", (_req, res) => {
  res.json(loadManifest());
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
        req.log.warn({ err: llmErr }, "LLM extraction failed; falling back to deterministic");
        extraNotes.push(
          `LLM extraction failed (${llmErr instanceof Error ? llmErr.message : String(llmErr)}); ` +
            "falling back to deterministic keyword extraction.",
        );
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
