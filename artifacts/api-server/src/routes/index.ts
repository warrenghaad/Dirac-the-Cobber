import { Router, type IRouter } from "express";
import healthRouter from "./health";
import librarianRouter from "./librarian";
import figmaImportRouter from "./figma-import";

const router: IRouter = Router();

router.use(healthRouter);
router.use(librarianRouter);
router.use(figmaImportRouter);

export default router;
