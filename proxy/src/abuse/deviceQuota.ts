import { config } from "../config.js";

/**
 * Abuse layer 2 — PER-DEVICE FREE QUOTA.
 *
 * Caps free usage per device (no accounts) using the attested device id
 * (DeviceCheck / Play Integrity). Tune loosely at first, tighten on abuse.
 *
 * STUB: in-memory counter. Replace with a durable store (e.g. Redis/DB)
 * keyed by device id. Later, paid CREDIT PACKS attach entitlements here.
 */
const usageByDevice = new Map<string, number>();

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export function checkDeviceQuota(deviceId: string): QuotaResult {
  const used = usageByDevice.get(deviceId) ?? 0;
  const limit = config.abuse.freeBooksPerDevice;
  return { allowed: used < limit, used, limit };
}

export function recordDeviceUsage(deviceId: string): void {
  usageByDevice.set(deviceId, (usageByDevice.get(deviceId) ?? 0) + 1);
}
