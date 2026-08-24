import z from "zod";

export const createBookRequestSchema = z.object({
  body: z
    .object({
      postId: z.string().min(1),
      postTitle: z.string().min(1).max(200),
      bookCoverUrl: z.string().url(),
      sellerId: z.string().min(1),
      sellerName: z.string().min(1).max(100),
      sellerContact: z
        .object({
          phone: z.string().max(20).optional(),
          messenger: z.string().max(100).optional(),
        })
        .optional(),
      requesterId: z.string().min(1),
      requesterName: z.string().min(1).max(100),
      requesterAvatarUrl: z.string().url().optional(),
      requesterContact: z
        .object({
          phone: z.string().max(20).optional(),
        })
        .optional(),
      message: z.string().max(1000).optional(),
    })
    .strict(),
});

export const bookRequestParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const checkBookRequestQuerySchema = z.object({
  query: z.object({
    postId: z.string().min(1),
    requesterId: z.string().min(1),
    sellerId: z.string().min(1),
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
