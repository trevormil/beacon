import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1).default(":memory:"),
  ADMIN_TOKEN: z.string().min(8).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(4747),
  HOST: z.string().default("0.0.0.0"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
