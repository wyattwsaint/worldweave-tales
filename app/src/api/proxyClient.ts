import type { GenerateArcRequest, GenerateArcResponse } from "@wwt/domain";

/**
 * The structural contract both {@link ProxyClient} and the test-only
 * FakeProxyClient satisfy. Screens depend on THIS, so a fake can be injected
 * without any network I/O.
 */
export interface ProxyClientLike {
  generateArc(req: GenerateArcRequest): Promise<GenerateArcResponse>;
}

/**
 * Thin client for the proxy. The app never holds API keys — it only talks to
 * our own proxy, attaching the device's attestation token + device id.
 */
export class ProxyClient implements ProxyClientLike {
  constructor(private baseUrl: string) {}

  async generateArc(req: GenerateArcRequest): Promise<GenerateArcResponse> {
    const res = await fetch(`${this.baseUrl}/v1/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ProxyError(res.status, body?.error ?? "generation failed", body);
    }
    return (await res.json()) as GenerateArcResponse;
  }
}

export class ProxyError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}
