import type { Request, Response, NextFunction } from "express";

import { ApiError } from "../utils/apiError.js";
import type z from "zod";
import { ZodError } from "zod";

export const validate =
  (schema: z.ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const errors = error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
          code: String(e.code),
        }));
        console.log("Zod validation errors:", errors); // <-- এটা যোগ করো
        next(ApiError.validation("Validation failed", errors));
      } else {
        next(error);
      }
    }
  };
