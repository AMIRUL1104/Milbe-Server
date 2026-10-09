import type { Request, Response, NextFunction } from "express";

import { ApiError } from "../utils/apiError.js";
import type z from "zod";
import { ZodError } from "zod";

export const validate =
  (schema: z.ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as { query?: unknown };

      // Express exposes `req.query` through a getter that re-parses the URL
      // on every access, so `Object.assign(req.query, parsed.query)` would
      // mutate a throw-away object and the values would be lost (verified
      // against Express 5). Shadow the getter with the parsed result (Zod
      // defaults/coercions such as role="all", status="all", page=1) as an
      // own data property so controllers and the service layer read the
      // validated values.
      if (parsed && typeof parsed.query === "object" && parsed.query !== null) {
        Object.defineProperty(req, "query", {
          value: parsed.query,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

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
