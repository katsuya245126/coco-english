"use client";

// Remembered-class local storage (STUD-02, D-12, D-18).
//
// CRITICAL (D-18): the remembered class is stored as the class ID + a display
// code, in a key SEPARATE from any live join code. A teacher resetting the join
// code must NOT strand a device that already remembered the class. So we persist
// the stable class id (which never changes on a code reset) plus the
// display/join code that was current when remembered (for prefill convenience
// only). On the next visit the device offers the remembered class; the student
// re-enters the manual code or uses the remembered display code, and the server
// resolves whatever code is CURRENTLY valid. Because the remembered record is
// keyed on the immutable class id, it survives a join-code reset.
//
// This NEVER stores a homework unlock or PIN — the student re-enters the PIN
// every visit (D-13, D-17). It is local-only; no Supabase Auth account exists.

// Deliberately NOT the raw join code value alone — the stored object is a
// distinct "remembered class" record (id + displayCode + name).
const STORAGE_KEY = "coco.rememberedClass.v1";

export type RememberedClass = {
  // Immutable class identifier — survives a join-code reset (D-18).
  classId: string;
  // The code/link label to prefill for convenience; may be stale after a reset,
  // which is fine because the server resolves the current code at unlock time.
  displayCode: string;
  // Class name for a friendly "Return to {name}" banner.
  className: string;
};

export function rememberClass(record: RememberedClass): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode / quota); remembering is a
    // convenience only, so failing silently is acceptable.
  }
}

export function getRememberedClass(): RememberedClass | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedClass>;
    if (
      typeof parsed.classId === "string" &&
      typeof parsed.displayCode === "string" &&
      typeof parsed.className === "string"
    ) {
      return {
        classId: parsed.classId,
        displayCode: parsed.displayCode,
        className: parsed.className,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearRememberedClass(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
