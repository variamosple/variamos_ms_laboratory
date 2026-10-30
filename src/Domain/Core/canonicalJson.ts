import { createHash } from "crypto";

/**
 * JSON with object keys sorted at every level. PostgreSQL JSONB does not keep
 * key order, so a hash over plain JSON.stringify could not be checked again
 * after storage; over the canonical form it can (LAB-CF-01, LAB-RP-01).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

export const sha256Hex = (data: string | Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The identity of a pinned copy: a model or the semantics of a language. */
export const modelHash = (model: unknown) => sha256Hex(canonicalJson(model));
