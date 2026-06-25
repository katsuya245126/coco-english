// Classroom join-code generator.
//
// Codes are short, stable, unique class locators that teachers share on screens
// and printouts (CLASS-04). They are intentionally low-secrecy — the real access
// gate is the per-student PIN (plan 02-04) — so readability matters more than
// entropy. The alphabet excludes ambiguous glyphs (0/O, 1/I/L) so a code is hard
// to misread when copied by hand.
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const JOIN_CODE_DEFAULT_LENGTH = 6;

// Pure, side-effect-free generator built on the Web Crypto API (available in
// Node 20 and the browser). Modulo bias across a 31-char alphabet over a 256-value
// byte is negligible for a non-secret classroom locator; uniqueness is guaranteed
// at the database level by the join_code unique index, with regenerate-and-retry
// in the class service on the rare collision.
export function generateJoinCode(length: number = JOIN_CODE_DEFAULT_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    bytes,
    (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length],
  ).join("");
}
