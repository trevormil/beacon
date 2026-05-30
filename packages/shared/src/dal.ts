import type {
  CreateProjectInput,
  CreateSecretInput,
  Feedback,
  FeedbackStatus,
  InsertFeedbackInput,
  ListFeedbackOpts,
  Project,
  ProjectSecret,
} from "./types";

export interface BeaconDal {
  init(): Promise<void>;
  close(): Promise<void>;

  createProject(input: CreateProjectInput): Promise<Project>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  getProjectByPublicKey(publicKey: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;

  createSecret(input: CreateSecretInput): Promise<ProjectSecret>;
  listSecretsForProject(projectId: string): Promise<ProjectSecret[]>;
  revokeSecret(secretId: string): Promise<void>;
  findActiveSecretByHash(projectId: string, secretHash: string): Promise<ProjectSecret | null>;

  insertFeedback(input: InsertFeedbackInput): Promise<Feedback>;
  listFeedback(opts: ListFeedbackOpts): Promise<Feedback[]>;
  getFeedback(id: string): Promise<Feedback | null>;
  markFeedbackStatus(id: string, status: Exclude<FeedbackStatus, "new">): Promise<Feedback | null>;
}
