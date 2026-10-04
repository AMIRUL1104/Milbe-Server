import z from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONGODB_URI: z
    .string()
    .url("MONGODB_URI must be a valid MongoDB connection string"),
  CLIENT_URL: z.string().url().optional().or(z.literal("")),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
