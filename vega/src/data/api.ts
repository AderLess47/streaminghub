import type { AccountInfo, PairingCode, PairingPoll, WatchProgressItem } from "../model/types";

/**
 * Client für die StreamingHub-Geräte-API (`docs/API.md`).
 *
 * Übertragen werden nur Konto-, Geräte- und Abo-Metadaten sowie optional die vom
 * Admin hinterlegte M3U-Quell-URL. Playlist-Inhalte, EPG-Daten und Stream-URLs
 * bleiben auf dem Gerät.
 */

export const DEFAULT_BASE_URL = "https://streaminghub.org";

export class StreamingHubApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "StreamingHubApiError";
    this.status = status;
    this.code = code;
  }
}

type CallOptions = {
  method: "GET" | "POST" | "PUT";
  token?: string;
  body?: unknown;
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export class StreamingHubApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async call(path: string, options: CallOptions): Promise<Json> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "StreamingHub/1.0 (Vega)",
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });

      const raw = await response.text();
      let json: Json = {};
      try {
        json = (JSON.parse(raw) as Json) ?? {};
      } catch {
        json = {};
      }

      if (!response.ok) {
        const error = asObject(json["error"]);
        const message =
          asString(error?.["message"]) ||
          (response.status === 401
            ? "Die Gerätekopplung ist abgelaufen."
            : response.status === 403
              ? "Dieses Gerät wurde im Konto getrennt."
              : response.status === 429
                ? "Zu viele Versuche. Bitte warte einen Moment."
                : `StreamingHub antwortet mit HTTP ${response.status}.`);
        throw new StreamingHubApiError(response.status, asString(error?.["code"]) || undefined, message);
      }

      return json;
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestPairing(deviceName: string, platform: string, appVersion: string): Promise<PairingCode> {
    const json = await this.call("/api/v1/pairing/request", {
      method: "POST",
      body: { deviceName, platform, appVersion },
    });

    const code: PairingCode = {
      requestId: asString(json["requestId"]),
      code: asString(json["code"]),
      pollToken: asString(json["pollToken"]),
      // Die API verlangt mindestens 3 Sekunden Abstand.
      pollIntervalSeconds: Math.max(3, asNumber(json["pollIntervalSeconds"], 3)),
    };
    if (!code.requestId || !code.code || !code.pollToken) {
      throw new StreamingHubApiError(200, "invalid_response", "Die Kopplungsantwort war unvollständig.");
    }
    return code;
  }

  async pollPairing(requestId: string, pollToken: string): Promise<PairingPoll> {
    const json = await this.call(`/api/v1/pairing/status?requestId=${encodeURIComponent(requestId)}`, {
      method: "GET",
      token: pollToken,
    });
    const status = asString(json["status"]) || "pending";
    const token = asString(json["activationToken"]);
    return {
      status: status === "claimed" || status === "expired" ? status : "pending",
      activationToken: token || undefined,
    };
  }

  async me(activationToken: string): Promise<AccountInfo> {
    const json = await this.call("/api/v1/me", { method: "GET", token: activationToken });
    const account = asObject(json["account"]);
    const device = asObject(json["device"]);
    const subscription = asObject(json["subscription"]);
    const playlist = asObject(json["playlist"]);
    const playlistUrl = asString(playlist?.["url"]).trim();
    const email = asString(account?.["email"]);

    return {
      email,
      displayName: asString(account?.["displayName"]) || email,
      deviceName: asString(device?.["name"]) || "StreamingHub Gerät",
      platform: asString(device?.["platform"]),
      plan: asString(subscription?.["plan"]) || "premium",
      subscriptionStatus: asString(subscription?.["status"]) || "none",
      channel: asString(subscription?.["channel"]) || "web",
      currentPeriodEnd: asString(subscription?.["currentPeriodEnd"]) || undefined,
      premiumActive: subscription?.["premiumActive"] === true,
      playlist: playlistUrl ? { url: playlistUrl, updatedAt: asString(playlist?.["updatedAt"]) || undefined } : undefined,
    };
  }

  /** Fortsetzen auf anderen Geräten ist Premium; ohne Abo antwortet die API mit
   * 402 und das Gerät behält seine Positionen lokal. */
  async fetchWatchProgress(activationToken: string): Promise<WatchProgressItem[]> {
    const json = await this.call("/api/v1/progress", { method: "GET", token: activationToken });
    const items = json["items"];
    if (!Array.isArray(items)) return [];

    return items.flatMap((entry) => {
      const item = asObject(entry);
      const url = asString(item?.["url"]).trim();
      if (!item || !url) return [];
      return [
        {
          url,
          positionMs: Math.max(0, asNumber(item["positionMs"])),
          durationMs: Math.max(0, asNumber(item["durationMs"])),
          updatedAt: asString(item["updatedAt"]) || undefined,
        },
      ];
    });
  }

  async saveWatchProgress(
    activationToken: string,
    url: string,
    positionMs: number,
    durationMs: number,
  ): Promise<void> {
    await this.call("/api/v1/progress", {
      method: "PUT",
      token: activationToken,
      body: { url, positionMs, durationMs },
    });
  }
}
