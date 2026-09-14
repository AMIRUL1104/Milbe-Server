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

export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>["query"];
export type DeleteUserParamsInput = z.infer<
  typeof deleteUserParamsSchema
>["params"];
