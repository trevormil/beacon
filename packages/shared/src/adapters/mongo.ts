import { MongoClient, type Collection, type Db } from "mongodb";
import type { BeaconDal } from "../dal";
import { randomId } from "../keys";
import type {
  CreateProjectInput,
  CreateSecretInput,
  Feedback,
  FeedbackStatus,
  InsertFeedbackInput,
  ListFeedbackOpts,
  Project,
  ProjectSecret,
} from "../types";

type ProjectDoc = {
  _id: string;
  slug: string;
  publicKey: string;
  allowedOrigins: string[];
  targetRepo: string | null;
  targetForge: string | null;
  meta: Record<string, unknown>;
  createdAt: number;
};

type SecretDoc = {
  _id: string;
  projectId: string;
  secretHash: string;
  label: string;
  createdAt: number;
  revokedAt: number | null;
};

type FeedbackDoc = {
  _id: string;
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

export class MongoDal implements BeaconDal {
  private client: MongoClient;
  private db!: Db;
  private projects!: Collection<ProjectDoc>;
  private secrets!: Collection<SecretDoc>;
  private feedback!: Collection<FeedbackDoc>;

  constructor(url: string) {
    this.client = new MongoClient(url);
  }

  async init(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db();
    this.projects = this.db.collection<ProjectDoc>("beacon_projects");
    this.secrets = this.db.collection<SecretDoc>("beacon_project_secrets");
    this.feedback = this.db.collection<FeedbackDoc>("beacon_feedback");
    await Promise.all([
      this.projects.createIndex({ slug: 1 }, { unique: true }),
      this.projects.createIndex({ publicKey: 1 }, { unique: true }),
      this.secrets.createIndex({ projectId: 1, secretHash: 1 }),
      this.feedback.createIndex({ projectId: 1, status: 1, createdAt: 1 }),
    ]);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const doc: ProjectDoc = {
      _id: randomId(),
      slug: input.slug,
      publicKey: input.publicKey,
      allowedOrigins: input.allowedOrigins,
      targetRepo: input.targetRepo ?? null,
      targetForge: input.targetForge ?? null,
      meta: input.meta ?? {},
      createdAt: Date.now(),
    };
    await this.projects.insertOne(doc);
    return this.docToProject(doc);
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const doc = await this.projects.findOne({ slug });
    return doc ? this.docToProject(doc) : null;
  }

  async getProjectByPublicKey(publicKey: string): Promise<Project | null> {
    const doc = await this.projects.findOne({ publicKey });
    return doc ? this.docToProject(doc) : null;
  }

  async listProjects(): Promise<Project[]> {
    const docs = await this.projects.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map((d) => this.docToProject(d));
  }

  async createSecret(input: CreateSecretInput): Promise<ProjectSecret> {
    const doc: SecretDoc = {
      _id: randomId(),
      projectId: input.projectId,
      secretHash: input.secretHash,
      label: input.label,
      createdAt: Date.now(),
      revokedAt: null,
    };
    await this.secrets.insertOne(doc);
    return this.docToSecret(doc);
  }

  async listSecretsForProject(projectId: string): Promise<ProjectSecret[]> {
    const docs = await this.secrets.find({ projectId }).sort({ createdAt: -1 }).toArray();
    return docs.map((d) => this.docToSecret(d));
  }

  async revokeSecret(secretId: string): Promise<void> {
    await this.secrets.updateOne({ _id: secretId }, { $set: { revokedAt: Date.now() } });
  }

  async findActiveSecretByHash(
    projectId: string,
    secretHash: string,
  ): Promise<ProjectSecret | null> {
    const doc = await this.secrets.findOne({ projectId, secretHash, revokedAt: null });
    return doc ? this.docToSecret(doc) : null;
  }

  async insertFeedback(input: InsertFeedbackInput): Promise<Feedback> {
    const doc: FeedbackDoc = {
      _id: randomId(),
      projectId: input.projectId,
      message: input.message,
      email: input.email ?? null,
      url: input.url ?? null,
      userAgent: input.userAgent ?? null,
      viewport: input.viewport ?? null,
      status: "new",
      createdAt: Date.now(),
      processedAt: null,
    };
    await this.feedback.insertOne(doc);
    return this.docToFeedback(doc);
  }

  async listFeedback(opts: ListFeedbackOpts): Promise<Feedback[]> {
    const query: Record<string, unknown> = { projectId: opts.projectId };
    if (opts.status) query.status = opts.status;
    if (opts.sinceMs !== undefined) query.createdAt = { $gte: opts.sinceMs };
    const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000));
    const docs = await this.feedback
      .find(query)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => this.docToFeedback(d));
  }

  async getFeedback(id: string): Promise<Feedback | null> {
    const doc = await this.feedback.findOne({ _id: id });
    return doc ? this.docToFeedback(doc) : null;
  }

  async markFeedbackStatus(
    id: string,
    status: Exclude<FeedbackStatus, "new">,
  ): Promise<Feedback | null> {
    await this.feedback.updateOne(
      { _id: id },
      { $set: { status, processedAt: Date.now() } },
    );
    return this.getFeedback(id);
  }

  private docToProject(d: ProjectDoc): Project {
    return {
      id: d._id,
      slug: d.slug,
      publicKey: d.publicKey,
      allowedOrigins: d.allowedOrigins,
      targetRepo: d.targetRepo,
      targetForge: d.targetForge,
      meta: d.meta,
      createdAt: d.createdAt,
    };
  }

  private docToSecret(d: SecretDoc): ProjectSecret {
    return {
      id: d._id,
      projectId: d.projectId,
      secretHash: d.secretHash,
      label: d.label,
      createdAt: d.createdAt,
      revokedAt: d.revokedAt,
    };
  }

  private docToFeedback(d: FeedbackDoc): Feedback {
    return {
      id: d._id,
      projectId: d.projectId,
      message: d.message,
      email: d.email,
      url: d.url,
      userAgent: d.userAgent,
      viewport: d.viewport,
      status: d.status,
      createdAt: d.createdAt,
      processedAt: d.processedAt,
    };
  }
}
