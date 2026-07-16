import type { ArtStyle } from "@wwt/domain";
import { config, usingStubImage } from "../config.js";

/**
 * Provider-agnostic IMAGE interface. The rest of the app only knows this
 * shape — so Recraft can be swapped for FLUX or a self-hosted GPU later
 * without touching the pipeline or the app.
 */
export interface ImageProvider {
  /**
   * Create/lock the world's ONE art style once (Recraft named-style). Returns
   * a provider style handle to reuse for every card in that world.
   */
  ensureStyle(style: ArtStyle): Promise<{ providerStyleRef: string }>;

  /**
   * Generate `count` variants for a single entity, in the locked style.
   * count=1 for AI-derived cards; a few for hero/villain parent-pick.
   * Returns image refs (URLs/blobs) — the CALLER canonizes & locks the choice.
   */
  generateCardVariants(input: {
    providerStyleRef: string;
    prompt: string;
    count: number;
  }): Promise<{ imageRefs: string[] }>;
}

/** STUB — no network, no cost. Returns deterministic placeholder refs. */
export class StubImageProvider implements ImageProvider {
  async ensureStyle(style: ArtStyle) {
    return { providerStyleRef: `stub-style:${style.presetId}` };
  }
  async generateCardVariants(input: { providerStyleRef: string; prompt: string; count: number }) {
    const slug = input.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const imageRefs = Array.from({ length: input.count }, (_, i) => `stub-image:${slug}#${i}`);
    return { imageRefs };
  }
}

/** Recraft V3 adapter — turnkey named-style lock. TODO: wire real API calls. */
export class RecraftImageProvider implements ImageProvider {
  async ensureStyle(style: ArtStyle) {
    // TODO: POST to `${config.recraft.baseUrl}/styles` with the pencil-sketch
    // reference to create/fetch a reusable style id. Auth: config.recraft.apiKey.
    if (style.providerStyleRef) return { providerStyleRef: style.providerStyleRef };
    throw new Error("RecraftImageProvider.ensureStyle not implemented yet");
  }
  async generateCardVariants(_input: { providerStyleRef: string; prompt: string; count: number }) {
    // TODO: POST to `${config.recraft.baseUrl}/images/generations` with style_id.
    throw new Error("RecraftImageProvider.generateCardVariants not implemented yet");
  }
}

export function makeImageProvider(): ImageProvider {
  return usingStubImage() ? new StubImageProvider() : new RecraftImageProvider();
}
