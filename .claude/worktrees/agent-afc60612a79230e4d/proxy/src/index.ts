import express from "express";
import { config, usingStubImage, usingStubLlm } from "./config.js";
import { generateRouter } from "./routes/generate.js";

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stubImage: usingStubImage(),
    stubLlm: usingStubLlm(),
    enforceAttestation: config.abuse.enforceAttestation,
  });
});

app.use("/v1", generateRouter);

app.listen(config.port, () => {
  console.log(`[wwt-proxy] listening on :${config.port}`);
  console.log(`[wwt-proxy] image=${usingStubImage() ? "STUB" : "recraft"} llm=${usingStubLlm() ? "STUB" : "api"}`);
  if (!config.abuse.enforceAttestation) {
    console.log("[wwt-proxy] WARNING: attestation NOT enforced (dev only).");
  }
});
