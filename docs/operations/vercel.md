# Vercel

Two projects deploy from this repo: `coco-english` (production) and
`coco-english-demo` (public demo). The production project and team IDs are in
`.vercel/project.json`.

- Runtime logs are kept for 1 hour on the Hobby plan. Check logs right after
  reproducing an issue; older production evidence lives in the database.
- Run the `vercel` CLI with `--no-color </dev/null`; without stdin it can wait
  for input and hang.
