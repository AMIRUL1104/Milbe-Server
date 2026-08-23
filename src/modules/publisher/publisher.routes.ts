import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyAdmin } from "../../middleware/role.middleware.js";
import {
  getPublishersController,
  getPublisherByIdController,
  createPublisherController,
  updatePublisherController,
  deletePublisherController,
} from "./publisher.controller.js";

const router = Router();

router.get("/", verifyToken, verifyAdmin, getPublishersController);

router.get("/:id", verifyToken, verifyAdmin, getPublisherByIdController);

router.post("/", verifyToken, verifyAdmin, createPublisherController);

router.patch("/:id", verifyToken, verifyAdmin, updatePublisherController);

router.delete("/:id", verifyToken, verifyAdmin, deletePublisherController);

export default router;