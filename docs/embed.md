# Embedding the Beacon widget

The widget is a ~8 KB IIFE bundle that drops a feedback bubble into any web app.

## The simplest case

```html
<script
  src="https://cdn.jsdelivr.net/npm/@beacon/widget/dist/beacon.js"
  data-project="pub_your_public_key"
  data-endpoint="https://beacon.example.com"
  defer
></script>
```

That's the whole integration. A bubble appears bottom-right; clicks open a slide-up panel; submissions POST to your Beacon API.

## Customization via `data-*` attributes

Per-embed overrides — set on the script tag:

| Attribute            | Default                                  | Example                                  |
| -------------------- | ---------------------------------------- | ---------------------------------------- |
| `data-primary`       | `#2b8fdb` (Beacon blue)                  | `data-primary="#10b981"`                 |
| `data-primary-fg`    | `#ffffff`                                | `data-primary-fg="#000000"`              |
| `data-position`      | `bottom-right`                           | `data-position="bottom-left"`            |
| `data-title`         | `Send feedback`                          | `data-title="What can we fix?"`          |
| `data-placeholder`   | `What's broken, missing, or could be better?` | `data-placeholder="Tell us anything"` |
| `data-success`       | `Thanks — we'll take a look.`            | `data-success="Got it!"`                 |

## CSS variable escape hatch

The widget mounts in a closed Shadow DOM — your page's CSS won't bleed in, and the widget's CSS won't bleed out. For deeper customization than colors, set CSS variables on the `#beacon-root` host element:

```css
#beacon-root {
  --beacon-radius: 4px;          /* sharper corners */
  --beacon-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

## Server-side defaults

If you want every embed to share the same brand styling without copy-pasting attributes, store the defaults server-side. They're set at project creation and apply to all embeds:

```bash
bunx @beacon/cli admin create-project \
  --slug my-app \
  --origins https://my.app \
  --primary "#10b981" \
  --title "What can we fix?" \
  --position "bottom-left"
```

The widget fetches `/v1/projects/:publicKey/config` on init and applies these as the base layer. **Per-embed `data-*` attributes still override** — so the embedder can break out of the default when they need to.

Precedence (lowest → highest):

1. Beacon defaults (Beacon blue, bottom-right)
2. Server-side `project.meta.theme`
3. `data-*` attributes on the script tag

## What gets captured

In addition to the typed message, every submission auto-captures:

- `url`: `location.href` at submit time
- `userAgent`: from the request header
- `viewport`: `"WxH"` (e.g. `"1280x800"`)

Plus the optional `email` field for follow-up.

**No screenshots** in v1. **No session replay**. **No fingerprinting**. The widget makes one outbound request, on submit. No analytics, no cookies, no third-party tracking.

## Multiple environments

Use one project per env (`my-app-prod`, `my-app-staging`) so feedback streams stay separate. The embedder picks the right `data-project` per environment via templating.

## Anti-abuse

- The widget's `pub_…` key is **public** by design. Abuse protection is layered: origin allowlist (server-side, per-project) + per-IP rate limit (sliding window).
- If you see floods from a single IP, the limit kicks in at 20 submissions per 60-second window by default (tune via env vars on the server).
- Future: Cloudflare Turnstile slot is reserved in the widget config but not yet wired. Open an issue if you need it.
