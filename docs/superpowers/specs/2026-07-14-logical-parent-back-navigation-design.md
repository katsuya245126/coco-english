# Logical Parent Back Navigation Design

## Problem

The teacher student-profile page labels its top-left link “Classes” but sends the teacher to `/teacher`, which is now the global Needs review inbox. The link was created before the class workspace was split into separate Needs review, Assignments, and Students pages, so it no longer returns to the page that owns the student profile.

## Decision

Back controls on detail pages will return to a stable logical parent, not browser history. A logical-parent link works after refresh, direct navigation, and opening a detail page in a new tab.

The navigation contract is:

- Teacher student profile → that student’s class Students tab.
- Teacher assignment detail and attempt evidence → that assignment’s review page.
- Teacher class settings → that class workspace.
- Student mission recap → Past missions.

The latter three routes already follow this contract. This change fixes the student-profile exception and adds regression coverage; it does not redesign unrelated navigation.

## Implementation

Extend `StudentProfileHeader` with the student’s `classId`. Load `class_id` with the existing student header query and use it to build `/teacher/classes/{classId}/students` on the server-rendered profile page.

Keep the profile as a server component and use a normal Next.js `Link`. Do not add `router.back()`, client-side state, a `returnTo` query parameter, or a new nested profile route.

Label the control “Back to students” so its text accurately describes the destination.

## Data and Authorization

No new query or authorization path is needed. The existing RLS-scoped student header query already verifies that the signed-in teacher can see the student. Adding `class_id` to that projection exposes only the parent identifier required to construct the authorized class route.

If the student record is not visible, the existing `notFound()` behavior remains unchanged.

## Verification

Add focused tests that fail against the current implementation and prove:

- the student header includes `classId` from `students.class_id`;
- the class roster still links to the student profile;
- the profile back link targets `/teacher/classes/${header.classId}/students`;
- the profile no longer hard-codes `href="/teacher"` or labels that destination “Classes.”

Run the focused tests, TypeScript checking, and the relevant teacher-workspace test suite. Existing deterministic logical-parent links remain covered by their current tests.

## Out of Scope

- Replacing links with literal browser-history navigation.
- Carrying arbitrary return URLs through query parameters.
- Moving the student profile route.
- Visual restyling or broad navigation refactoring.
- Changing teacher queue, class workspace, assignment review, or student history behavior.
