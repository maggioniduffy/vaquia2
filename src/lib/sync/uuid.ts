// UUIDv7 (RFC 9562): 48-bit unix-ms timestamp, version 7, variant 10, 74 random bits. Client ids for
// records, signatures and attachments are generated here and reused as the server primary key.

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_RE.test(value);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function uuidv7(
  now: number = Date.now(),
  random: (length: number) => Uint8Array = randomBytes,
): string {
  const b = new Uint8Array(16);
  b.set(random(10), 6); // bytes 6..15 random, 0..5 overwritten below
  const ms = Math.max(0, Math.floor(now));
  // 48-bit big-endian timestamp (Number is exact up to 2^53, so plain division is safe).
  b[0] = Math.floor(ms / 2 ** 40) & 0xff;
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = (ms >>> 24) & 0xff;
  b[3] = (ms >>> 16) & 0xff;
  b[4] = (ms >>> 8) & 0xff;
  b[5] = ms & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
