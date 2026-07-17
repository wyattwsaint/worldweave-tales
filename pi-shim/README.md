# @wwt/pi-shim

An **Anthropic Messages API–shaped gateway** that answers each `/v1/messages`
call by running a **fresh headless Claude Code session** on a Raspberry Pi that
is logged in with a **Claude Pro/Max subscription**. It lets the proxy point
`LLM_BASE_URL` at the Pi and generate prose on the subscription (including
Sonnet/Opus) instead of paying per-token on the API.

```
proxy (ApiLlmProvider, @anthropic-ai/sdk)
   │  POST /v1/messages   { model, system, messages }
   ▼
pi-shim  ──►  claude -p --output-format json
                 --model <model> --system-prompt <system>
                 (prompt piped over stdin; 120s timeout)
   │  { content: [{ type: "text", text: <.result> }] }
   ▼
proxy parses JSON beats / entities / bible as usual
```

## What it does (and doesn't)

- **Fresh session per request** — `claude -p` is stateless; no `--continue`/`--resume`.
- **`--system-prompt` replaces** Claude Code's coding-agent prompt so the model
  acts as the prose engine, not a CLI agent.
- **Subscription auth is forced** — `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
  are stripped from the child env so an inherited key can never silently divert
  the call to paid API billing.
- **`max_tokens` is advisory** — the CLI/subscription governs output length; the
  field is accepted for request-shape compatibility but not enforced here.

## Pi setup

Requires Node 22+ (the official Claude Code requirement; the target Pi runs
v22.22.3) and the Claude Code CLI installed and logged in:

```bash
npm i -g @anthropic-ai/claude-code   # or the current install method
claude login                          # authenticate the subscription (interactive, once)
claude -p "say hi" --output-format json   # smoke-test the CLI itself
```

### Headless auth (no browser on the Pi)

`claude login` is interactive. For an unattended Pi, use a long-lived token instead:

```bash
# On a machine already logged into the Pro/Max account (run once):
claude setup-token                   # prints a ~1-year OAuth token
```

Then set it in the shim's environment on the Pi:

```bash
export CLAUDE_CODE_OAUTH_TOKEN=<token-from-setup-token>
```

The shim intentionally strips `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the
child env but **passes `CLAUDE_CODE_OAUTH_TOKEN` through**, so this token is what
authenticates the subscription in headless mode.

Alternative: copy `~/.claude/.credentials.json` (mode `0600`) from an authed
machine to the Pi user the shim runs as.

### Target hardware

Verified to run on a **Raspberry Pi 4 Model B 8GB** (aarch64, Debian 13 trixie),
Node 22, with the `claude` CLI installed. 8GB is recommended; ≤4GB risks OOM.

Then, from the repo:

```bash
npm install
npm run build -w @wwt/pi-shim
PORT=8788 node pi-shim/dist/index.js       # or: npm run dev -w @wwt/pi-shim
```

Point the proxy at it:

```
# proxy/.env
LLM_BASE_URL=http://<pi-host>:8788
LLM_MODEL=opus        # or sonnet / claude-haiku-4-5
LLM_API_KEY=<any-non-empty-value>   # flips the proxy off the stub; the shim ignores it
```

> The shim performs **no auth of its own** — run it only on a trusted LAN, never
> exposed to the public internet.

## Verification status

The HTTP↔CLI **translation** (arg building, envelope parsing, env sanitizing,
error mapping) is covered by `npm test -w @wwt/pi-shim` (hermetic — the
`child_process` call is mocked). The **live** path (a real `claude -p` against a
subscription) can only be exercised on a logged-in Pi and is not covered by CI;
use the `claude -p` smoke-test above and the `/health` endpoint after deploy.
