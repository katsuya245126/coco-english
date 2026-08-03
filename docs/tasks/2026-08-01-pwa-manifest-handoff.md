# Handoff — PWA manifest (2026-08-01)

## State: shipped, awaiting iPhone UAT

Checkout: `/Users/john/Desktop/my-portfolio/projects/coco-english` (not a worktree)
Branch: `main`
Commit: `015fd74c` — "feat: add PWA manifest so students can install to home screen"
Working tree: clean. Nothing uncommitted, nothing stashed.

Deploy: user ran `vercel --prod` after the commit. Per project setup, pushing
to `origin` runs CI only — prod ships via Vercel CLI from this checkout, so
"pushed" never means "deployed."

## What was built

Manifest + icons only. No service worker.

- `src/app/manifest.ts` (new) — App Router manifest route. `display: standalone`,
  `start_url: "/"`, `theme_color: #2563EB`, `background_color: #FFFFFF`,
  192/512 icons.
- `src/app/layout.tsx` — added `appleWebApp` and `icons.apple` to `metadata`.
  Necessary because iOS ignores the manifest for both the home-screen icon and
  standalone mode.
- `middleware.ts` — added `webmanifest` to the static-extension exclusion group
  in the matcher, so the manifest no longer triggers a Supabase session refresh.
- `public/icon-192.png` (192×192), `public/icon-512.png` (512×512),
  `public/apple-touch-icon.png` (180×180). All solid background, no alpha.
  Author-supplied art.

## Decisions — treat as settled, do not relitigate

- **No service worker, no offline.** Every core flow (Azure scoring, LLM turn
  evaluation, Supabase) is network-bound, so an offline shell has nothing to
  serve. A stale cached bundle mid-mission is unrecoverable for a student who
  cannot be told to hard-refresh.
- **No push, no install-prompt UI.** Speculative.
- **No maskable icon.** Icons ship a solid background; Android applies its own
  shape crop. Revisit only if the crop is reported as visibly bad — that is a
  one-file addition (padded variant + `purpose: "maskable"`).
- **Icons have solid backgrounds, not transparent.** Transparency puts the
  sprite directly on the launcher wallpaper with no silhouette of its own, and
  iOS renders transparent areas black.

## Verification done

Local dev server (since torn down — it collides with the user's own port 3000):
- `/manifest.webmanifest` → 200 `application/manifest+json`, expected JSON
- all three icons → 200 `image/png`
- served HTML head carries `link rel="manifest"`, `link rel="apple-touch-icon"`,
  and the three Apple meta tags
- no browser console errors

After the middleware change: `npm run typecheck`, `npx eslint middleware.ts`,
`git diff --check` all clean. Matcher regex tested against a path table —
`/manifest.webmanifest` and the icons excluded; `/`, `/join`, `/student/home`,
`/auth/login`, `/teacher/classes` still match. That table matters: a botched
alternation would silently strip auth from every route and typecheck would not
catch it.

Codex reviewed the work and found one P3 (the middleware matcher, now fixed).
It confirmed manifest field correctness, `start_url`, `theme_color`, icon
dimensions, and that no competing `favicon.ico` / `app/icon.*` route exists.

UAT so far — **Android: PASS.** User installed from Chrome, ran it, student
session persisted across the install. Expected: Android shares storage between
the browser and the installed PWA.

## Open — this is where to pick up

1. **iPhone UAT (blocking).** The decisive test. Safari → Share → Add to Home
   Screen → launch from icon → run one full mission. Watch two things:
   - microphone (`getUserMedia`) prompt appears and recording works inside the
     installed app. This is the whole product; no simulator reproduces the
     permission behavior faithfully.
   - icon renders correctly on the home screen.
2. **Android icon crop.** User has it installed. Unconfirmed whether the shape
   crop clips Coco's ears. Cosmetic; one-file fix if bad.
3. **Teacher-facing note.** On iOS the installed app has a storage partition
   separate from Safari. Since iOS 17.2 cookies are *copied in at install time*,
   so a teacher installing while signed in normally starts signed in — but the
   contexts drift apart afterward. Not a bug; worth telling teachers once so a
   re-login is not read as breakage.

## Gotchas for the next session

- **Do not read the student session persisting as durable.** `coco_student_unlock`
  (`src/app/join/actions.ts`) is an HttpOnly **session** cookie with no `maxAge`.
  It dies when the app is fully closed, and the student re-enters their PIN.
  That is the D-13/D-17 design decision, not a regression. Android's PASS
  exercised the good case only.
- Auth storage was audited during this work: teacher auth is cookie-based via
  `@supabase/ssr`, refreshed in `middleware.ts`. No auth token in `localStorage`.
  The only `localStorage` use is `src/components/student/remembered-class.ts`,
  which stores `classId`, `displayCode`, and `className` — no PIN, no student
  identity.
- **Always stop any agent-started dev server before ending a turn.** It collides
  with the user's own server on port 3000.
- Home-screen install testing on localhost proves little. Test against prod.
