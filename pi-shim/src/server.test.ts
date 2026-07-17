import { describe, it, expect, vi } from "vitest";
import { handleMessages, type Runner } from "./server.js";

const validBody = {
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  system: "prose engine",
  messages: [{ role: "user", content: "Write a quest." }],
};

describe("handleMessages", () => {
  it("returns a Messages-shaped 200 with the runner's text in a text block", async () => {
    const run: Runner = vi.fn(async () => '{"beats":[]}');
    const { status, body } = await handleMessages(validBody, run);
    expect(status).toBe(200);
    const b = body as { content: Array<{ type: string; text?: string }> };
    expect(b.content[0]).toEqual({ type: "text", text: '{"beats":[]}' });
  });

  it("passes the parsed request through to the runner", async () => {
    const run = vi.fn(async () => "ok") as Runner;
    await handleMessages(validBody, run);
    expect((run as ReturnType<typeof vi.fn>).mock.calls[0][0].model).toBe(
      "claude-haiku-4-5",
    );
  });

  it("returns 400 on an invalid request body (no messages)", async () => {
    const run: Runner = vi.fn(async () => "unused");
    const { status } = await handleMessages({ model: "m" }, run);
    expect(status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns 502 when the runner throws (e.g. claude failed)", async () => {
    const run: Runner = vi.fn(async () => {
      throw new Error("claude: not logged in");
    });
    const { status, body } = await handleMessages(validBody, run);
    expect(status).toBe(502);
    expect((body as { error?: unknown }).error).toBeDefined();
  });
});
