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

/**
 * MVP art look: the world's ONE locked Recraft style. providerStyleRef encodes
 * WHICH lock mode to use (see parseStyleRef):
 *   - "sub:digital_illustration/freehand_details" -> recraftv3 style+substyle
 *      (the detailed pen/pencil looks live in V3's substyle enum; validated to
 *      produce imaginative, detailed single-entity card portraits)
 *   - "id:<uuid>"  -> custom style_id (reference-trained; strongest fidelity,
 *      the follow-up for a truly locked graphite palette)
 * NOTE: Recraft v4/v4.1 dropped the `style` param entirely, so there is no
 * "named style" API mode — curated looks are only reachable as style_ids.
 */
const PENCIL_STYLE_REF = "sub:digital_illustration/freehand_details";
/** Portrait 3:4 card size — supported by recraftv3. */
const CARD_SIZE = "1024x1365";

type StyleLock =
  | { mode: "sub"; model: string; body: { style: string; substyle: string } }
  | { mode: "id"; model: string; body: { style_id: string } };

/** Decode a providerStyleRef into the model + request fields for the lock mode. */
export function parseStyleRef(ref: string): StyleLock {
  if (ref.startsWith("sub:")) {
    const [style, substyle] = ref.slice(4).split("/", 2);
    if (!style || !substyle) {
      throw new Error(`Malformed style ref "${ref}" (want "sub:<style>/<substyle>")`);
    }
    return { mode: "sub", model: "recraftv3", body: { style, substyle } };
  }
  if (ref.startsWith("id:")) {
    return { mode: "id", model: "recraftv3", body: { style_id: ref.slice(3) } };
  }
  throw new Error(`Unrecognized providerStyleRef "${ref}" (want sub:/id: prefix)`);
}

/** Pull the ordered image URLs out of a Recraft generations response. */
export function parseImageRefs(body: unknown): string[] {
  const data = (body as { data?: Array<{ url?: string }> })?.data;
  if (!Array.isArray(data)) throw new Error("Recraft response missing data[]");
  return data.map((d, i) => {
    if (!d?.url) throw new Error(`Recraft response data[${i}] missing url`);
    return d.url;
  });
}

/**
 * Recraft adapter. Locks one world style (built-in V3 substyle by default, or a
 * custom style_id if the world carries one) and generates card-portrait variants.
 */
export class RecraftImageProvider implements ImageProvider {
  async ensureStyle(style: ArtStyle) {
    // A world may already carry a Recraft style_id (custom style path). Otherwise
    // the MVP locks the default detailed-pen substyle for every card.
    return { providerStyleRef: style.providerStyleRef ?? PENCIL_STYLE_REF };
  }

  async generateCardVariants(input: { providerStyleRef: string; prompt: string; count: number }) {
    const lock = parseStyleRef(input.providerStyleRef);
    const res = await fetch(`${config.recraft.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.recraft.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model: lock.model,
        size: CARD_SIZE,
        n: input.count,
        response_format: "url",
        ...lock.body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Recraft ${res.status} ${res.statusText}: ${detail.slice(0, 500)}`);
    }
    const imageRefs = parseImageRefs(await res.json());
    return { imageRefs };
  }
}

export function makeImageProvider(): ImageProvider {
  return usingStubImage() ? new StubImageProvider() : new RecraftImageProvider();
}
