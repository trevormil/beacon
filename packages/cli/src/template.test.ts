import { describe, expect, test } from "bun:test";
import type { Feedback } from "@trevormil/beacon-shared";
import { renderTemplate } from "./template";

const sample: Feedback = {
  id: "fb_123",
  projectId: "proj_1",
  message: "the export button is broken on mobile",
  email: "user@example.com",
  url: "https://app.example.com/dash",
  userAgent: "Mozilla/5.0",
  viewport: "1280x800",
  status: "new",
  createdAt: 1700000000000,
  processedAt: null,
};

describe("renderTemplate", () => {
  test("substitutes {repo}", () => {
    expect(renderTemplate("cd {repo}", { repo: "/home/u/app", feedback: sample })).toBe(
      "cd /home/u/app",
    );
  });
  test("substitutes nested feedback fields", () => {
    expect(
      renderTemplate("msg: {feedback.message} from {feedback.email}", {
        repo: "/x",
        feedback: sample,
      }),
    ).toBe("msg: the export button is broken on mobile from user@example.com");
  });
  test("missing path renders empty", () => {
    expect(
      renderTemplate("{feedback.nope.deep}", { repo: "/x", feedback: sample }),
    ).toBe("");
  });
  test("non-string values are JSON-serialized", () => {
    expect(renderTemplate("ts={feedback.createdAt}", { repo: "/x", feedback: sample })).toBe(
      "ts=1700000000000",
    );
  });
});
