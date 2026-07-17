import { execFile } from "node:child_process";

/**
 * The slice of the Anthropic Messages request the shim actually uses. `content`
 * is a plain string (the proxy's ApiLlmProvider only ever sends string content).
 */
export interface MessagesRequest {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
}

/** Injectable command runner so tests never spawn a real process. */
export type RunCommand = (
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Env vars that would divert `claude -p` from the logged-in subscription to
 * API-key billing. Stripped from the child env — subscription auth is the whole
 * reason this shim exists, so an inherited key must never silently override it.
 */
const AUTH_OVERRIDE_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

/** Flatten Messages `messages[]` into the single prompt string `claude -p` takes. */
export function messagesToPrompt(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages.map((m) => m.content).join("\n\n");
}

/**
 * Build argv for a FRESH headless Claude Code session:
 *  - `-p <prompt>`            one-shot, stateless (no --continue/--resume)
 *  - `--output-format json`   machine-parseable envelope (.result holds the text)
 *  - `--model <id>`           per-call model (pass "opus" on the Pi for Opus prose)
 *  - `--system-prompt <sys>`  REPLACES Claude Code's coding-agent prompt so the
 *                             model behaves as the prose engine, not a CLI agent
 */
export function buildClaudeArgs(req: MessagesRequest): string[] {
  const prompt = messagesToPrompt(req.messages);
  const args = ["-p", prompt, "--output-format", "json", "--model", req.model];
  if (req.system) args.push("--system-prompt", req.system);
  return args;
}

/** Extract the assistant's final text (`.result`) from a `--output-format json` envelope. */
export function parseEnvelope(stdout: string): string {
  const envelope: unknown = JSON.parse(stdout);
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    typeof (envelope as { result?: unknown }).result !== "string"
  ) {
    throw new Error("claude JSON envelope missing a string `result` field");
  }
  return (envelope as { result: string }).result;
}

/** Default runner: exec the real `claude` binary and collect its output. */
const defaultRun: RunCommand = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { env: options.env, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });

/**
 * Run one fresh headless Claude Code call and return the assistant text.
 * `run` and `baseEnv` are injectable for hermetic tests.
 */
export async function runClaude(
  req: MessagesRequest,
  run: RunCommand = defaultRun,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of AUTH_OVERRIDE_VARS) delete env[key];

  const { code, stdout, stderr } = await run("claude", buildClaudeArgs(req), {
    env,
  });
  if (code !== 0) {
    throw new Error(`claude exited ${code}: ${stderr.trim() || "(no stderr)"}`);
  }
  return parseEnvelope(stdout);
}
