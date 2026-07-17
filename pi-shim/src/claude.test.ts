import { describe, it, expect, vi } from "vitest";
import {
  messagesToPrompt,
  buildClaudeArgs,
  parseEnvelope,
  runClaude,
  type MessagesRequest,
  type RunCommand,
} from "./claude.js";

const req: MessagesRequest = {
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  system: "You are the prose engine. Respond with ONLY JSON.",
  messages: [{ role: "user", content: "Write a quest for courage." }],
};

describe("messagesToPrompt", () => {
  it("joins message contents into one prompt string", () => {
    const prompt = messagesToPrompt([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
    ]);
    expect(prompt).toContain("first");
    expect(prompt).toContain("second");
  });
});

describe("buildClaudeArgs", () => {
  it("builds a fresh headless JSON call with model + system prompt", () => {
    const args = buildClaudeArgs(req);
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-haiku-4-5");
    // system REPLACES Claude Code's built-in coding-agent prompt
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toContain("prose engine");
    // never resume a prior session
    expect(args).not.toContain("--continue");
    expect(args).not.toContain("--resume");
    // the prompt goes over stdin, NOT as an argv element (avoids ARG_MAX)
    expect(args.some((a) => a.includes("Write a quest for courage."))).toBe(false);
  });

  it("omits --system-prompt when no system is given", () => {
    const args = buildClaudeArgs({ ...req, system: undefined });
    expect(args).not.toContain("--system-prompt");
  });
});

describe("parseEnvelope", () => {
  it("returns the .result text from a claude JSON envelope", () => {
    const envelope = JSON.stringify({
      result: '{"beats":[]}',
      session_id: "s1",
      total_cost_usd: 0,
    });
    expect(parseEnvelope(envelope)).toBe('{"beats":[]}');
  });

  it("throws when the envelope is not JSON", () => {
    expect(() => parseEnvelope("not json")).toThrow();
  });

  it("throws when .result is missing", () => {
    expect(() => parseEnvelope(JSON.stringify({ session_id: "s1" }))).toThrow();
  });
});

describe("runClaude", () => {
  it("returns the assistant text on a clean exit", async () => {
    const run: RunCommand = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({ result: "hello world" }),
      stderr: "",
    }));
    const text = await runClaude(req, run);
    expect(text).toBe("hello world");
  });

  it("sends the prompt over stdin (options.input), not as an argument", async () => {
    let seenInput: string | undefined;
    const run: RunCommand = vi.fn(async (_cmd, _args, opts) => {
      seenInput = opts.input;
      return { code: 0, stdout: JSON.stringify({ result: "ok" }), stderr: "" };
    });
    await runClaude(req, run);
    expect(seenInput).toContain("Write a quest for courage.");
  });

  it("rejects when the child exceeds the timeout", async () => {
    // A runner that never resolves — the timeout must be what settles the call.
    const run: RunCommand = () => new Promise(() => {});
    await expect(runClaude(req, run, process.env, 10)).rejects.toThrow(/timed out/i);
  });

  it("propagates a spawn error (e.g. ENOENT) message", async () => {
    const run: RunCommand = async () => {
      throw new Error("spawn claude ENOENT");
    };
    await expect(runClaude(req, run)).rejects.toThrow(/ENOENT/);
  });

  it("strips ANTHROPIC_API_KEY from the child env so subscription auth is forced", async () => {
    const seen: NodeJS.ProcessEnv[] = [];
    const run: RunCommand = vi.fn(async (_cmd, _args, opts) => {
      seen.push(opts.env);
      return { code: 0, stdout: JSON.stringify({ result: "ok" }), stderr: "" };
    });
    await runClaude(req, run, { ANTHROPIC_API_KEY: "sk-should-be-removed", PATH: "/usr/bin" });
    expect(seen[0].ANTHROPIC_API_KEY).toBeUndefined();
    expect(seen[0].PATH).toBe("/usr/bin"); // other env preserved
  });

  it("throws on a non-zero exit, surfacing stderr", async () => {
    const run: RunCommand = vi.fn(async () => ({
      code: 1,
      stdout: "",
      stderr: "claude: not logged in",
    }));
    await expect(runClaude(req, run)).rejects.toThrow(/not logged in/);
  });
});
