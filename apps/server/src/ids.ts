import { createHash, randomBytes } from "node:crypto";

export function createUuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(now);

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function uuidToBytes(value: string) {
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

/**
 * Deterministic UUIDv5 sibling ID for multi-child log entries, derived from the
 * client-generated base UUIDv7 and the child ID (docs/DECISIONS.md).
 */
export function createUuidV5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(uuidToBytes(namespace))
    .update(uuidToBytes(name))
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
