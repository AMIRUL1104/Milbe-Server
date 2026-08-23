import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyUser } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createBookRequestController,
  getSentRequestsController,
  getReceivedRequestsController,
  checkBookRequestController,
  acceptBookRequestController,
  rejectBookRequestController,
  cancelBookRequestController,
} from "./bookRequest.controller.js";
import {
  createBookRequestSchema,
  bookRequestParamsSchema,
  checkBookRequestQuerySchema,
  getRequestsQuerySchema,
} from "./bookRequest.validation.js";

const router = Router();

router.post("/", verifyToken, verifyUser, validate(createBookRequestSchema), createBookRequestController);

router.get("/sent", verifyToken, verifyUser, validate(getRequestsQuerySchema), getSentRequestsController);

router.get("/received", verifyToken, verifyUser, validate(getRequestsQuerySchema), getReceivedRequestsController);

router.get("/check", validate(checkBookRequestQuerySchema), checkBookRequestController);

router.patch("/:id/accept", verifyToken, verifyUser, validate(bookRequestParamsSchema), acceptBookRequestController);

router.patch("/:id/reject", verifyToken, verifyUser, validate(bookRequestParamsSchema), rejectBookRequestController);

router.patch("/:id/cancel", verifyToken, verifyUser, validate(bookRequestParamsSchema), cancelBookRequestController);

export default router;