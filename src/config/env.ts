import z from "zod";
import { assertProductionBrevoConfiguration } from "./brevoEmailConfig.js";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONGODB_URI: z
    .string()
    .url("MONGODB_URI must be a valid MongoDB connection string"),
  CLIENT_URL: z.string().url().optional().or(z.literal("")),
  TRANSLATION_PROVIDER: z.enum(["mymemory"]).default("mymemory"),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

const parsedEnv = envSchema.parse(process.env);
assertProductionBrevoConfiguration(parsedEnv.NODE_ENV, parsedEnv);

export const env = parsedEnv;

export type Env = z.infer<typeof envSchema>;
