import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  deleteImageController,
  uploadImageController,
} from "./image.controller.js";
import { parseImageUpload } from "./image.upload.js";
import { deleteImageParamsSchema, uploadImageSchema } from "./image.validation.js";

const router = Router();

router.post(
  "/",
  verifyToken,
  parseImageUpload,
  validate(uploadImageSchema),
  uploadImageController,
);

router.delete(
  "/:assetId",
  verifyToken,
  validate(deleteImageParamsSchema),
  deleteImageController,
);

export default router;
