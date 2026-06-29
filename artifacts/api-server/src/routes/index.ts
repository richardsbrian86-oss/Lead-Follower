import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);

export default router;
