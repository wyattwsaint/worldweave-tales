import { spawn } from "node:child_process";

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
  options: { env: NodeJS.ProcessEnv; input?: string; signal?: AbortSignal },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Default per-call ceiling; a hung session must not pin a request open forever. */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Env vars that would divert `claude -p` from the logged-in subscription to
 * API-key billing. Stripped from the child env — subscription auth is the whole
 * reason this shim exists, so an inherited key must never silently override it.
 */
const AUTH_OVERRIDE_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

/** Flatten Messages `messages[]` into the single prompt string `claude -p` reads. */
export function messagesToPrompt(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages.map((m) => m.content).join("\n\n");
}

/**
 * Build argv for a FRESH headless Claude Code session. The prompt is NOT here —
 * it is piped over stdin so a large StoryBible can't blow the ARG_MAX limit.
 *  - `-p`                     one-shot, stateless (no --continue/--resume)
 *  - `--output-format json`   machine-parseable envelope (.result holds the text)
 *  - `--model <id>`           per-call model (pass "opus" on the Pi for Opus prose)
 *  - `--system-prompt <sys>`  REPLACES Claude Code's coding-agent prompt so the
 *                             model behaves as the prose engine, not a CLI agent
 */
export function buildClaudeArgs(req: MessagesRequest): string[] {
  const args = ["-p", "--output-format", "json", "--model", req.model];
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

/** Default runner: spawn the real `claude` binary, pipe the prompt in over stdin. */
const defaultRun: RunCommand = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      signal: options.signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    // Fires on spawn failure (ENOENT when claude isn't on PATH, abort, etc.);
    // reject with the real Error so its message/code survives to the caller.
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (options.input !== undefined) child.stdin.write(options.input);
    child.stdin.end();
  });

/**
 * Run one fresh headless Claude Code call and return the assistant text.
 * `run`, `baseEnv`, and `timeoutMs` are injectable for hermetic tests.
 */
export async function runClaude(
  req: MessagesRequest,
  run: RunCommand = defaultRun,
  baseEnv: NodeJS.ProcessEnv = process.env,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of AUTH_OVERRIDE_VARS) delete env[key];

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`claude timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  let result: { code: number; stdout: string; stderr: string };
  try {
    result = await Promise.race([
      run("claude", buildClaudeArgs(req), {
        env,
        input: messagesToPrompt(req.messages),
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (result.code !== 0) {
    throw new Error(`claude exited ${result.code}: ${result.stderr.trim() || "(no stderr)"}`);
  }
  return parseEnvelope(result.stdout);
}
