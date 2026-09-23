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
      requesterDistrict: z.string().trim().max(50).optional(),
      requesterArea: z.string().trim().max(50).optional(),
      message: z.string().max(1000).optional(),
    })
    .passthrough(),
});

export const bookRequestParamsSchema = z.object({
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
