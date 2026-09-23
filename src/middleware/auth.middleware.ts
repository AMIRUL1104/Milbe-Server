import type { Response, NextFunction } from "express";
import { ObjectId } from "mongodb";

import { sessionCollection, userCollection } from "../database/collections.js";
import type { AuthRequest } from "./auth.types.js";

export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing.",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    const token = authHeader.split(" ")[1];

    const session = await sessionCollection.findOne({ token });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session.",
      });
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Session expired.",
      });
    }

    const user = await userCollection.findOne({
      _id: new ObjectId(session.userId),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "User blocked.",
      });
    }

    req.user = {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isBlocked: user.isBlocked,
      emailVerified: user.emailVerified,
      // Profile location lives on the same `user` document — used as the
      // server-side fallback when a client omits requester location.
      district: (user.district as string | undefined) ?? undefined,
      area: (user.area as string | undefined) ?? undefined,
    };

    next();
  } catch (error) {
    next(error);
  }
};
