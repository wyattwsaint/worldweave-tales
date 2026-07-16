import type { Request } from "express";
import { config } from "../config.js";

/**
 * Abuse layer 1 — APP ATTESTATION (the big one).
 *
 * Verifies a request comes from the genuine app on a real device, using
 * Apple App Attest (iOS) or Google Play Integrity (Android). This kills the
 * catastrophic "point a script at the proxy and burn generations" attack.
 *
 * STUB: real cryptographic verification is wired later. Until then, if
 * ENFORCE_ATTESTATION is false (local dev only) we allow requests through.
 */
export interface AttestationResult {
  ok: boolean;
  reason?: string;
}

export async function verifyAttestation(req: Request): Promise<AttestationResult> {
  const token = (req.body?.attestationToken ?? "") as string;

  if (!config.abuse.enforceAttestation) {
    return { ok: true, reason: "attestation-not-enforced (dev)" };
  }
  if (!token) {
    return { ok: false, reason: "missing attestation token" };
  }
  // TODO: verify token against App Attest / Play Integrity.
  // - iOS: validate the App Attest assertion against APPLE_APP_ATTEST_TEAM_ID.
  // - Android: validate the Play Integrity verdict against GOOGLE_PLAY_INTEGRITY_PROJECT.
  return { ok: false, reason: "attestation verification not implemented yet" };
}
