import type { Request, Response } from "express";
import {
  getPendingPublishers,
  getPendingPublisherById,
  createPendingPublisher,
  updatePendingPublisher,
  deletePendingPublisher,
} from "./pendingPublisher.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const getPendingPublishersController = async (req: Request, res: Response): Promise<void> => {
  const publishers = await getPendingPublishers();
  sendSuccess(res, "Pending publishers fetched successfully", publishers);
};

export const getPendingPublisherByIdController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const publisher = await getPendingPublisherById(id);
  if (!publisher) {
    sendSuccess(res, "Pending publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Pending publisher fetched successfully", publisher);
};

export const createPendingPublisherController = async (req: Request, res: Response): Promise<void> => {
  const publisher = await createPendingPublisher(req.body);
  sendCreated(res, "Pending publisher created successfully", publisher);
};

export const updatePendingPublisherController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const publisher = await updatePendingPublisher(id, req.body);
  if (!publisher) {
    sendSuccess(res, "Pending publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Pending publisher updated successfully", publisher);
};

export const deletePendingPublisherController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const deleted = await deletePendingPublisher(id);
  if (!deleted) {
    sendSuccess(res, "Pending publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Pending publisher deleted successfully");
};