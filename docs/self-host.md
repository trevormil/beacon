# Self-hosting Beacon

Three paths, all OSS, from quickest to most production-ready.

## 1. Single binary (SQLite, no Docker)

The fastest way to try Beacon — one process, one file.

```bash
git clone https://github.com/trevormil/beacon
cd beacon && bun install

# Generate an admin token and start the server
export ADMIN_TOKEN=$(openssl rand -hex 32)
export DATABASE_URL=file:./data.db
bun --cwd packages/server run start
# → beacon: listening on http://0.0.0.0:4747
```

That's it. The server runs on `:4747`, persists to `./data.db`, and accepts widget submissions immediately. Stop it with Ctrl-C.

Create your first project in another shell:

```bash
bun packages/cli/src/index.ts admin create-project \
  --slug my-app \
  --origins https://my.app,https://staging.my.app \
  --admin-token $ADMIN_TOKEN
```

The output prints your **public key** (for the widget) and **secret key** (for the CLI poller — shown once, store it now).

## 2. Docker Compose — pick a DB profile

Self-host with the database of your choice. Each profile is a single compose file under `docker/`.

```bash
cd docker
cp .env.example .env
# Edit .env: at minimum set ADMIN_TOKEN to a strong secret.
```

Pick one:

```bash
# Postgres (recommended for production)
docker compose -f docker-compose.postgres.yml up -d

# MySQL
docker compose -f docker-compose.mysql.yml up -d

# Mongo
docker compose -f docker-compose.mongo.yml up -d

# SQLite (single container, file-backed)
docker compose -f docker-compose.sqlite.yml up -d
```

Then create your first project as in path 1, but with `--endpoint http://localhost:4747`.

### Switching DB later

Run `bunx @trevormil/beacon admin list-projects` against your existing instance to grab the project list, then re-create them against the new instance. Feedback rows don't migrate automatically — this is the simplest path for tools at the "feedback widget" scale (thousands per project, not millions).

## 3. Production deployment (your VPS + managed Postgres)

The Docker Compose path works on any droplet/VM. For lower-touch operation:

- **Database**: point `DATABASE_URL` at a managed Postgres (Neon, Supabase, RDS, Cloud SQL). Free tier covers most use cases.
- **Host**: run the `beacon` image on Fly.io, Railway, Render, or a $5–$7 droplet. The image is ~80 MB.
- **TLS**: terminate at a reverse proxy (Caddy or nginx). Beacon doesn't speak TLS directly.
- **DNS**: point a subdomain like `beacon.yourdomain.com` at the host; widget embedders use that as `data-endpoint`.

Example Caddy config:

```
beacon.yourdomain.com {
  reverse_proxy localhost:4747
}
```

## Operational notes

- **Backups**: Postgres / MySQL / Mongo handle this themselves. For SQLite, snapshot `data.db` periodically (`sqlite3 data.db ".backup '/path/backup.db'"`).
- **Rate limiting** is in-process (per-IP, per-project, sliding window). Tune via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` env vars. For multi-instance deploys you'll want a Redis-backed limiter — not built yet; open an issue.
- **Origin allowlist** is per-project; set via `--origins` at create time. To update later, recreate the project (no `update-project` command yet).
- **Secret rotation**: revoke a secret with `bunx @trevormil/beacon admin revoke-secret <id>` (planned, not shipped — current path is to recreate the project).
- **CORS** is permissive by design — origin checks happen in app logic against the per-project allowlist, not at the CORS layer.

## What's NOT included

- A dashboard UI for managing projects. Use the admin CLI.
- User accounts / multi-user auth. ADMIN_TOKEN is one-token-fits-all.
- Email notifications on new feedback. Build it as a process step: `bunx @trevormil/beacon process --command "send-email {feedback.message}"`.
- Image upload / screenshots. Open an issue if you want this.

All of the above are good follow-up tickets; PRs welcome.
