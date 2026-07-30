import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  Arc,
  ArtStyle,
  Card,
  GenerateArcResponse,
  StoryBible,
  Storyworld,
  WizardAnswers,
} from "@wwt/domain";

/**
 * Tiny hand-rolled navigator. No external nav library — just a discriminated
 * union of screens with typed params, held in React state and exposed via a
 * context + {@link useNav} hook. Enough for the bookshelf-first flow:
 * Library (home) -> Wizard -> Card-Pick -> Viewer -> back to the shelf, plus the
 * continuation loop (#10): Library -> World (its arcs + canon) -> Wizard again.
 */

export type NavState =
  | { screen: "library" }
  | { screen: "world"; params: WorldParams }
  | { screen: "wizard"; params?: WizardParams }
  | { screen: "cardpick"; params: CardPickParams }
  | { screen: "viewer"; params: ViewerParams };

export type Screen = NavState["screen"];

export interface WorldParams {
  /** The saved Storyworld to open — the screen loads it (and its arcs) itself. */
  worldId: string;
}

export interface WizardParams {
  /**
   * The Storyworld being CONTINUED (#10). Present only on the continue path, and
   * it is what makes the wizard a continuation: canon questions give way to the
   * springboard pick, and the world travels to the proxy so prior canon is reused.
   */
  world?: Storyworld;
}

export interface CardPickParams {
  response: GenerateArcResponse;
  /** The wizard answers, so canonized cards can carry the parent's chosen names. */
  answers: WizardAnswers;
}

export interface ViewerParams {
  arc: Arc;
  cards: Card[];
  /** The Story Bible generated for this arc, persisted with the finished world. */
  bible: StoryBible;
  /**
   * The world's resolved art style, persisted so every future arc is drawn
   * through the same provider handle. Omitted only by legacy callers; the
   * Viewer falls back to the MVP pencil preset.
   */
  artStyle?: ArtStyle;
  /**
   * Set when re-opened from the Library shelf: the world is already persisted,
   * so the Viewer must not save again (the upsert would clobber the stored
   * world). Absent on the fresh CardPick -> Viewer creation path.
   */
  source?: "library";
}

interface NavContextValue {
  state: NavState;
  navigate: (next: NavState) => void;
  /** Return to the Library shelf — the app's home surface. */
  goHome: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NavState>({ screen: "library" });
  const navigate = useCallback((next: NavState) => setState(next), []);
  const goHome = useCallback(() => navigate({ screen: "library" }), [navigate]);
  const value = useMemo(() => ({ state, navigate, goHome }), [state, navigate, goHome]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within a NavProvider");
  return ctx;
}
