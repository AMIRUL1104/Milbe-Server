import z from "zod";

export const createBookRequestSchema = z.object({
  body: z
    .object({
      postId: z.string().min(1),
      requesterContact: z
        .object({
          phone: z.string().max(20).optional(),
        })
        .optional(),
      requesterDistrict: z.string().trim().min(1).max(50),
      requesterArea: z.string().trim().min(1).max(50),
      message: z.string().max(1000).optional(),
    })
    .passthrough(),
});

export const getAdminRequestsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    search: z.string().optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    status: z
      .enum(["pending", "accepted", "rejected", "cancelled", "all"])
      .default("all"),
  }),
});
  params: z.object({
    id: z.string().min(1).optional(),
  }),
});

export const checkBookRequestQuerySchema = z.object({
  query: z.object({
    postId: z.string().min(1),
  }),
});

export const getRequestsQuerySchema = z.object({
  query: z.object({
    requesterId: z.string().optional(),
    sellerId: z.string().optional(),
  }),
});

export type CreateBookRequestInput = z.infer<
  typeof createBookRequestSchema
>["body"];
export type BookRequestParamsInput = z.infer<
  typeof bookRequestParamsSchema
>["params"];
export type CheckBookRequestQueryInput = z.infer<
  typeof checkBookRequestQuerySchema
>["query"];
export type GetRequestsQueryInput = z.infer<
  typeof getRequestsQuerySchema
>["query"];
