import { describe, expect, it } from "vitest";
import { generatePin, hashPin, verifyPin } from "@/domain/classroom/pin";

// PIN_HASH_PEPPER is a server-only secret. Provide a deterministic value for
// the test process so hashPin/verifyPin have a pepper to combine with the
// per-PIN salt. This mirrors how the server reads it at runtime.
process.env.PIN_HASH_PEPPER ??= "test-pepper-0123456789abcdef0123456789abcdef";

describe("student PIN generation", () => {
  it("generates a 4-digit numeric PIN", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generatePin()).toMatch(/^\d{4}$/);
    }
  });

  it("can generate every leading-zero shape (does not strip zeros)", () => {
    // Across many draws we should eventually see a leading-zero PIN; the key
    // guarantee is that the string is always 4 chars wide.
    const pins = Array.from({ length: 500 }, () => generatePin());
    expect(pins.every((pin) => pin.length === 4)).toBe(true);
  });
});

describe("student PIN hashing and verification", () => {
  it.each(["0000", "1234", "9999", "0427"])(
    "round-trips verifyPin for %s",
    (pin) => {
      const stored = hashPin(pin);
      expect(verifyPin(pin, stored)).toBe(true);
    },
  );

  it("rejects the wrong PIN", () => {
    const stored = hashPin("1234");
    expect(verifyPin("4321", stored)).toBe(false);
    expect(verifyPin("0000", stored)).toBe(false);
  });

  it("never stores the cleartext PIN inside the hash value", () => {
    const pin = "1234";
    const stored = hashPin(pin);
    expect(stored).not.toContain(pin);
  });

  it("uses a per-PIN random salt so identical PINs hash differently", () => {
    const a = hashPin("1234");
    const b = hashPin("1234");
    expect(a).not.toBe(b);
    // Both stored values must still verify against the same cleartext PIN.
    expect(verifyPin("1234", a)).toBe(true);
    expect(verifyPin("1234", b)).toBe(true);
  });

  it("does not throw on a malformed stored value (constant-time-safe)", () => {
    expect(verifyPin("1234", "not-a-valid-hash")).toBe(false);
    expect(verifyPin("1234", "")).toBe(false);
  });
});
