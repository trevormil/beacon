export type Dialect = "postgres" | "mysql" | "sqlite" | "mongo";

export type FeedbackStatus = "new" | "processed" | "skipped";

export type Project = {
  id: string;
  slug: string;
  publicKey: string;
  allowedOrigins: string[];
  targetRepo: string | null;
  targetForge: string | null;
  meta: Record<string, unknown>;
  createdAt: number;
};

export type ProjectSecret = {
  id: string;
  projectId: string;
  secretHash: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
};

export type Feedback = {
  id: string;
  projectId: string;
  message: string;
  email: string | null;
  url: string | null;
  userAgent: string | null;
  viewport: string | null;
  status: FeedbackStatus;
  createdAt: number;
  processedAt: number | null;
};

export type CreateProjectInput = {
  slug: string;
  publicKey: string;
  allowedOrigins: string[];
  targetRepo?: string | null;
  targetForge?: string | null;
  meta?: Record<string, unknown>;
};

export type CreateSecretInput = {
  projectId: string;
  secretHash: string;
  label: string;
};

export type InsertFeedbackInput = {
  projectId: string;
  message: string;
  email?: string | null;
  url?: string | null;
  userAgent?: string | null;
  viewport?: string | null;
};

export type ListFeedbackOpts = {
  projectId: string;
  status?: FeedbackStatus;
  sinceMs?: number;
  limit?: number;
};
