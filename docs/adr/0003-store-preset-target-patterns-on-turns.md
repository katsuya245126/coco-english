---
status: accepted
---

# Store preset target patterns on turns

Preset missions store each expected target pattern on its authored turn and do
not retain a hidden mission-level pattern. The mission-level value becomes
optional and belongs only to conversation missions as soft lesson context. This
keeps evaluation data aligned with the product language rather than deriving a
misleading global value from one turn; existing templates are backfilled from
their former mission pattern, while immutable historical snapshots remain
readable through legacy fallback interpretation.
