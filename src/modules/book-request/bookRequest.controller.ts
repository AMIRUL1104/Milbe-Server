import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/auth.types.js";
import {
  createBookRequest,
  getSentRequests,
  getReceivedRequests,
  checkBookRequest,
  acceptBookRequest,
  rejectBookRequest,
  cancelBookRequest,
} from "./bookRequest.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const createBookRequestController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const request = await createBookRequest(
    req.body,
    req.user!._id,
    req.user!.name,
  );
  sendCreated(res, "Request Sent Successfully", {
    insertedId: request._id,
    createdAt: request.createdAt,
  });
};

export const getSentRequestsController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const requesterId = req.user!._id;
  const requests = await getSentRequests(requesterId);
  sendSuccess(res, "Sent requests fetched successfully", requests);
};

export const getReceivedRequestsController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const sellerId = req.user!._id;
  const requests = await getReceivedRequests(sellerId);
  sendSuccess(res, "Received requests fetched successfully", requests);
};

export const checkBookRequestController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const query = req.query as Record<string, string>;
  // console.log(query);

  const result = await checkBookRequest(query.postId!, req.user!._id);
  sendSuccess(res, "Book request check completed", result);
};

export const acceptBookRequestController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const sellerId = req.user!._id;
  const requestId = getParamId(req);
  if (!requestId) {
    sendSuccess(res, "Invalid request ID", null, undefined, 400);
    return;
  }
  const result = await acceptBookRequest(requestId, sellerId);

  if (!result.success) {
    sendSuccess(res, result.message, null, undefined, 400);
    return;
  }

  sendSuccess(res, result.message);
};

export const rejectBookRequestController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const sellerId = req.user!._id;
  const requestId = getParamId(req);
  if (!requestId) {
    sendSuccess(res, "Invalid request ID", null, undefined, 400);
    return;
  }
  const result = await rejectBookRequest(requestId, sellerId);

  if (!result.success) {
    sendSuccess(res, result.message, null, undefined, 400);
    return;
  }

  sendSuccess(res, result.message);
};

export const cancelBookRequestController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const requestId = getParamId(req);
  if (!requestId) {
    sendSuccess(res, "Invalid request ID", null, undefined, 400);
    return;
  }
  const result = await cancelBookRequest(requestId, req.user!._id);

  if (!result.success) {
    sendSuccess(res, result.message, null, undefined, 400);
    return;
  }

  sendSuccess(res, result.message);
};
