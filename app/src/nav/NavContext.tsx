import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Arc, Card, GenerateArcResponse, StoryBible, WizardAnswers } from "@wwt/domain";

/**
 * Tiny hand-rolled navigator. No external nav library — just a discriminated
 * union of screens with typed params, held in React state and exposed via a
 * context + {@link useNav} hook. Enough for the bookshelf-first flow:
 * Library (home) -> Wizard -> Card-Pick -> Viewer -> back to the shelf.
 */

export type NavState =
  | { screen: "library" }
  | { screen: "wizard" }
  | { screen: "cardpick"; params: CardPickParams }
  | { screen: "viewer"; params: ViewerParams };

export type Screen = NavState["screen"];

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
  const goHome = useCallback(() => setState({ screen: "library" }), []);
  const value = useMemo(() => ({ state, navigate, goHome }), [state, navigate, goHome]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within a NavProvider");
  return ctx;
}
