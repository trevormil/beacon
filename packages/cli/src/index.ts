#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { AdminClient, BeaconClient } from "./client";
import { renderTemplate } from "./template";

const program = new Command();

program
  .name("beacon")
  .description("Beacon — embeddable feedback widget that pipelines into tickets + MRs")
  .version("0.1.0");

// ─── serve (pointer; server lives in a separate package) ──────────────────

program
  .command("serve")
  .description("Pointer to the server package — Beacon's API lives there")
  .action(() => {
    console.error("Beacon's API server is published as a separate package.");
    console.error("");
    console.error("  bunx @trevormil/beacon-server");
    console.error("");
    console.error("Or, to self-host with docker compose / kubernetes,");
    console.error("clone github.com/trevormil/beacon and follow docs/self-host.md.");
    process.exit(2);
  });

// ─── poll ──────────────────────────────────────────────────────────────────

program
  .command("poll")
  .description("Print unprocessed feedback as NDJSON")
  .requiredOption("-p, --project <slug>", "project slug or public key")
  .option("-s, --secret <secret>", "project secret key (default: $BEACON_SECRET)")
  .option("-e, --endpoint <url>", "Beacon API endpoint", process.env.BEACON_ENDPOINT ?? "http://localhost:4747")
  .option("--status <s>", "feedback status to fetch", "new")
  .option("--since <ms>", "epoch ms; only items at or after this time")
  .option("--limit <n>", "max items", "100")
  .action(async (opts: { project: string; secret?: string; endpoint: string; status: string; since?: string; limit: string }) => {
    const secret = opts.secret ?? process.env.BEACON_SECRET;
    if (!secret) fatal("set --secret or BEACON_SECRET");
    const client = new BeaconClient(opts.endpoint, secret!);
    const items = await client.listFeedback(opts.project, {
      status: opts.status,
      sinceMs: opts.since ? Number(opts.since) : undefined,
      limit: Number(opts.limit),
    });
    for (const item of items) process.stdout.write(`${JSON.stringify(item)}\n`);
  });

// ─── mark ──────────────────────────────────────────────────────────────────

program
  .command("mark <id>")
  .description("Mark a feedback item as processed (or skipped)")
  .requiredOption("-p, --project <slug>", "project slug or public key")
  .option("-s, --secret <secret>", "project secret (default: $BEACON_SECRET)")
  .option("-e, --endpoint <url>", "Beacon API endpoint", process.env.BEACON_ENDPOINT ?? "http://localhost:4747")
  .option("--skipped", "mark as skipped instead of processed")
  .action(async (id: string, opts: { project: string; secret?: string; endpoint: string; skipped?: boolean }) => {
    const secret = opts.secret ?? process.env.BEACON_SECRET;
    if (!secret) fatal("set --secret or BEACON_SECRET");
    const client = new BeaconClient(opts.endpoint, secret!);
    await client.markStatus(opts.project, id, opts.skipped ? "skipped" : "processed");
    console.log(`marked ${id} ${opts.skipped ? "skipped" : "processed"}`);
  });

// ─── process ───────────────────────────────────────────────────────────────

program
  .command("process")
  .description("Poll feedback and run an agent command per item, marking on success")
  .requiredOption("-p, --project <slug>", "project slug or public key")
  .requiredOption("-r, --repo <path>", "repo path (substituted as {repo})")
  .requiredOption("-c, --command <tpl>", "shell command template; supports {repo} and {feedback.*}")
  .option("-s, --secret <secret>", "project secret (default: $BEACON_SECRET)")
  .option("-e, --endpoint <url>", "Beacon API endpoint", process.env.BEACON_ENDPOINT ?? "http://localhost:4747")
  .option("--limit <n>", "max items this run", "20")
  .option("--dry-run", "show what would run; do not invoke the command or mark items")
  .action(
    async (opts: {
      project: string;
      repo: string;
      command: string;
      secret?: string;
      endpoint: string;
      limit: string;
      dryRun?: boolean;
    }) => {
      const secret = opts.secret ?? process.env.BEACON_SECRET;
      if (!secret) fatal("set --secret or BEACON_SECRET");
      const client = new BeaconClient(opts.endpoint, secret!);
      const items = await client.listFeedback(opts.project, {
        status: "new",
        limit: Number(opts.limit),
      });
      if (items.length === 0) {
        console.log("no new feedback");
        return;
      }
      console.log(`processing ${items.length} item(s)`);
      let ok = 0;
      let fail = 0;
      for (const item of items) {
        const cmd = renderTemplate(opts.command, { repo: opts.repo, feedback: item });
        console.log(`\n── ${item.id}  (${new Date(item.createdAt).toISOString()})`);
        console.log(`▶ ${truncate(cmd, 200)}`);
        if (opts.dryRun) {
          console.log("(dry run, skipping)");
          continue;
        }
        const result = spawnSync(cmd, { shell: true, stdio: "inherit" });
        if (result.status === 0) {
          await client.markStatus(opts.project, item.id, "processed");
          ok += 1;
        } else {
          console.error(`exit ${result.status}, leaving as new`);
          fail += 1;
        }
      }
      console.log(`\n── done.  ${ok} processed, ${fail} left for next run`);
      if (fail > 0) process.exitCode = 1;
    },
  );

// ─── admin ─────────────────────────────────────────────────────────────────

const admin = program.command("admin").description("Admin commands (require ADMIN_TOKEN)");

admin
  .command("create-project")
  .description("Create a new project; prints public key + secret (secret shown once)")
  .requiredOption("--slug <slug>", "project slug (lowercase kebab-case)")
  .requiredOption("--origins <list>", "comma-separated allowed origin URLs")
  .option("--repo <repo>", "target repo (e.g. trevormil/my-app)")
  .option("--forge <forge>", "target forge (github | gitlab)", "github")
  .option("--primary <color>", "theme primary color (#rrggbb)")
  .option("--title <text>", "widget title")
  .option("--position <pos>", "bottom-right or bottom-left")
  .option("-t, --admin-token <token>", "admin token (default: $BEACON_ADMIN_TOKEN)")
  .option("-e, --endpoint <url>", "Beacon API endpoint", process.env.BEACON_ENDPOINT ?? "http://localhost:4747")
  .action(
    async (opts: {
      slug: string;
      origins: string;
      repo?: string;
      forge: string;
      primary?: string;
      title?: string;
      position?: string;
      adminToken?: string;
      endpoint: string;
    }) => {
      const token = opts.adminToken ?? process.env.BEACON_ADMIN_TOKEN;
      if (!token) fatal("set --admin-token or BEACON_ADMIN_TOKEN");
      const client = new AdminClient(opts.endpoint, token!);
      const theme: Record<string, unknown> = {};
      if (opts.primary) theme.primary = opts.primary;
      if (opts.title) theme.title = opts.title;
      if (opts.position) theme.position = opts.position;
      const result = await client.createProject({
        slug: opts.slug,
        allowedOrigins: opts.origins.split(",").map((s) => s.trim()).filter(Boolean),
        targetRepo: opts.repo,
        targetForge: opts.forge as "github" | "gitlab",
        theme: Object.keys(theme).length ? theme : undefined,
      });
      console.log(`\nproject created: ${result.project.slug}`);
      console.log(`  public key:  ${result.publicKey}`);
      console.log(`  secret key:  ${result.secret}     ← shown once, store it now`);
      console.log("\nembed snippet:");
      console.log(
        `  <script src="https://cdn.jsdelivr.net/npm/@trevormil/beacon-widget/dist/beacon.js" data-project="${result.publicKey}" data-endpoint="${opts.endpoint}" defer></script>`,
      );
    },
  );

admin
  .command("list-projects")
  .description("List all projects on the server")
  .option("-t, --admin-token <token>", "admin token (default: $BEACON_ADMIN_TOKEN)")
  .option("-e, --endpoint <url>", "Beacon API endpoint", process.env.BEACON_ENDPOINT ?? "http://localhost:4747")
  .action(async (opts: { adminToken?: string; endpoint: string }) => {
    const token = opts.adminToken ?? process.env.BEACON_ADMIN_TOKEN;
    if (!token) fatal("set --admin-token or BEACON_ADMIN_TOKEN");
    const client = new AdminClient(opts.endpoint, token!);
    const { items } = await client.listProjects();
    if (items.length === 0) {
      console.log("(no projects yet — create one with `beacon admin create-project`)");
      return;
    }
    for (const p of items) console.log(`${p.slug.padEnd(28)}  ${p.publicKey}`);
  });

await program.parseAsync();

function fatal(msg: string): never {
  console.error(`beacon: ${msg}`);
  process.exit(2);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
