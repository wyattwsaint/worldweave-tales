import { createApp } from "./server.js";

/**
 * Pi-side entrypoint. Binds to PORT (default 8788) so the proxy can set
 * LLM_BASE_URL=http://<pi-host>:8788 and route prose generation through a
 * subscription-authenticated Claude Code session instead of the paid API.
 */
const port = Number(process.env.PORT ?? 8788);

createApp().listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[pi-shim] Anthropic-shaped Claude Code gateway on :${port}`);
});
