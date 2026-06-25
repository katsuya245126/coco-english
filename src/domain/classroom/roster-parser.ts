// Roster bulk-paste parsing (CLASS-02, D-05) and student-name normalization
// (Open Question 2, resolved 2026-06-25).
//
// normalizeRosterName produces the canonical key used for duplicate detection
// and for the active-roster uniqueness constraint. It MUST stay consistent with
// the database index `students_active_name_per_class_idx` (lower(display_name)).
// We persist the normalized name as students.display_name so that
// `lower(display_name)` equals this key — collapsing inner whitespace here and
// storing the collapsed value keeps the app-level and DB-level dedup in sync.

export function normalizeRosterName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type RosterPasteResult = {
  // Saveable raw names in input order (blanks removed, duplicates kept once).
  names: string[];
  // Number of blank/whitespace-only lines that were present (surfaced, not
  // silently dropped).
  blankCount: number;
  // Raw names whose normalized form already appeared earlier in the paste.
  duplicates: string[];
};

// Split newline-separated input, surface blank and duplicate names rather than
// silently discarding them. The teacher sees these in a preview before saving.
export function parseRosterPaste(input: string): RosterPasteResult {
  const rawLines = input.split(/\r?\n/);

  let blankCount = 0;
  const names: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      blankCount += 1;
      continue;
    }

    const key = normalizeRosterName(trimmed);
    if (seen.has(key)) {
      duplicates.push(trimmed);
      continue;
    }

    seen.add(key);
    names.push(trimmed);
  }

  return { names, blankCount, duplicates };
}
