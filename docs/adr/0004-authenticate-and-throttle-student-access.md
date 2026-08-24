---
status: accepted
---

# Authenticate and throttle student access

Student unlock sessions are HMAC-authenticated, expire after eight hours, and
fail closed when their secret, signature, version, fields, or expiry are
invalid. PIN verification uses one atomic, service-role-only database budget of
five valid attempts per student/network digest in ten minutes. Limiter state
never stores raw student IDs, names, class codes, PINs, or network addresses;
all public failures retain the same non-enumerating response. Successful PIN
verification clears the matching budget. This keeps the existing class-code,
typed-name, and PIN experience without exposing a public writer or accepting
caller-forged student ownership.
