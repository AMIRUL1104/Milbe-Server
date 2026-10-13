import z from "zod";
import { assertProductionSmtpConfiguration } from "./emailConfig.js";

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
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

const parsedEnv = envSchema.parse(process.env);
assertProductionSmtpConfiguration(parsedEnv.NODE_ENV, parsedEnv);

export const env = parsedEnv;

export type Env = z.infer<typeof envSchema>;
