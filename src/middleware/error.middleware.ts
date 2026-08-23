import type { Request, Response, NextFunction } from "express";
import { ApiError, isApiError } from "../utils/apiError.js";
import { sendResponse } from "../utils/apiResponse.js";

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (isApiError(error)) {
    sendResponse(res, error.statusCode, error.message, undefined, {
      errors: error.errors.length > 0 ? error.errors : undefined,
    });
    return;
  }

  if (error instanceof Error) {
    console.error("Unhandled error:", error);
    sendResponse(res, 500, "Internal server error");
    return;
  }

  console.error("Unknown error:", error);
  sendResponse(res, 500, "Internal server error");
};

export const notFoundMiddleware = (req: Request, res: Response): void => {
  sendResponse(res, 404, `Route ${req.method} ${req.path} not found`);
};