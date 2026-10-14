import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/auth.types.js";
import {
  createUserProfile,
  getUserProfile,
  getUsers,
  deleteUser,
  updateCurrentUserProfile,
} from "./user.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import {
  getUsersQuerySchema,
  updateCurrentUserProfileSchema,
} from "./user.validation.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const createUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const userData = {
    userId: req.user!._id,
    fullName: req.user!.name,
    email: req.user!.email,
    role: req.user!.role,
  };

  const profile = await createUserProfile(userData);
  sendCreated(res, "User created successfully", profile);
};

export const getUserProfileController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const userId = req.user!._id;
  const profile = await getUserProfile(userId);

  if (!profile) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "User profile fetched successfully", profile);
};

export const updateCurrentUserProfileController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const result = await updateCurrentUserProfile(
    req.user!._id,
    updateCurrentUserProfileSchema.shape.body.parse(req.body),
  );
  if (!result) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }
  sendSuccess(
    res,
    result.cleanupPending
      ? "Profile updated; old image cleanup is pending."
      : "Profile updated successfully.",
    result,
    result.cleanupPending ? { cleanupPending: true } : undefined,
  );
};

export const getUsersController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { query } = getUsersQuerySchema.parse({ query: req.query });
  const result = await getUsers(query);
  sendSuccess(res, "Users fetched successfully", result.users, {
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
  });
};

export const deleteUserController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = getParamId(req);
  if (!userId) {
    sendSuccess(res, "Invalid user ID", null, undefined, 400);
    return;
  }
  const result = await deleteUser(userId);

  if (!result.deleted) {
    sendSuccess(res, "User not found", null, undefined, 404);
    return;
  }

  sendSuccess(
    res,
    result.cleanupPending
      ? "User deleted; profile image cleanup is pending."
      : "User deleted successfully",
    undefined,
    result.cleanupPending ? { cleanupPending: true } : undefined,
  );
};
