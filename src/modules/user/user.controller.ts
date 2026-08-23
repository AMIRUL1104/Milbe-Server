import type { Request, Response } from "express";
import type { AuthRequest } from "../../types/auth.types.js";
import {
  createUserProfile,
  getUserProfile,
  getUsers,
  updateUserProfile,
  deleteUser,
} from "./user.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const userData = {
    userId: req.user!._id,
    fullName: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
  };

  const profile = await createUserProfile(userData);
  sendCreated(res, "User created successfully", profile);
};

export const getUserProfileController = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!._id;
  const profile = await getUserProfile(userId);

  if (!profile) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "User profile fetched successfully", profile);
};

export const getUsersController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string>;
  const result = await getUsers(query as any);
  sendSuccess(res, "Users fetched successfully", result.users, {
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
  });
};

export const updateUserController = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!._id;
  const updated = await updateUserProfile(userId, req.body);

  if (!updated) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Your Profile updated successfully", updated);
};

export const deleteUserController = async (req: Request, res: Response): Promise<void> => {
  const userId = getParamId(req);
  if (!userId) {
    sendSuccess(res, "Invalid user ID", null, undefined, 400);
    return;
  }
  const deleted = await deleteUser(userId);

  if (!deleted) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "User deleted successfully");
};