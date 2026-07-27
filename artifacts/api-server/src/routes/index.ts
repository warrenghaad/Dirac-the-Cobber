import { Router, type IRouter } from "express";
import healthRouter from "./health";
import librarianRouter from "./librarian";

const router: IRouter = Router();

router.use(healthRouter);
router.use(librarianRouter);

export default router;
