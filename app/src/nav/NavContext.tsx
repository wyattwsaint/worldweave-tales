import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Arc, Card, GenerateArcResponse, WizardAnswers } from "@wwt/domain";

/**
 * Tiny hand-rolled navigator. No external nav library — just a discriminated
 * union of screens with typed params, held in React state and exposed via a
 * context + {@link useNav} hook. Enough for the Slice-1 happy-path flow:
 * Wizard -> Card-Pick -> Viewer.
 */

export type NavState =
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
}

interface NavContextValue {
  state: NavState;
  navigate: (next: NavState) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NavState>({ screen: "wizard" });
  const navigate = useCallback((next: NavState) => setState(next), []);
  const value = useMemo(() => ({ state, navigate }), [state, navigate]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within a NavProvider");
  return ctx;
}
