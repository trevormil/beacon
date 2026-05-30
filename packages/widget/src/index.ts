/* eslint-disable */
// Beacon widget — embeddable feedback bubble. Single-file IIFE.

type Theme = {
  primary?: string;
  primaryFg?: string;
  position?: "bottom-right" | "bottom-left";
  title?: string;
  placeholder?: string;
  successMessage?: string;
};

type Config = {
  endpoint: string;
  publicKey: string;
  theme: Required<Theme>;
};

const DEFAULTS: Required<Theme> = {
  primary: "#2b8fdb",
  primaryFg: "#ffffff",
  position: "bottom-right",
  title: "Send feedback",
  placeholder: "What's broken, missing, or could be better?",
  successMessage: "Thanks — we'll take a look.",
};

function findScriptTag(): HTMLScriptElement | null {
  // currentScript works in the loader's <script>, fall back to scanning.
  const cur = document.currentScript as HTMLScriptElement | null;
  if (cur && cur.dataset.project) return cur;
  const all = document.querySelectorAll<HTMLScriptElement>("script[data-project]");
  return all[all.length - 1] ?? null;
}

function attrsToTheme(el: HTMLScriptElement): Theme {
  const ds = el.dataset;
  const out: Theme = {};
  if (ds.primary) out.primary = ds.primary;
  if (ds.primaryFg) out.primaryFg = ds.primaryFg;
  if (ds.position === "bottom-right" || ds.position === "bottom-left") out.position = ds.position;
  if (ds.title) out.title = ds.title;
  if (ds.placeholder) out.placeholder = ds.placeholder;
  if (ds.success) out.successMessage = ds.success;
  return out;
}

async function fetchProjectConfig(endpoint: string, publicKey: string): Promise<Theme> {
  try {
    const res = await fetch(`${endpoint}/v1/projects/${publicKey}/config`, {
      method: "GET",
      credentials: "omit",
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { theme?: Theme };
    return body.theme ?? {};
  } catch {
    return {};
  }
}

function makeIcon(): string {
  // Stylized radio-tower / signal mark matching the brand logo.
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M5.5 8a8 8 0 0 1 13 0" opacity="0.55"/>
        <path d="M8 10.2a4.5 4.5 0 0 1 8 0" opacity="0.85"/>
        <circle cx="12" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
      </g>
      <g fill="currentColor">
        <path d="M11.3 9.5h1.4l1.1 11.5h-3.6z"/>
      </g>
    </svg>`;
}

function render(host: HTMLElement, cfg: Config): void {
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host, .root {
      --beacon-primary: ${cfg.theme.primary};
      --beacon-primary-fg: ${cfg.theme.primaryFg};
      --beacon-radius: 14px;
      --beacon-panel-bg: #ffffff;
      --beacon-panel-fg: #1a1a1a;
      --beacon-muted: #6b7280;
      --beacon-border: #e5e7eb;
      --beacon-shadow: 0 10px 32px rgba(15, 30, 70, 0.18);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .root {
      position: fixed;
      ${cfg.theme.position === "bottom-left" ? "left: 20px;" : "right: 20px;"}
      bottom: 20px;
      z-index: 2147483600;
      color: var(--beacon-panel-fg);
    }
    .bubble {
      width: 56px; height: 56px;
      border-radius: 999px;
      background: var(--beacon-primary);
      color: var(--beacon-primary-fg);
      border: none;
      cursor: pointer;
      box-shadow: var(--beacon-shadow);
      display: flex; align-items: center; justify-content: center;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .bubble:hover { transform: translateY(-1px); }
    .bubble:active { transform: translateY(0); }
    .panel {
      position: absolute;
      ${cfg.theme.position === "bottom-left" ? "left: 0;" : "right: 0;"}
      bottom: 72px;
      width: 340px;
      max-width: calc(100vw - 32px);
      background: var(--beacon-panel-bg);
      border-radius: var(--beacon-radius);
      box-shadow: var(--beacon-shadow);
      border: 1px solid var(--beacon-border);
      padding: 16px;
      display: none;
    }
    .panel.open { display: block; animation: pop 140ms ease; }
    @keyframes pop {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .title {
      font-size: 15px; font-weight: 600; margin: 0 0 10px;
    }
    textarea, input[type="email"] {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--beacon-border);
      border-radius: 8px;
      padding: 9px 10px;
      font: inherit;
      color: inherit;
      background: #fff;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    textarea {
      min-height: 96px;
      resize: vertical;
    }
    textarea:focus, input[type="email"]:focus {
      border-color: var(--beacon-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--beacon-primary) 22%, transparent);
    }
    .row { margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
    .hint { color: var(--beacon-muted); font-size: 12px; margin-right: auto; }
    button.send {
      background: var(--beacon-primary);
      color: var(--beacon-primary-fg);
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button.send[disabled] { opacity: 0.6; cursor: progress; }
    .success {
      padding: 28px 8px;
      text-align: center;
      color: var(--beacon-muted);
    }
    .success .check {
      display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 999px;
      background: color-mix(in srgb, var(--beacon-primary) 14%, transparent);
      color: var(--beacon-primary);
      margin-bottom: 10px;
    }
    .error {
      color: #b91c1c;
      font-size: 12px;
      margin: 6px 0 0;
    }
  `;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "root";
  root.innerHTML = `
    <div class="panel" role="dialog" aria-label="${escapeHtml(cfg.theme.title)}">
      <div class="form">
        <p class="title">${escapeHtml(cfg.theme.title)}</p>
        <textarea placeholder="${escapeHtml(cfg.theme.placeholder)}" maxlength="10000"></textarea>
        <div style="margin-top: 8px;">
          <input type="email" placeholder="your@email.com (optional)" maxlength="255"/>
        </div>
        <p class="error" hidden></p>
        <div class="row">
          <span class="hint">↩ Enter to send</span>
          <button class="send" type="button">Send</button>
        </div>
      </div>
      <div class="success" hidden>
        <div class="check">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12.5 4 4 10-10"/>
          </svg>
        </div>
        <p style="margin:0">${escapeHtml(cfg.theme.successMessage)}</p>
      </div>
    </div>
    <button class="bubble" aria-label="${escapeHtml(cfg.theme.title)}">${makeIcon()}</button>
  `;
  shadow.appendChild(root);

  const bubble = root.querySelector<HTMLButtonElement>(".bubble")!;
  const panel = root.querySelector<HTMLDivElement>(".panel")!;
  const form = panel.querySelector<HTMLDivElement>(".form")!;
  const success = panel.querySelector<HTMLDivElement>(".success")!;
  const textarea = panel.querySelector<HTMLTextAreaElement>("textarea")!;
  const email = panel.querySelector<HTMLInputElement>("input[type='email']")!;
  const sendBtn = panel.querySelector<HTMLButtonElement>("button.send")!;
  const errorEl = panel.querySelector<HTMLParagraphElement>(".error")!;

  function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }
  function open() {
    panel.classList.add("open");
    form.hidden = false;
    success.hidden = true;
    clearError();
    setTimeout(() => textarea.focus(), 30);
  }
  function close() {
    panel.classList.remove("open");
  }
  bubble.addEventListener("click", () => {
    if (panel.classList.contains("open")) close();
    else open();
  });

  async function send() {
    const message = textarea.value.trim();
    if (!message) {
      showError("Add a message before sending.");
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    clearError();
    try {
      const res = await fetch(`${cfg.endpoint}/v1/feedback`, {
        method: "POST",
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          "x-beacon-public-key": cfg.publicKey,
        },
        body: JSON.stringify({
          message,
          email: email.value.trim() || undefined,
          url: location.href,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showError(body.error ?? `Send failed (${res.status}).`);
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        return;
      }
      form.hidden = true;
      success.hidden = false;
      textarea.value = "";
      email.value = "";
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
      setTimeout(close, 2200);
    } catch (e) {
      showError("Network error.");
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
    }
  }

  sendBtn.addEventListener("click", () => void send());
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
    if (e.key === "Escape") close();
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function init(): Promise<void> {
  const script = findScriptTag();
  if (!script) {
    console.warn("[beacon] no <script data-project=...> found");
    return;
  }
  const publicKey = script.dataset.project!;
  const endpoint =
    script.dataset.endpoint ?? new URL(".", script.src).origin;

  const serverTheme = await fetchProjectConfig(endpoint, publicKey);
  const embedTheme = attrsToTheme(script);
  const theme: Required<Theme> = { ...DEFAULTS, ...serverTheme, ...embedTheme };

  const host = document.createElement("div");
  host.id = "beacon-root";
  host.style.all = "initial";
  document.body.appendChild(host);
  render(host, { endpoint, publicKey, theme });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
