import { InMemoryStore } from "./localStore";

/**
 * Process-wide local store singleton. Slice-1 uses the in-memory stub so the
 * finished world survives navigation within a session (real SQLite lands later).
 */
export const store = new InMemoryStore();
