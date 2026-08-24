import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/auth.types.js";
import {
  getAdminDashboardData,
  getUserDashboardData,
} from "./dashboard.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export const getAdminDashboardController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const data = await getAdminDashboardData();
    sendSuccess(res, "Admin dashboard data fetched successfully", data);
  } catch (error) {
    console.error("[AdminDashboard] Error fetching data:", error);
    sendSuccess(
      res,
      "Failed to fetch admin dashboard data",
      null,
      undefined,
      500,
    );
  }
};

export const getUserDashboardController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id;
    const data = await getUserDashboardData(userId);
    sendSuccess(res, "User dashboard data fetched successfully", data);
  } catch (error) {
    console.error("[UserDashboard] Error fetching data:", error);
    sendSuccess(
      res,
      "Failed to fetch user dashboard data",
      null,
      undefined,
      500,
    );
  }
};
