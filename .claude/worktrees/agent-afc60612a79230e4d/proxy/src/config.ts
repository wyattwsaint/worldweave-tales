/** Centralized env config. No secrets are ever sent to the client. */
export const config = {
  port: Number(process.env.PORT ?? 8787),

  recraft: {
    apiKey: process.env.RECRAFT_API_KEY ?? "",
    baseUrl: process.env.RECRAFT_BASE_URL ?? "https://external.api.recraft.ai/v1",
  },
  llm: {
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
  },

  abuse: {
    globalDailyGenerationCap: Number(process.env.GLOBAL_DAILY_GENERATION_CAP ?? 500),
    freeBooksPerDevice: Number(process.env.FREE_BOOKS_PER_DEVICE ?? 20),
    enforceAttestation: (process.env.ENFORCE_ATTESTATION ?? "false") === "true",
    appleTeamId: process.env.APPLE_APP_ATTEST_TEAM_ID ?? "",
    googlePlayProject: process.env.GOOGLE_PLAY_INTEGRITY_PROJECT ?? "",
  },
} as const;

export const usingStubImage = () => config.recraft.apiKey.length === 0;
export const usingStubLlm = () => config.llm.apiKey.length === 0;
