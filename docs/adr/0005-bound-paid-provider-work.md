---
status: accepted
---

# Bound paid provider work

Paid audio, AI, TTS, translation, pronunciation, and mission-authoring work is
admitted through one atomic, RLS-enabled, service-role-only request-budget
primitive. Authentication, input validation, and resource ownership are proved
before consuming a budget; admission happens before provider calls, cache
lookups, blob reads, uploads, or state mutations. Actor keys are purpose-separated
HMAC digests rather than raw identifiers, failures deny work, and student limits
return a retryable `429`. Literal per-operation budgets remain in server code so
changes are reviewed with the boundary they protect. Add edge controls or a
distributed limiter only if observed traffic shows valid-account coordination
that per-actor budgets cannot contain.
