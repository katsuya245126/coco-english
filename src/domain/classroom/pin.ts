import {
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

// Student 4-digit PIN helpers (CLASS-03, D-06, D-07).
//
// Security contract:
//   - PINs are auto-generated 4-digit values (0000-9999), zero-padded.
//   - Only a salted + peppered hash is ever persisted (students.pin_hash);
//     plaintext PINs are never stored. The cleartext PIN is returned to the
//     teacher exactly once at generation/reset time and is otherwise never
//     retrievable.
//   - The pepper (PIN_HASH_PEPPER) is a server-only secret that must never
//     reach the browser. This module is server-only (uses node:crypto) and is
//     never imported by a client component.
//
// A 4-digit PIN is low-entropy (10,000 values), so brute-force resistance comes
// from online throttling at the verification boundary (a later student-access
// plan), not from the hash cost. We still use scrypt + per-PIN salt + a pepper
// so a database leak alone does not reveal PINs.

const SALT_BYTES = 16;
const KEY_LENGTH = 32;
const STORED_VERSION = "s1"; // scrypt, format v1

function getPepper(): string {
  const pepper = process.env.PIN_HASH_PEPPER;
  if (!pepper) {
    throw new Error(
      "PIN_HASH_PEPPER is not configured. Set it as a server-only env var before hashing PINs.",
    );
  }
  return pepper;
}

function assertPinFormat(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }
}

// Generate a cryptographically-random 4-digit PIN, zero-padded so leading-zero
// PINs (e.g. "0427") keep their full width.
export function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

// Derive the scrypt key for a PIN given its salt. The pepper is mixed into the
// hashed material so the stored value is useless without the server secret.
function deriveKey(pin: string, saltHex: string): Buffer {
  return scryptSync(`${pin}${getPepper()}`, saltHex, KEY_LENGTH);
}

// Produce the value stored in students.pin_hash. Format:
//   "s1:<saltHex>:<keyHex>"
// A fresh random salt per call means two hashes of the same PIN differ.
export function hashPin(pin: string): string {
  assertPinFormat(pin);
  const saltHex = randomBytes(SALT_BYTES).toString("hex");
  const keyHex = deriveKey(pin, saltHex).toString("hex");
  return `${STORED_VERSION}:${saltHex}:${keyHex}`;
}

// Constant-time verification. Returns false (never throws) for malformed stored
// values so callers can treat any mismatch as a generic failure.
export function verifyPin(pin: string, stored: string): boolean {
  if (!/^\d{4}$/.test(pin)) {
    return false;
  }

  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== STORED_VERSION) {
    return false;
  }

  const [, saltHex, keyHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
    if (expected.length !== KEY_LENGTH) {
      return false;
    }
    const actual = deriveKey(pin, saltHex);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
