import z from "zod";

const postBookSchema = z.object({
  bookId: z.string().optional(),
  publisherId: z.string().optional(),
  bookName: z.string().min(1).max(200),
  publisherName: z.string().min(1).max(200),
  image: z.string().url().nullable().optional(),
  condition: z.enum(["new", "like_new", "good", "fair"]),
  price: z.number().min(0).nullable().optional(),
  availableStatus: z.enum(["available", "unavailable"]).default("available"),
});

export const createPostSchema = z.object({
  body: z
    .object({
      title: z.string().min(1).max(200),
      type: z.enum(["sell", "donate"]),
      image: z.string().url().nullable().optional(),
      district: z.string().min(1).max(100),
      area: z.string().min(1).max(100),
      phone: z.string().max(20).optional(),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: z.string().max(100).optional(),
      status: z.enum(["available", "sold", "donated"]).default("available"),
      books: z.array(postBookSchema).min(1),
    }),
});

export const updatePostSchema = z.object({
  body: z
    .object({
      title: z.string().min(1).max(200).optional(),
      type: z.enum(["sell", "donate"]).optional(),
      image: z.string().url().nullable().optional(),
      district: z.string().min(1).max(100).optional(),
      area: z.string().min(1).max(100).optional(),
      phone: z.string().max(20).optional(),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: z.string().max(100).optional(),
      books: z.array(postBookSchema).min(1).optional(),
    }),
  params: z.object({
    id: z.string().min(1),
  }),
});

export const getPostsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    category: z.string().optional(),
    condition: z.string().optional(),
    type: z.enum(["sell", "donate"]).optional(),
    district: z.string().optional(),
    area: z.string().optional(),
    academicLevel: z.string().optional(),
    sort: z
      .enum(["newest", "oldest", "title-asc", "title-desc"])
      .default("newest"),
  }),
});

export const getPostByIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const deletePostParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export type CreatePostInput = z.infer<typeof createPostSchema>["body"];
export type UpdatePostInput = z.infer<typeof updatePostSchema>["body"];
export type GetPostsQueryInput = z.infer<typeof getPostsQuerySchema>["query"];
export type GetPostByIdParamsInput = z.infer<
  typeof getPostByIdParamsSchema
>["params"];
export type DeletePostParamsInput = z.infer<
  typeof deletePostParamsSchema
>["params"];
