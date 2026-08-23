import type { Request, Response } from "express";
import {
  getPublishers,
  getPublisherById,
  createPublisher,
  updatePublisher,
  deletePublisher,
} from "./publisher.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const getPublishersController = async (req: Request, res: Response): Promise<void> => {
  const publishers = await getPublishers();
  sendSuccess(res, "Publishers fetched successfully", publishers);
};

export const getPublisherByIdController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const publisher = await getPublisherById(id);
  if (!publisher) {
    sendSuccess(res, "Publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Publisher fetched successfully", publisher);
};

export const createPublisherController = async (req: Request, res: Response): Promise<void> => {
  const publisher = await createPublisher(req.body);
  sendCreated(res, "Publisher created successfully", publisher);
};

export const updatePublisherController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const publisher = await updatePublisher(id, req.body);
  if (!publisher) {
    sendSuccess(res, "Publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Publisher updated successfully", publisher);
};

export const deletePublisherController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid publisher ID", null, undefined, 400);
    return;
  }
  const deleted = await deletePublisher(id);
  if (!deleted) {
    sendSuccess(res, "Publisher not found", null, undefined, 404);
    return;
  }
  sendSuccess(res, "Publisher deleted successfully");
};