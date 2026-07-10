---
quick_id: 260710-hbn
status: in_progress
---

# Finish the interrupted retry feedback UI

1. Complete the second-recording card: use the label `Say` in the existing blue accent at a slightly larger size, and remove the original-transcript block.
   - Verify: source-contract tests pin the label, styling, and absence of the transcript.
2. Preserve the interrupted feedback/TTS behavior: the first correction page speaks only Coco's short encouragement, while the corrected sentence is voiced on the following repeat page.
   - Verify: focused TTS UI tests cover the route variant and component wiring.
3. Run TypeScript and focused/full test verification, then record the quick-task result in GSD state.
   - Verify: `tsc` and relevant Vitest/Playwright checks pass; full Vitest suite remains green.
