import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../utils/apiError.js";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ACCEPTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(ApiError.badRequest("Only JPG, PNG, or WEBP images are allowed."));
      return;
    }
    callback(null, true);
  },
}).single("image");

export const parseImageUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  parser(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(ApiError.badRequest("Image must be 4 MB or smaller."));
        return;
      }
      next(ApiError.badRequest("Invalid image upload request."));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};
