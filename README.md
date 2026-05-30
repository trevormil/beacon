<p align="center">
  <img src="./logo.png" alt="Beacon" width="160" />
</p>

<h1 align="center">Beacon</h1>

<p align="center">
  <strong>The feedback widget that opens its own pull requests.</strong>
</p>

<p align="center">
  An embeddable bottom-right chat bubble for any web app &mdash; that pipes every submission into your repo as a backlog ticket and (optionally) a draft MR.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-1a1a1a?style=flat-square" /></a>
  <img alt="Built with Bun" src="https://img.shields.io/badge/built%20with-bun-2b8fdb?style=flat-square" />
  <img alt="Postgres / MySQL / SQLite / Mongo" src="https://img.shields.io/badge/db-postgres%20%7C%20mysql%20%7C%20sqlite%20%7C%20mongo-2b8fdb?style=flat-square" />
  <img alt="Widget &lt; 10 KB" src="https://img.shields.io/badge/widget-7.8%20KB-2b8fdb?style=flat-square" />
</p>

---

## Why Beacon

Most feedback tools collect messages and stop there. Beacon collects messages and **finishes the loop**:

```
   end user types feedback
            │
            ▼
   ┌──────────────────┐         your engineering loop
   │   widget bubble  │      ┌──────────────────────────┐
   │  (any web app)   │      │  /ticket — file backlog  │
   └────────┬─────────┘      │  /pr-creation — draft MR │
            │  POST          │  /code-review — verify   │
            ▼                └──────────▲───────────────┘
   ┌──────────────────┐                 │
   │   Beacon API     │  ── poll ───────┘
   │   (your VPS)     │   bunx beacon process
   └────────┬─────────┘
            ▼
       SQLite / Postgres /
       MySQL / Mongo
```

The same `bunx beacon process` command works with **codex**, **claude**, **gemini-cli**, or any agent CLI &mdash; the runner is template-driven, not vendor-locked.

## Three pieces, one repo

| Package           | What it is                                                  | Size           |
| ----------------- | ----------------------------------------------------------- | -------------- |
| `@beacon/widget`  | Embeddable bottom-right bubble &mdash; vanilla TS, Shadow DOM | **7.8 KB** IIFE |
| `@beacon/server`  | Hono + Bun API with 3-tier auth (public / secret / admin)   | one file       |
| `@beacon/cli`     | `bunx beacon serve | poll | mark | process | admin`         | one binary     |

## Quickstart &mdash; embed

```html
<script
  src="https://cdn.jsdelivr.net/npm/@beacon/widget/dist/beacon.js"
  data-project="pub_your_public_key"
  data-endpoint="https://beacon.example.com"
  defer
></script>
```

That's the entire integration. A bubble appears bottom-right; clicks open a slide-up panel; submissions POST to your Beacon API.

## Quickstart &mdash; self-host (SQLite, no Docker)

```bash
git clone https://github.com/trevormil/beacon
cd beacon && bun install

export ADMIN_TOKEN=$(openssl rand -hex 32)
export DATABASE_URL=file:./data.db
bun --cwd packages/server run start
# beacon: listening on http://0.0.0.0:4747
```

Create your first project:

```bash
bun packages/cli/src/index.ts admin create-project \
  --slug my-app \
  --origins https://my.app,https://staging.my.app \
  --admin-token $ADMIN_TOKEN
```

Prints `pub_…` (for the widget) and `sec_…` (for the CLI poller &mdash; shown once).

## Quickstart &mdash; pipe feedback into your repo

```bash
bunx @beacon/cli process \
  --project my-app \
  --secret  sec_… \
  --repo    ~/code/my-app \
  --command 'codex exec -C {repo} "
    /ticket {feedback.message}
    /pr-creation
  "'
```

`{repo}` and `{feedback.*}` are substituted per item. Each item is marked processed on exit 0, retried next run on non-zero. Works with any agent CLI &mdash; swap `codex` for `claude` or `gemini` and re-run.

## Customization

### Per-embed overrides (script-tag attributes)

```html
<script
  src=".../beacon.js"
  data-project="pub_…"
  data-primary="#10b981"
  data-position="bottom-left"
  data-title="What can we fix?"
  data-placeholder="Tell us anything"
  defer
></script>
```

### Server-side defaults (set once at project creation)

```bash
bunx @beacon/cli admin create-project \
  --slug my-app \
  --origins https://my.app \
  --primary "#10b981" \
  --title "What can we fix?" \
  --position "bottom-left"
```

Stored in `project.meta.theme`; the widget fetches them on init.

### Theme precedence (low → high)

```
1. Beacon defaults   ← (#2b8fdb, bottom-right, "Send feedback")
2. Server-side theme ← (project.meta.theme, set at create time)
3. Per-embed attrs   ← (data-* on the script tag)
```

### CSS-variable escape hatch

```css
#beacon-root {
  --beacon-radius: 4px;
  --beacon-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

## Database support

Pick one &mdash; Beacon detects the dialect from `DATABASE_URL`:

| Dialect    | URL scheme                       | Driver                     | Best for          |
| ---------- | -------------------------------- | -------------------------- | ----------------- |
| **SQLite** | `file:./data.db` / `:memory:`    | `bun:sqlite` (built-in)    | Solo + dev        |
| **Postgres** | `postgres://…` / `postgresql://…` | `postgres-js`            | Production        |
| **MySQL**  | `mysql://…`                      | `mysql2/promise`           | Existing MySQL    |
| **MongoDB** | `mongodb://…` / `mongodb+srv://…` | `mongodb` native driver  | Existing Mongo    |

All four implement the same `BeaconDal` interface &mdash; swap by changing one env var.

## Deploy paths

| Path                   | Cost    | Setup   | Where docs    |
| ---------------------- | ------- | ------- | ------------- |
| **SQLite single-bin**  | $0      | 30 sec  | [docs/self-host.md](docs/self-host.md) |
| **Docker Compose**     | $4&ndash;7/mo | 2 min | [docs/self-host.md](docs/self-host.md) |
| **Kubernetes**         | varies  | 10 min  | [docs/deploy-k8s.md](docs/deploy-k8s.md) |
| **Managed (Fly/Railway/Render)** | $5&ndash;10/mo | 5 min | [docs/self-host.md](docs/self-host.md) |

## TerMinal integration

[TerMinal](https://github.com/trevormil/TerMinal) ships Beacon as a **core agent by default**. Click *Process Beacon feedback* in the Agents tab and it drains your queue into backlog tickets &mdash; `/factory` picks them up to draft MRs. Default 15-min schedule + cockpit widget for live unprocessed-count. See [docs/terminal-integration.md](docs/terminal-integration.md).

## Architecture

```
packages/
  shared/        BeaconDal interface + 4 driver adapters + key/hash utils
  server/        Hono app, 3-tier auth, zod validation, rate-limit
  cli/           commander CLI: serve / poll / mark / process / admin
  widget/        Shadow-DOM bubble, IIFE bundle, theme system

docs/
  self-host.md           SQLite single-binary, docker-compose, prod paths
  embed.md               Customization, theme precedence, what gets captured
  process.md             Process command patterns + scheduling
  deploy-k8s.md          Kubernetes manifests + runbook
  terminal-integration.md  TerMinal core-agent setup

k8s/                     Production manifests (Deployment / Service / Ingress / PVC)
docker/                  Dockerfile + per-dialect docker-compose profiles
```

## API surface

| Endpoint                                          | Auth          | Purpose                              |
| ------------------------------------------------- | ------------- | ------------------------------------ |
| `GET /healthz`                                    | none          | Healthcheck                          |
| `GET /v1/projects/:publicKey/config`              | none          | Widget bootstrap (theme, origins)    |
| `POST /v1/feedback`                               | public key + origin allowlist + rate limit | Widget submission       |
| `GET /v1/projects/:projectId/feedback`            | `Bearer sec_…` | CLI poll                             |
| `POST /v1/projects/:projectId/feedback/:id/(processed\|skipped)` | `Bearer sec_…` | CLI mark      |
| `POST /v1/admin/projects`                         | `Bearer $ADMIN_TOKEN` | Create project (returns pub+sec) |
| `GET /v1/admin/projects`                          | `Bearer $ADMIN_TOKEN` | List projects                  |
| `POST /v1/admin/projects/:slug/secrets`           | `Bearer $ADMIN_TOKEN` | Rotate secret                  |

## What gets captured

- Free-text **message** (required, 1&ndash;10 000 chars)
- Optional **email** for follow-up
- Auto: `url`, `userAgent`, `viewport` (`WxH`)

No screenshots. No cookies. No session replay. No fingerprinting. No third-party network calls. One outbound request, on submit.

## Comparison

|                              | Beacon                | Crisp / Intercom    | Hosted-only formers |
| ---------------------------- | --------------------- | ------------------- | ------------------- |
| Open source                  | Yes (MIT)             | No                  | No                  |
| Self-hostable                | Yes                   | No                  | No                  |
| Pipes feedback to **tickets + MRs** | Yes (`bunx beacon process`) | No (chat only) | No        |
| Bring-your-own agent (codex/claude/...) | Yes      | No                  | No                  |
| Bring-your-own DB            | 4 dialects            | No                  | No                  |
| Cost (small projects)        | $0&ndash;7/mo         | $25&ndash;100/mo    | $20+/mo             |
| Widget size                  | 7.8 KB                | 150+ KB             | varies              |
| Vendor lock                  | None                  | Full                | Full                |

## Status

29 tests passing across DAL / server / CLI. Production-deployed on Kubernetes at the maintainer's hosted instance. Single-replica SQLite is the only DB combination heavily exercised in production today; Postgres + MySQL + Mongo adapters share the same `BeaconDal` contract and pass the same unit tests.

## Roadmap

- [ ] Dashboard UI (project + secret management)
- [ ] Webhook delivery (push instead of poll)
- [ ] Cloudflare Turnstile integration (slot already wired)
- [ ] Image upload / screenshot attachment
- [ ] Email notifications on new feedback (as a stock `--command` recipe)
- [ ] Redis-backed rate limiter (multi-replica deploys)
- [ ] `update-project` / `revoke-secret` admin commands
- [ ] Official npm publish of `@beacon/widget` + `@beacon/cli`

## Contributing

PRs welcome. Two ground rules:

1. Stay inside the portable SQL subset for adapter changes (no `jsonb`, no native arrays, no `gen_random_uuid()`) so SQLite / MySQL / Postgres parity holds.
2. Add or update a test alongside any behavior change. The test suite is the contract; if a change is hard to test, the change is probably wrong.

```bash
bun install
bun test                                  # 29 tests
bun --cwd packages/widget run build       # produces dist/beacon.js
bun --cwd packages/widget run dev         # serves demo.html at :4848
```

## License

[MIT](LICENSE) &mdash; do whatever you want, no warranty.

---

<p align="center">
  <sub>Built by <a href="https://github.com/trevormil">Trevor Miller</a>. Logo &mdash; a radio tower &mdash; because feedback is a signal you broadcast.</sub>
</p>
