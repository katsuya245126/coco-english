# Deferred Items

## 2026-06-27 - Out-of-scope Playwright failure

- **Found during:** Plan 05-04 automated closeout check
- **Command:** `npx playwright test`
- **Failure:** `tests/e2e/foundation-smoke.spec.ts` timed out waiting for the root-page button named `Create foundation smoke record`.
- **Reason deferred:** The root route now renders the landing panel and `src/app/page.tsx` documents that it replaced the Phase 1 foundation smoke-test panel. This failure is outside Plan 05-04's teacher evidence and UAT scope.
- **Suggested follow-up:** Update or retire `tests/e2e/foundation-smoke.spec.ts` in a separate maintenance/debug task so the full Playwright suite matches the current landing page behavior.
