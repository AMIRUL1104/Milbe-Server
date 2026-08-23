import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyAdmin } from "../../middleware/role.middleware.js";
import {
  getPendingPublishersController,
  getPendingPublisherByIdController,
  createPendingPublisherController,
  updatePendingPublisherController,
  deletePendingPublisherController,
} from "./pendingPublisher.controller.js";

const router = Router();

router.get("/", verifyToken, verifyAdmin, getPendingPublishersController);

router.get("/:id", verifyToken, verifyAdmin, getPendingPublisherByIdController);

router.post("/", verifyToken, verifyAdmin, createPendingPublisherController);

router.patch("/:id", verifyToken, verifyAdmin, updatePendingPublisherController);

router.delete("/:id", verifyToken, verifyAdmin, deletePendingPublisherController);

export default router;