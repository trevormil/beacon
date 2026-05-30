import type { Feedback } from "@trevormil/beacon-shared";

export type TemplateContext = {
  repo: string;
  feedback: Feedback;
};

export function renderTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, expr: string) => {
    const path = expr.trim().split(".");
    let cur: unknown = ctx;
    for (const seg of path) {
      if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        return "";
      }
    }
    if (cur === null || cur === undefined) return "";
    if (typeof cur === "string") return cur;
    return JSON.stringify(cur);
  });
}
