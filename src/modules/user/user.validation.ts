import z from "zod";

export const updateUserProfileSchema = z.object({
  body: z
    .object({
      fullName: z.string().min(1).max(100).optional(),
      phoneNumber: z.string().max(20).optional(),
      district: z.string().max(50).optional(),
      area: z.string().max(100).optional(),
      avatarUrl: z.string().url().nullable().optional(),
    })
    .strict(),
});

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

export type UpdateUserProfileInput = z.infer<
  typeof updateUserProfileSchema
>["body"];
export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>["query"];
export type DeleteUserParamsInput = z.infer<
  typeof deleteUserParamsSchema
>["params"];
