import type { Arc, Card, Storyworld } from "@wwt/domain";
import type { LocalStore } from "./localStore";

/** Downloads a remote image and returns the RELATIVE blob path to store. */
export type ArtDownloader = (url: string, name: string) => Promise<string>;

export interface PersistDeps {
  store: LocalStore;
  /**
   * When provided, each card's http(s) art is downloaded to a local blob and
   * its `lockedImageRef` rewritten to the local path. Omitted in tests / before
   * native storage is initialized, in which case refs are saved as-is.
   */
  downloadArt?: ArtDownloader;
}

/**
 * The ONE human-facing story label, derived from the teaching point. Used as
 * the arc's Library-list title (SqliteStore's `title` column) and as the
 * persisted world's display name — never the internal `world-<id>`.
 */
export function arcTitle(arc: Arc): string {
  const tp = arc.teachingPoint;
  return tp.kind === "virtue" ? tp.virtue : tp.description;
}

const HTTP_REF = /^https?:\/\//i;

/** `.png` from `https://cdn/x.png?sig=1`; falls back to `.img`. */
function extFromUrl(url: string): string {
  const clean = url.split(/[?#]/, 1)[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? `.${m[1].toLowerCase()}` : ".img";
}

async function localizeDeck(deck: Card[], download: ArtDownloader): Promise<Card[]> {
  return Promise.all(
    deck.map(async (card) => {
      if (!HTTP_REF.test(card.lockedImageRef)) return card; // already local / stub ref
      const name = `${card.entityId}${extFromUrl(card.lockedImageRef)}`;
      const ref = await download(card.lockedImageRef, name);
      return { ...card, lockedImageRef: ref };
    }),
  );
}

/**
 * Persist a finished story durably (SPEC §2.22 "art locked forever", §5
 * local-first): download each card's ephemeral remote art to a local blob,
 * rewrite `lockedImageRef` to the local path, then save the world and its arc.
 * Returns the persisted world (with rewritten refs).
 */
export async function persistFinishedWorld(
  world: Storyworld,
  arc: Arc,
  deps: PersistDeps,
): Promise<Storyworld> {
  const deck = deps.downloadArt ? await localizeDeck(world.deck, deps.downloadArt) : world.deck;
  const persisted: Storyworld = { ...world, deck };
  await deps.store.saveWorld(persisted);
  await deps.store.saveArc(arc);
  return persisted;
}
