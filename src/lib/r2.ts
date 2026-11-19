/**
 * Minimaler S3-Zugang für Cloudflare R2.
 *
 * Bewusst ohne SDK: gebraucht werden nur drei Aufrufe (PUT, GET, DELETE) auf
 * einen festen Bucket. Die Signatur nach AWS Signature Version 4 rechnet
 * `node:crypto` in wenigen Zeilen – das spart eine schwere Abhängigkeit im
 * Server-Bundle.
 *
 * Nur serverseitig verwenden; die Zugangsdaten kommen aus `env.backup`.
 */
import { createHash, createHmac } from "node:crypto";

export type R2Config = {
  /** z. B. `https://<account_id>.r2.cloudflarestorage.com` */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 erwartet „auto“; andere Werte gibt es nur für Tests. */
  region?: string;
};

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** `20130524T000000Z` – das Format, das SigV4 im Header erwartet. */
const amzTimestamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Kodierung nach RFC 3986. `encodeURIComponent` lässt `!'()*` stehen, S3
 * verlangt sie kodiert; der Schrägstrich bleibt als Pfadtrenner erhalten.
 */
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const encodeObjectKey = (key: string) => key.split("/").map(encode).join("/");

export type SignInput = {
  method: string;
  /** Absoluter Pfad, bereits pro Segment kodiert. */
  path: string;
  host: string;
  /** Zusätzliche zu signierende Header, Namen in beliebiger Schreibweise. */
  headers?: Record<string, string>;
  /** Hex-Digest des Bodys; leerer Body ist der SHA-256 von „“. */
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  timestamp: Date;
};

/**
 * Baut den `Authorization`-Header. Öffentlich, weil der Test damit die
 * offiziellen AWS-Beispielsignaturen nachrechnet.
 */
export function buildAuthorization(input: SignInput): string {
  const region = input.region ?? "auto";
  const service = input.service ?? "s3";
  const amzDate = amzTimestamp(input.timestamp);
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = { host: input.host };
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  }
  headers["x-amz-content-sha256"] = input.payloadHash;
  headers["x-amz-date"] = amzDate;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method,
    input.path,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

type RequestOptions = {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  body?: Uint8Array;
  contentType?: string;
  timestamp?: Date;
};

/** Signierte Anfrage für ein Objekt im konfigurierten Bucket. */
export function signedObjectRequest(config: R2Config, options: RequestOptions) {
  const timestamp = options.timestamp ?? new Date();
  const url = new URL(
    `${config.endpoint.replace(/\/$/, "")}/${encode(config.bucket)}/${encodeObjectKey(options.key)}`,
  );
  const body = options.body ?? new Uint8Array();
  const payloadHash = sha256Hex(body);

  const extra: Record<string, string> = {};
  if (options.contentType) extra["content-type"] = options.contentType;

  const authorization = buildAuthorization({
    method: options.method,
    path: url.pathname,
    host: url.host,
    headers: extra,
    payloadHash,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    timestamp,
  });

  return {
    url: url.toString(),
    headers: {
      ...extra,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzTimestamp(timestamp),
      authorization,
    },
  };
}

/**
 * Fehlerantwort des Speichers. R2 liefert im XML einen `<Code>` wie
 * `SignatureDoesNotMatch` oder `NoSuchBucket` – genau der ist für die
 * Fehlersuche entscheidend, der Body selbst bleibt im Log.
 */
export class R2RequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(operation: string, status: number, code: string | null) {
    super(`R2 ${operation} ${status}${code ? ` ${code}` : ""}`);
    this.name = "R2RequestError";
    this.status = status;
    this.code = code;
  }
}

async function responseError(operation: string, response: Response) {
  const body = await response.text().catch(() => "");
  const code = /<Code>([^<]{1,80})<\/Code>/.exec(body)?.[1] ?? null;
  return new R2RequestError(operation, response.status, code);
}

export type R2ObjectStore = {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** `null`, wenn das Objekt nicht (mehr) existiert. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

const request = async (config: R2Config, options: RequestOptions, init?: RequestInit) => {
  const signed = signedObjectRequest(config, options);
  return fetch(signed.url, {
    method: options.method,
    headers: signed.headers,
    body: init?.body,
    signal: AbortSignal.timeout(15_000),
  });
};

export function r2Store(config: R2Config): R2ObjectStore {
  return {
    async put(key, data, contentType) {
      const response = await request(config, { method: "PUT", key, body: data, contentType });
      if (!response.ok) throw await responseError("PUT", response);
    },
    async get(key) {
      const response = await request(config, { method: "GET", key });
      if (response.status === 404) return null;
      if (!response.ok) throw await responseError("GET", response);
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      const response = await request(config, { method: "DELETE", key });
      // Ein bereits gelöschtes Objekt ist kein Fehler.
      if (!response.ok && response.status !== 404) throw await responseError("DELETE", response);
    },
  };
}
