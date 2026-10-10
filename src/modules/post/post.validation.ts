import z from "zod";

const overallConditionSchema = z.enum(["new", "like_new", "good", "fair"]);

const postBookSchema = z.object({
  bookId: z.string().optional(),
  publisherId: z.string().optional(),
  bookName: z.string().trim().max(200).optional(),
  author: z.string().trim().max(200).optional(),
  publisherName: z.string().trim().max(200).optional(),
  availableStatus: z.enum(["available", "unavailable"]).default("available"),
});

export const createPostSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(200),
      type: z.enum(["sell", "donate"]),
      image: z.string().url(),
      totalPrice: z.number().min(0).nullable(),
      overallCondition: overallConditionSchema.default("good"),
      district: z.string().min(1).max(100),
      area: z.string().min(1).max(100),
      phone: z.string().min(1).max(20),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: z.string().trim().min(1).max(100),
      books: z.array(postBookSchema).default([]),
    })
    .superRefine((data, ctx) => {
      if (data.type === "donate") {
        if (data.totalPrice !== null) {
          ctx.addIssue({
            code: "custom",
            message: "Donate posts must have totalPrice: null.",
            path: ["totalPrice"],
          });
        }
        return;
      }
      // sell
      if (
        data.totalPrice === null ||
        data.totalPrice === undefined ||
        data.totalPrice < 0
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Sell posts require a total price of 0 or more.",
          path: ["totalPrice"],
        });
      }
    }),
});

export const updatePostSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      type: z.enum(["sell", "donate"]).optional(),
      image: z.string().url().optional(),
      totalPrice: z.number().min(0).nullable().optional(),
      overallCondition: overallConditionSchema.optional(),
      district: z.string().min(1).max(100).optional(),
      area: z.string().min(1).max(100).optional(),
      phone: z.string().min(1).max(20).optional(),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      books: z.array(postBookSchema).optional(),
    })
    .superRefine((data, ctx) => {
      // The client always sends the full payload (type included); the
      // type-aware totalPrice rules only apply when `type` is provided.
      if (data.type === "donate" && data.totalPrice !== undefined) {
        if (data.totalPrice !== null) {
          ctx.addIssue({
            code: "custom",
            message: "Donate posts must have totalPrice: null.",
            path: ["totalPrice"],
          });
        }
        return;
      }
      if (
        data.type === "sell" &&
        (data.totalPrice === null ||
          data.totalPrice === undefined ||
          data.totalPrice < 0)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Sell posts require a total price of 0 or more.",
          path: ["totalPrice"],
        });
      }
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

export const getPostBySlugParamsSchema = z.object({
  params: z.object({
    slug: z.string().min(1),
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
