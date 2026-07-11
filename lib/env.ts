import { z } from "zod";

const serverEnvSchema = z.object({
  APP_ADMIN_PASSWORD: z.string().min(8),
  AUTH_SECRET: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export function getServerEnv() {
  return serverEnvSchema.safeParse(process.env);
}
