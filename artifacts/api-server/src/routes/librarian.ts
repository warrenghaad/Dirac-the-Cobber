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

const router: IRouter = Router();

router.get("/librarian/manifest", (_req, res) => {
  res.json(loadManifest());
});

router.post("/librarian/plan", (req, res) => {
  const parsed = CreateDiagramPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const manifest = loadManifest();
  try {
    const plan = buildPlan(parsed.data as PlanRequest, manifest);
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
