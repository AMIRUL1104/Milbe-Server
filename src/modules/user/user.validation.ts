import z from "zod";

export const getUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    search: z.string().optional(),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    role: z.enum(["user", "admin", "all"]).default("all"),
    status: z.enum(["active", "suspended", "all"]).default("all"),
  }),
});

export const deleteUserParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const updateCurrentUserProfileSchema = z.object({
  body: z
    .object({
      fullName: z.string().trim().min(1).max(80).optional(),
      phoneNumber: z.string().trim().max(20).optional(),
      district: z.string().trim().max(50).optional(),
      area: z.string().trim().max(100).optional(),
      avatarUrl: z.string().url().nullable().optional(),
      avatarAssetId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.avatarAssetId && !data.avatarUrl) {
        ctx.addIssue({
          code: "custom",
          message: "An avatar URL is required with an image asset ID.",
          path: ["avatarUrl"],
        });
      }
    }),
});

export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>["query"];
export type DeleteUserParamsInput = z.infer<
  typeof deleteUserParamsSchema
>["params"];
