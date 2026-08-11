# Remove Duplicate Mission Snapshot Readers

## Goal

Finish Issue #27 by proving that stored mission snapshots have one approved
meaning across application and server consumers.

## Design

Issue #27 is verification-only unless an audit or required check proves that a
code change is needed. The current source inventory shows that application and
server readers use `interpretMissionSnapshot`. The two approved exceptions are:

- `buildMissionSnapshot` uses `missionSnapshotSchema.parse` to keep snapshot
  creation strict at the assignment boundary.
- The database completion operation continues reading `requiredTurns` from the
  stored snapshot because the approved design explicitly leaves it unchanged.

No structural guard test, new abstraction, schema migration, dependency, or
production behavior change is planned.

## Verification

1. Audit source reads for direct schema parsing, permissive local parsers,
   unsafe snapshot casts, and raw stored-snapshot field access.
2. Confirm every result is the shared interpreter, the strict assignment
   creator, the approved database completion operation, generated database
   typing, or test data.
3. Run the focused interpreter and affected feature tests.
4. Run the full test suite, typecheck, source lint, production build, and diff
   checks.
5. Stop and write a root-cause implementation plan if an audit or check fails;
   do not add speculative cleanup.

## Done

- The final audit finds no unapproved stored-snapshot reader.
- Issue #27's focused and broad checks pass with recorded commands and results.
- The Issue #27 diff contains no application refactor.

## Out of Scope

- Mission behavior changes.
- Snapshot creation changes.
- Database completion changes.
- Schema migrations or new dependencies.
- Deployment, push, publication, or production mutation.
