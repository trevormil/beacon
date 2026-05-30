# Onboard this repo to Beacon

You are an agent running in the **target repository** (the one that needs a feedback widget). Your job: wire that repo to a running Beacon instance end-to-end &mdash; register the project, embed the widget in the right place, persist the secret locally, and (optionally) open a draft MR.

Be surgical, idempotent, and verify each step. If you cannot complete a step safely, file a backlog ticket and stop.

---

## Inputs

Resolve these from the environment, in order:

| Name              | Env var / source                          | Fallback                                        |
| ----------------- | ----------------------------------------- | ----------------------------------------------- |
| `BEACON_ENDPOINT` | env, then `~/.config/beacon/config.json:endpoint` | `https://beacon.trevormil.com`             |
| `BEACON_ADMIN_TOKEN` | env, then `~/.secrets/beacon-admin-token`, then `~/.config/beacon/admin-token`, then `~/CompSci/gauntlet/autopilot-harness/.secrets/beacon-admin-token` (all chmod 600) | **fail with a clear message** if none of them exist |
| `REPO_ROOT`       | `git rev-parse --show-toplevel`           | current working directory                       |
| `REPO_SLUG`       | derived from git remote `origin/<host>/<owner>/<name>` | basename of `REPO_ROOT`            |
| `DEPLOY_ORIGINS`  | comma-separated, from `--origins` arg     | inferred (see step 2)                           |
| `BRAND_PRIMARY`   | from `--primary` arg                      | `#2b8fdb` (Beacon default)                      |

Never echo `BEACON_ADMIN_TOKEN` to stdout, logs, or commit messages.

---

## Step 0 &mdash; verify the Beacon endpoint is live

Treat the endpoint as a service contract. Don't skip. **`curl` is the source of truth.** Do not pre-check with `host` / `dig` / `nslookup` &mdash; stale negative caches (especially on macOS's mDNSResponder) make those tools return NXDOMAIN long after DNS has propagated globally. A successful TLS handshake from `curl` proves DNS resolved AND the cert is valid; nothing else needs to pass.

```bash
ENDPOINT="${BEACON_ENDPOINT:-https://beacon.trevormil.com}"

# Healthcheck. Retry for up to 30 minutes (10s interval) to absorb DNS
# propagation, cert issuance, or pod-restart windows.
attempts=0
until curl -sf -m 5 "$ENDPOINT/healthz" >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -gt 180 ]; then
    echo "beacon: endpoint unreachable after 30min: $ENDPOINT" >&2
    echo "beacon: file a backlog ticket and stop" >&2
    exit 2
  fi
  echo "beacon: waiting on $ENDPOINT (attempt $attempts/180)" >&2
  sleep 10
done
echo "beacon: endpoint live at $ENDPOINT"
```

If `curl` reports `SSL_ERROR` / cert errors, the cert is still issuing &mdash; keep polling. **Don't** fall back to `-k` (insecure). If 30 minutes pass with cert errors, the cert is probably stuck; file a ticket and stop.

### Diagnosing apparent DNS failure

If the agent's curl loop fails AND the operator suspects DNS, run the **authoritative-resolver bypass** to disambiguate:

```bash
# Query DigitalOcean / Cloudflare / Google directly — bypasses any local cache.
dig +short @1.1.1.1 "${ENDPOINT#https://}"
dig +short @8.8.8.8 "${ENDPOINT#https://}"

# Or use curl's own resolver override to hit the ingress directly:
INGRESS_IP=$(dig +short @1.1.1.1 "${ENDPOINT#https://}" | head -1)
curl -sf --resolve "${ENDPOINT#https://}:443:$INGRESS_IP" "$ENDPOINT/healthz"
```

If those work and the naked `curl` doesn't, the operator's local resolver is stale. On macOS the fix is `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder`. Until that runs, the agent should keep using the `--resolve` override.

---

## Step 1 &mdash; detect the framework and find the embed target

The widget is a single `<script>` tag that must load on every page the user can submit feedback from. Find the right host file:

| Stack hint (look for...)                            | Embed target file                                  |
| --------------------------------------------------- | -------------------------------------------------- |
| `next` in `package.json` + `app/` dir               | `app/layout.tsx` (root layout, inside `<body>`)    |
| `next` in `package.json` + `pages/` dir             | `pages/_document.tsx` (custom `Body`)              |
| `vite` + `react` + `index.html`                     | `index.html` (right before `</body>`)              |
| `astro` + `src/layouts/`                            | `src/layouts/Layout.astro` (inside `<body>`)       |
| `sveltekit` + `src/app.html`                        | `src/app.html` (right before `</body>`)            |
| Hono / Express + server-rendered HTML               | the shared `<head>` partial or layout template     |
| Plain HTML / static site                            | the main `index.html` (and any sibling pages)      |
| Electron with a renderer HTML                       | `index.html` of the renderer                       |

Verify the chosen file actually wraps every user-facing page. If the app has multiple entry points, embed on each.

If detection fails (uncommon framework, monorepo, server-rendered with no obvious template), file a backlog ticket describing the structure and ask the human where to embed; do not guess.

---

## Step 2 &mdash; derive the project slug and origins

**Slug** (lowercase kebab-case, 2&ndash;64 chars):

```bash
SLUG="${REPO_SLUG:-$(basename "$(git rev-parse --show-toplevel)")}"
SLUG="$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/^-*//;s/-*$//')"
```

**Origins**: every URL the widget will load from. Required &mdash; the server enforces an origin allowlist on `POST /v1/feedback`.

Try to infer from these signals (most reliable first):

1. Kubernetes Ingress YAML: `grep -rE "host: " k8s/ infra/` &rarr; extract the `host:` lines, prefix with `https://`.
2. `vercel.json` / `netlify.toml` / `wrangler.toml` &rarr; production URLs.
3. CI deploy step in `.github/workflows/` / `.gitlab-ci.yml` &rarr; environment URLs.
4. `README.md` &rarr; "live at https://&hellip;" pattern.
5. Repo CLAUDE.md / docs/architecture.md &rarr; explicit URL.

Always include the local dev URL (e.g. `http://localhost:5173`, `http://localhost:3000`, or whatever `package.json:scripts.dev` exposes).

If you cannot infer ANY production origin, prompt the human with the dev origin pre-filled and stop until they confirm.

---

## Step 3 &mdash; register the project on Beacon

```bash
# Skip-create if a project with this slug already exists.
EXISTING=$(curl -sf -m 10 \
  -H "Authorization: Bearer $BEACON_ADMIN_TOKEN" \
  "$ENDPOINT/v1/admin/projects" \
  | jq -r --arg s "$SLUG" '.items[] | select(.slug == $s) | .publicKey' 2>/dev/null)

if [ -n "$EXISTING" ]; then
  PUBLIC_KEY="$EXISTING"
  echo "beacon: reusing existing project slug=$SLUG publicKey=$PUBLIC_KEY"
  # Rotate the secret rather than re-using a possibly-lost one.
  SECRET=$(curl -sf -m 10 -X POST \
    -H "Authorization: Bearer $BEACON_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"label":"onboard-rotation"}' \
    "$ENDPOINT/v1/admin/projects/$SLUG/secrets" \
    | jq -r '.secret')
else
  RESPONSE=$(curl -sf -m 10 -X POST \
    -H "Authorization: Bearer $BEACON_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg slug "$SLUG" \
      --arg repo "$(git config --get remote.origin.url | sed -E 's|.*[:/]([^:/]+/[^/.]+)(\.git)?$|\1|')" \
      --arg forge "$(git config --get remote.origin.url | grep -q gitlab && echo gitlab || echo github)" \
      --arg primary "${BRAND_PRIMARY:-#2b8fdb}" \
      --argjson origins "$(echo "$DEPLOY_ORIGINS" | jq -Rsc 'split(",") | map(select(length>0))')" \
      '{slug:$slug, allowedOrigins:$origins, targetRepo:$repo, targetForge:$forge, theme:{primary:$primary}}')" \
    "$ENDPOINT/v1/admin/projects")

  PUBLIC_KEY=$(echo "$RESPONSE" | jq -r '.publicKey')
  SECRET=$(echo "$RESPONSE" | jq -r '.secret')
  echo "beacon: created project slug=$SLUG publicKey=$PUBLIC_KEY"
fi

[ -z "$PUBLIC_KEY" ] || [ "$PUBLIC_KEY" = "null" ] && { echo "beacon: registration failed" >&2; exit 2; }
```

Verify the project is queryable:

```bash
curl -sf "$ENDPOINT/v1/projects/$PUBLIC_KEY/config" | jq -e '.slug' >/dev/null
```

---

## Step 4 &mdash; persist the secret (never commit it)

Pick ONE location based on whether the secret is per-user or per-repo:

**Option A &mdash; global default** (recommended for the maintainer's personal repos):

```bash
mkdir -p ~/.config/beacon
# Merge into the existing config keyed by slug.
python3 - <<PY
import json, os, pathlib
p = pathlib.Path.home() / ".config" / "beacon" / "config.json"
cfg = json.loads(p.read_text()) if p.exists() else {}
cfg.setdefault("endpoint", "$ENDPOINT")
cfg.setdefault("projects", {})
cfg["projects"]["$SLUG"] = {"publicKey": "$PUBLIC_KEY", "secret": "$SECRET"}
p.write_text(json.dumps(cfg, indent=2))
PY
chmod 600 ~/.config/beacon/config.json
```

**Option B &mdash; per-repo** (when several people share access):

```bash
mkdir -p .beacon
cat > .beacon/config.json <<EOF
{
  "endpoint":  "$ENDPOINT",
  "project":   "$SLUG",
  "publicKey": "$PUBLIC_KEY"
}
EOF
# Secret goes ONLY into env / secret-manager; never into repo.
grep -q '^\.beacon/secret$' .gitignore 2>/dev/null || echo '.beacon/secret' >> .gitignore
grep -q '^\.beacon/config\.local\.json$' .gitignore 2>/dev/null || echo '.beacon/config.local.json' >> .gitignore
```

---

## Step 5 &mdash; embed the widget

Read the embed target chosen in step 1. Insert this block exactly once &mdash; verify with `grep` first to keep the operation idempotent:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@beacon/widget/dist/beacon.js"
  data-project="REPLACE_PUBLIC_KEY"
  data-endpoint="REPLACE_ENDPOINT"
  data-primary="REPLACE_PRIMARY"
  defer
></script>
```

Substitute:

- `REPLACE_PUBLIC_KEY` &rarr; `$PUBLIC_KEY`
- `REPLACE_ENDPOINT` &rarr; `$ENDPOINT`
- `REPLACE_PRIMARY` &rarr; `$BRAND_PRIMARY` (drop the attribute if using Beacon default)

**Framework-specific insertion notes:**

- **Next.js `app/layout.tsx`**: add as a `<Script>` from `next/script` with `strategy="afterInteractive"`. Keep it inside `<body>`, after children.
- **Vite + React (`index.html`)**: insert right before `</body>`.
- **Astro `Layout.astro`**: insert in the `<body>` slot, after `<slot />`.
- **Server-rendered (Hono/Express)**: insert in the shared head/footer partial.

Verification &mdash; restart the dev server and check the bubble renders:

```bash
# Pick the right dev command for the stack:
# next: bun run dev / npm run dev
# vite: bun run dev
# sveltekit: bun run dev
# Then open the dev URL, confirm the bubble appears bottom-right.
```

For a Playwright / Puppeteer setup, write a minimal assertion test:

```ts
await page.goto(devUrl);
await page.waitForSelector("#beacon-root", { timeout: 5000 });
```

---

## Step 6 &mdash; smoke-test the full path

```bash
# 1. Verify the public config endpoint returns the right slug
curl -sf "$ENDPOINT/v1/projects/$PUBLIC_KEY/config" | jq -e --arg s "$SLUG" '.slug == $s'

# 2. Submit a synthetic feedback as if from the widget
ORIGIN=$(echo "$DEPLOY_ORIGINS" | cut -d, -f1)
curl -sf -X POST "$ENDPOINT/v1/feedback" \
  -H "Content-Type: application/json" \
  -H "X-Beacon-Public-Key: $PUBLIC_KEY" \
  -H "Origin: $ORIGIN" \
  -d '{"message":"smoke-test from onboard-repo"}' \
  | jq -e '.status == "new"'

# 3. Poll it back via the secret
curl -sf "$ENDPOINT/v1/projects/$SLUG/feedback?status=new&limit=5" \
  -H "Authorization: Bearer $SECRET" \
  | jq -e '.items[] | select(.message == "smoke-test from onboard-repo")' >/dev/null

# 4. Mark the smoke-test item processed so it doesn't pollute the real queue
ID=$(curl -sf "$ENDPOINT/v1/projects/$SLUG/feedback?status=new&limit=5" \
  -H "Authorization: Bearer $SECRET" \
  | jq -r '.items[] | select(.message == "smoke-test from onboard-repo") | .id' | head -1)
[ -n "$ID" ] && curl -sf -X POST "$ENDPOINT/v1/projects/$SLUG/feedback/$ID/processed" \
  -H "Authorization: Bearer $SECRET"
```

If any step fails &rarr; revert the embed, file a backlog ticket with the failure mode, and stop.

---

## Step 7 &mdash; commit + open MR

Branch and commit the embed change + the per-repo `.beacon/config.json` (if you took Option B). The secret must **not** be in the diff.

```bash
git checkout -b chore/beacon-embed
git add <embed-target-file> .gitignore .beacon/config.json   # NEVER .beacon/secret
git -c user.email="$(git config user.email)" \
    -c user.name="$(git config user.name)" \
    commit -m "chore: embed Beacon feedback widget

Drops the bottom-right bubble on every user-facing page. Submissions
route to Beacon's $SLUG project; new items become backlog tickets via
\`bunx beacon process\` or the TerMinal beacon agent.

- publicKey: $PUBLIC_KEY (safe to commit; widget-facing)
- endpoint:  $ENDPOINT
"
git push -u origin chore/beacon-embed
```

Then open the MR with the forge CLI &mdash; respect the repo's convention:

- GitHub repo &rarr; `gh pr create --fill --base main`
- GitLab repo &rarr; `glab mr create --fill --target-branch main`

Include a one-paragraph description: what the widget does, where it lives, that the secret is out-of-repo, the smoke-test result.

---

## Step 8 &mdash; (optional) wire the feedback-to-ticket loop

The widget collects feedback; the loop turns it into tickets. Pick one trigger mechanism:

### TerMinal &mdash; already a core agent

If the maintainer uses TerMinal, the `beacon` core agent picks up the project automatically from `~/.config/beacon/config.json`. Add a 15-min schedule via TerMinal's schedules UI for hands-off operation.

### GitHub Actions &mdash; scheduled cron

```yaml
# .github/workflows/beacon-drain.yml
name: Beacon drain
on:
  schedule: [{ cron: "*/15 * * * *" }]
  workflow_dispatch: {}
jobs:
  drain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - env:
          BEACON_ENDPOINT: ${{ secrets.BEACON_ENDPOINT }}
          BEACON_SECRET:   ${{ secrets.BEACON_SECRET }}
        run: |
          bunx @beacon/cli process \
            --project "$(jq -r .slug .beacon/config.json)" \
            --repo    . \
            --command 'codex exec -C {repo} "/ticket {feedback.message}\n/pr-creation"'
```

Add `BEACON_ENDPOINT` and `BEACON_SECRET` as GitHub Actions repo secrets.

### Cron / launchd / systemd

Any scheduler that can run `bunx @beacon/cli process` periodically works the same way. The agent CLI is the universal entry point.

---

## What "done" looks like

- `curl https://beacon.example.com/healthz` &rarr; `{"ok":true}`
- `curl https://beacon.example.com/v1/projects/$PUBLIC_KEY/config` &rarr; `slug` matches the repo
- A synthetic smoke-test submission survives a round-trip through the queue
- The widget bubble renders on the deployed app (verify against staging first)
- The MR is open with the embed + sanitized config; secret is not in the diff
- The maintainer has at least one drain mechanism wired (TerMinal / Actions / cron)
- A line item lands in `CHANGELOG.md` or the equivalent so the change is visible

---

## Fail-safes

- **Never** print the admin token, project secret, or `.beacon/secret` to logs.
- **Never** commit secrets &mdash; gitignore patterns first, then write the file.
- **Never** mark feedback `processed` unless the downstream work actually completed.
- If you can't classify a feedback item into a ticket, mark it `skipped`, not `processed`.
- If a step is destructive (revoking the only secret, rewriting layouts, removing an existing widget integration), file a ticket first and let the human decide.
