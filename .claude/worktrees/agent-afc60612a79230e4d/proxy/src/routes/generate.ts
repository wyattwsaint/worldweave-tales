import { Router } from "express";
import { z } from "zod";
import { verifyAttestation } from "../abuse/attestation.js";
import { checkDeviceQuota, recordDeviceUsage } from "../abuse/deviceQuota.js";
import { checkGlobalCap, recordGlobalGeneration } from "../abuse/killSwitch.js";
import { makeImageProvider } from "../providers/imageProvider.js";
import { makeLlmProvider } from "../providers/llmProvider.js";
import { generateArc } from "../pipeline/generateArc.js";

export const generateRouter = Router();

// Minimal request validation. The full domain shapes live in @wwt/domain;
// here we validate just enough to run the abuse gate + pipeline safely.
const requestSchema = z.object({
  attestationToken: z.string(),
  deviceId: z.string().min(1),
  answers: z.object({
    tier: z.enum(["beginner", "solid", "epic"]),
    ageBand: z.enum(["toddler", "preschool", "early-reader"]),
  }).passthrough(),
  world: z.unknown().optional(),
});

const image = makeImageProvider();
const llm = makeLlmProvider();

generateRouter.post("/generate", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
  }
  const { deviceId } = parsed.data;

  // --- Abuse gate: all three layers, in order ---
  // Layer 1: attestation (genuine app on a real device).
  const attest = await verifyAttestation(req);
  if (!attest.ok) {
    return res.status(401).json({ error: "attestation failed", reason: attest.reason });
  }
  // Layer 3: global kill-switch (check before doing costly work).
  const global = checkGlobalCap();
  if (!global.allowed) {
    return res.status(503).json({ error: "daily generation cap reached", ...global });
  }
  // Layer 2: per-device free quota.
  const quota = checkDeviceQuota(deviceId);
  if (!quota.allowed) {
    return res.status(402).json({ error: "free quota reached", ...quota });
  }

  try {
    const result = await generateArc(req.body, {
      image,
      llm,
      now: () => new Date().toISOString(),
    });

    // Only count usage once real generation succeeded.
    recordDeviceUsage(deviceId);
    recordGlobalGeneration();

    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return res.status(500).json({ error: message });
  }
});
