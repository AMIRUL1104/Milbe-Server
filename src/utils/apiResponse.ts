import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  meta?: Record<string, unknown>
): void => {
  const response: ApiResponse<T> = {
    success: statusCode >= 200 && statusCode < 300,
    statusCode,
    message,
    ...(data !== undefined && { data }),
    ...(meta !== undefined && { meta }),
  };

  res.status(statusCode).json(response);
};

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  meta?: Record<string, unknown>,
  statusCode = 200
): void => {
  sendResponse(res, statusCode, message, data, meta);
};

export const sendCreated = <T>(
  res: Response,
  message: string,
  data?: T,
  meta?: Record<string, unknown>
): void => {
  sendResponse(res, 201, message, data, meta);
};

export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};