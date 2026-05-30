import { z } from "zod";

export const FeedbackInput = z.object({
  message: z.string().trim().min(1).max(10_000),
  email: z.string().trim().email().max(255).optional(),
  url: z.string().trim().max(2048).optional(),
  viewport: z
    .string()
    .trim()
    .regex(/^\d{1,5}x\d{1,5}$/)
    .optional(),
  meta: z.record(z.unknown()).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export const CreateProjectInput = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase kebab-case"),
  allowedOrigins: z.array(z.string().url()).min(1).max(50),
  targetRepo: z.string().trim().min(1).max(255).optional(),
  targetForge: z.enum(["github", "gitlab"]).optional(),
  theme: z
    .object({
      primary: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb")
        .optional(),
      primaryFg: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      position: z.enum(["bottom-right", "bottom-left"]).optional(),
      title: z.string().max(64).optional(),
      placeholder: z.string().max(255).optional(),
      successMessage: z.string().max(255).optional(),
    })
    .optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const CreateSecretInput = z.object({
  label: z.string().trim().min(1).max(64).default("cli"),
});
