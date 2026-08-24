import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.types.js";

export const verifyUser = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.role !== "user") {
    return res.status(403).json({
      success: false,
      message: "Forbidden access.",
    });
  }

  next();
};

export const verifyAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden access.",
    });
  }

  next();
};
