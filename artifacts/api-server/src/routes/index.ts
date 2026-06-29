import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import messagingRouter from "./messaging";
import sequencesRouter from "./sequences";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(messagingRouter);
router.use(sequencesRouter);

export default router;
