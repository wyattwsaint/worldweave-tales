import express, { type Express } from "express";
import { z } from "zod";
import { runClaude, type MessagesRequest } from "./claude.js";

/** Runs one Messages request and returns the assistant's raw text. */
export type Runner = (req: MessagesRequest) => Promise<string>;

/**
 * The subset of the Anthropic Messages request we accept. `content` is a plain
 * string because that is all the proxy's ApiLlmProvider sends; reject anything
 * richer rather than silently mishandling it.
 */
const messagesRequestSchema = z.object({
  model: z.string().min(1),
  max_tokens: z.number().optional(),
  system: z.string().optional(),
  messages: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .min(1),
});

/**
 * Translate a Messages request into a headless Claude call and shape the reply
 * as a Messages response (a single text block), matching what the Anthropic SDK
 * — and therefore the proxy's ApiLlmProvider — expects to read back.
 */
export async function handleMessages(
  rawBody: unknown,
  run: Runner,
): Promise<{ status: number; body: unknown }> {
  const parsed = messagesRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.message } };
  }

  try {
    const text = await run(parsed.data);
    return {
      status: 200,
      body: {
        id: `msg_shim_${parsed.data.model}`,
        type: "message",
        role: "assistant",
        model: parsed.data.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        // The subscription/CLI governs usage; emit a well-formed zero block so a
        // strict SDK deserializing a Message finds the required field present.
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
  } catch (err) {
    // The Claude session failed (not logged in, bad model, crash) — surface it
    // as a 502: the shim is a healthy gateway to an upstream that errored.
    const message = err instanceof Error ? err.message : String(err);
    return { status: 502, body: { error: message } };
  }
}

/** Build the Express app. `run` defaults to the real headless Claude runner. */
export function createApp(run: Runner = (req) => runClaude(req)): Express {
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.post("/v1/messages", async (req, res) => {
    const { status, body } = await handleMessages(req.body, run);
    res.status(status).json(body);
  });
  return app;
}
