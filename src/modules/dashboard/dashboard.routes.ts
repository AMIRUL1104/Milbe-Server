import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyAdmin, verifyUser } from "../../middleware/role.middleware.js";
import {
  getAdminDashboardController,
  getUserDashboardController,
} from "./dashboard.controller.js";

const router = Router();

router.get("/admin", verifyToken, verifyAdmin, getAdminDashboardController);

router.get("/user", verifyToken, verifyUser, getUserDashboardController);

export default router;