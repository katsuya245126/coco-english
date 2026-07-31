# Student Access Security Remediation Design

**Status:** Approved on 2026-07-31

## Outcome

Close the three medium-severity findings from the Codex Security scan at revision `9e144218`:

1. Remove the unauthenticated service-role writer at `POST /api/foundation`.
2. Reject forged or expired student unlock cookies before any student-owned query.
3. Enforce a shared, atomic attempt budget for four-digit student PIN verification.

## Constraints

- Preserve the existing class-code, typed-name, and PIN student login experience.
- Preserve the single `generic_mismatch` response for malformed, unknown, wrong, and throttled attempts.
- Preserve every existing server-side student ownership check, mission snapshot, RLS policy, and signed audio URL boundary.
- Never store or log PINs, student names, class codes, or raw network addresses in limiter state.
- Add no dependency. Use Node's `crypto`, the existing Supabase service client, and PostgreSQL.
- Do not deploy, apply a migration, or mutate a remote environment as part of implementation.

## Design

### Remove the foundation writer

Delete the obsolete `/api/foundation` route and its now-unreferenced smoke writer, UI component, response schema, server integration test, and package script. Keep the valid root-route Playwright test even though its filename retains the historical foundation name. Update README instructions that still advertise the removed writer.

Deletion is the authorization control: there is no current product requirement for a remotely callable smoke-data creator, so authentication or rate limiting would preserve unnecessary attack surface.

### Authenticate the student cookie

Keep the existing `StudentUnlockCookie` fields to avoid new profile queries and consumer changes. Add an internal version and absolute expiry, encode the payload with base64url, and authenticate it with HMAC-SHA-256 using a new server-only `STUDENT_ACCESS_SECRET`.

The cookie remains an HttpOnly, Secure-in-production, SameSite=Lax browser-session cookie. Its authenticated payload has an eight-hour maximum lifetime even if a client retains it longer. `readStudentUnlock()` returns `null` for missing secrets, malformed tokens, invalid signatures, unsupported versions, invalid fields, or expired tokens. All current consumers already reject `null`, so verification stays centralized.

The same root secret may derive rate-limit keys only with explicit domain separation. Session signatures and limiter digests use different purpose prefixes.

### Throttle PIN verification

Add `student_unlock_attempts`, keyed by HMAC digests of:

- the server-resolved student ID; and
- the request network signal.

The browser-facing action obtains Vercel's deployment-provided `x-vercel-forwarded-for` network address header, then `x-forwarded-for` for local/proxy compatibility, falling back to a fixed `unknown` value when absent. Vercel documents that it overwrites `x-forwarded-for` to prevent spoofing. The action passes the signal separately to `unlockStudent`; raw values are HMACed before database access.

After the existing class and student lookup succeeds, an atomic PostgreSQL RPC consumes one attempt immediately before PIN verification. It permits five valid-shaped submissions per student/network pair in a rolling ten-minute window. Concurrent requests update the same row atomically. The sixth and later attempts return the existing generic mismatch without calling `verifyPin`. A successful PIN verification clears that pair's counter. Unknown identifiers do not allocate limiter rows.

Malformed PINs and empty normalized identifiers keep their current pre-database generic short-circuit. Limiter tables use RLS and grant access only to `service_role`; RPC execution is revoked from `public`, `anon`, and `authenticated`.

## Failure Behavior

- Missing or invalid `STUDENT_ACCESS_SECRET`: do not issue or accept a student session.
- Limiter RPC error: fail closed with `generic_mismatch`.
- Unknown class, unknown student, wrong PIN, or exhausted budget: identical `generic_mismatch`.
- Successful PIN with counter-clear failure: fail closed rather than issuing a session with uncertain limiter state.
- Cookie verification failure: return `null`; existing pages redirect and existing routes/actions return their current unauthorized response.

## Verification

- Repository search proves `/api/foundation` and its writer are absent.
- Unit tests cover valid, tampered, wrong-secret, malformed, and expired session tokens.
- Schema tests cover limiter table shape, RLS, service-role-only grants, atomic RPC behavior, five-attempt threshold, and ten-minute reset.
- Env-aware student-access tests cover exhaustion, generic failure, counter clearing after success, and recovery after clearing test state.
- Existing student ownership, mission, history, audio, translation, and TTS tests remain unchanged unless their test setup must provide the new secret/network argument.
- Run focused tests, then `npm test -- --run`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Non-goals

- Student Supabase Auth accounts.
- Opaque database-backed student sessions or immediate per-session revocation.
- CAPTCHA, device fingerprinting, or a new rate-limit service.
- Teacher authentication changes.
- Production migration, deployment, WAF configuration, or live penetration testing.

## Accepted Tradeoffs

- Signed stateless sessions cannot be individually revoked; their ceiling is the browser session or eight hours. Add opaque sessions only if immediate revocation becomes a requirement.
- A target/network limiter reduces online guessing without enabling an internet-wide lockout of one student. Distributed-source attacks remain a reason to add verified edge controls later.
- Limiter rows grow with observed student/network pairs. Add scheduled pruning only if measured table growth becomes material.
