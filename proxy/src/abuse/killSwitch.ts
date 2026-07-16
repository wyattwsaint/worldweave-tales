import { config } from "../config.js";

/**
 * Abuse layer 3 — GLOBAL SPEND KILL-SWITCH.
 *
 * A hard ceiling on total generations per day across ALL devices. When the
 * day's budget is hit, generation pauses. This is the "no surprise $4,000
 * bill" backstop — independent of layers 1 & 2.
 *
 * STUB: in-memory daily counter. Replace with a durable atomic counter so
 * it survives restarts and multiple proxy instances.
 */
let currentDay = utcDay();
let countToday = 0;

function utcDay(): string {
  // NOTE: real code should use a real clock; kept simple for the scaffold.
  return new Date().toISOString().slice(0, 10);
}

function rollIfNewDay(): void {
  const today = utcDay();
  if (today !== currentDay) {
    currentDay = today;
    countToday = 0;
  }
}

export interface KillSwitchResult {
  allowed: boolean;
  used: number;
  cap: number;
}

export function checkGlobalCap(): KillSwitchResult {
  rollIfNewDay();
  const cap = config.abuse.globalDailyGenerationCap;
  return { allowed: countToday < cap, used: countToday, cap };
}

export function recordGlobalGeneration(): void {
  rollIfNewDay();
  countToday += 1;
}
