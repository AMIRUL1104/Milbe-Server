import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/auth.types.js";
import { ApiError } from "../../utils/apiError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { deletePendingImage, uploadImage } from "./image.service.js";
import type { ImagePurpose } from "./image.types.js";
import { hasValidImageSignature } from "./image.validation.js";

export const uploadImageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = (req as AuthRequest).user;
  const file = req.file;
  const purpose = req.body?.purpose as ImagePurpose | undefined;
  if (!user) throw ApiError.unauthorized();
  if (!file) throw ApiError.badRequest("An image file is required.");
  if (!hasValidImageSignature(file.buffer, file.mimetype)) {
    throw ApiError.badRequest("The uploaded file is not a valid JPG, PNG, or WEBP image.");
  }
  if (purpose !== "post" && purpose !== "profile") {
    throw ApiError.badRequest("Image purpose must be post or profile.");
  }
  if (purpose === "post" && user.role !== "user") {
    throw ApiError.forbidden("Only regular users can upload post images.");
  }

  const result = await uploadImage(user._id, purpose, file.buffer);
  sendSuccess(res, "Image uploaded successfully.", result, undefined, 201);
};

export const deleteImageController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = (req as AuthRequest).user;
  const assetId = Array.isArray(req.params.assetId)
    ? req.params.assetId[0]
    : req.params.assetId;
  if (!user) throw ApiError.unauthorized();
  if (!assetId) throw ApiError.badRequest("Image asset ID is required.");

  await deletePendingImage(assetId, user._id);
  sendSuccess(res, "Image deleted successfully.");
};
