import type { Card } from "@wwt/domain";

/**
 * Canonize a pending hero/villain card once the parent taps a variant.
 *
 * Returns a NEW card (the input is never mutated) with the chosen image locked
 * in forever and `canonizedAt` stamped from `now`. A card is never regenerated
 * after this point, so the chosen ref must be a real, non-empty reference.
 */
export function applyCardPick(card: Card, chosenImageRef: string, now: Date): Card {
  const ref = chosenImageRef?.trim();
  if (!ref) {
    throw new Error("applyCardPick: chosenImageRef must be a non-empty image reference");
  }

  return {
    ...card,
    traits: [...card.traits],
    relationships: [...card.relationships],
    lockedImageRef: ref,
    canonizedAt: now.toISOString(),
  };
}
