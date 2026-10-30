# variamos_ms_laboratory
VariaMos Microservice for  laboratory backend

## API

The contract is `openapi.json` (OpenAPI 3.1). The integration tests check every response against it,
and `src/EntryPoints/contract.test.ts` fails if a route is added without being documented.

Every route except `/health` needs a VariaMos session: a token signed by the Administration module,
as a `Bearer` header or the `authToken` cookie. The service verifies it with the public key at
`VARIAMOS_PUBLIC_KEY_PATH`. The session must also hold the permission `laboratory::access`
(`src/EntryPoints/laboratoryAccess.ts`), given at first to the Administrator role only: other accounts
get 403 before any work, so that they cannot load the server with runs.

## Database

The Laboratory tables live in the schema named by `DB_SCHEMA` (default `variamos_laboratory`).
The platform tables it reads (`variamos.user`, `variamos.model`, `variamos.project`, `variamos.user_project`)
belong to the Administration module and vms_projects; `test-support/platform_stub.sql` mirrors their schema
for the tests.

Run data, attempts, model and semantics snapshots, history, versions, metric results and packages are append-only: triggers
refuse their update, deletion and `TRUNCATE` (migrations 006 and 007). The triggers can be disabled by the
owner of the tables, so in production the service should not own them.

```bash
npm run build
npm run migrate      # applies migrations/*.sql once each, recorded in <schema>.schema_migration
```

The Docker image applies the pending migrations before starting. `DEPLOYMENT.md` lists what a deployment
needs (draft). The migrations also adopt the tables
created by hand during the first version (`test-support/internship_schema.sql` shows them).

## Reasoning

The Laboratory never runs a solver itself (LAB-R-02): everything goes through `ReasoningGateway`
(`src/Domain/Reasoning`). Until the public Reasoning API exists, `MockReasoningGateway` serves the solver
catalog (MiniZinc, SWI-Prolog, Z3, with versions and parameters) and runs jobs: its results are marked
`simulated: true`, and so are the metrics, exports and packages built from them. No real solver and no
external service is called during development. The end of a run is sent to `NotificationGateway`, also a
mock until the VariaMos notification service is connected. `isolation.test.ts` fails if a solver
library or `child_process` appears in the service. `LAB_REASONING_GATEWAY` and `LAB_NOTIFICATION_GATEWAY`
name the implementation behind each gateway: the service logs them at start-up and `GET /health` returns
them, so a deployment shows whether its results are simulated.

## Tests

```bash
npm test             # unit, HTTP, contract and isolation tests, no database
npm run db:test:up   # PostgreSQL on 127.0.0.1:55433 (compose.test.yml)
npm run test:db      # integration tests against that database (*.db.test.ts), real session middleware included
npm run db:test:down
```

`.github/workflows/ci.yml` runs the build and both suites.

## Experiment lifecycle

| Action | Route | Allowed from | Permission |
|---|---|---|---|
| Edit | `PUT /experiments/:id` | Draft, Request Changes (in place); Ready, Completed, Failed, Cancelled (new version, back to Draft) | write |
| Mark Ready | `PUT /experiments/:id/ready` | Draft, Request Changes, once the configuration is valid; pins a copy of each input model | write |
| Run | `POST /experiments/:id/runs` | Ready, Completed, Failed, Cancelled | execute |
| Cancel a run | `POST /experiments/:id/runs/:runId/cancel` | a pending or running run | execute |
| Archive | `PUT /experiments/:id/archive` | any state but Running | manage |
| Restore | `PUT /experiments/:id/restore` | Archived; returns to the state before archiving | manage |
| Delete | `DELETE /experiments/:id` | logical; an experiment with completed runs is archived instead, and an archived one with completed runs stays archived | manage |

Permissions (LAB-COL-01): the owner and the director have all four; a shared user always reads, and writes or
executes only when given that permission (`POST /experiments/:id/share` with `permissions`). Disabled or deleted
users cannot be given access. A save names `expectedVersion`; when someone saved since, the answer is 409 with
the changes made in between (LAB-COL-02).

Ready checks: a name, at least one metric and one scenario; each scenario has one or more existing models
whose language exists, at least one solver from the catalog pinned to an available version with valid
parameters, and an operational context naming only features of its models. Ready then pins a copy of each
model and of the semantics of its language (`variamos.language.semantics`, read-only), each identified by
the SHA-256 of its canonical JSON: the platform does not number the versions of a semantics (LAB-RP-01).

Errors: 400 invalid request (with `details` for Ready), 403 no permission, 404 unknown or deleted, 409 not allowed in the current state.

## Runs

A run (LAB-RUN-01) copies the pinned models and semantics and the configuration of the experiment version, then runs one
scenario run per scenario and solver in the background. An in-process queue submits each one through the
gateway, polls it, retries transient failures and stops it at the time limit; every attempt is recorded. A run
interrupted by a restart is marked failed at start-up, and the jobs it was waiting for are stopped.

`runConcurrency.db.test.ts` checks hypotheses rather than examples: a cancellation arrives at every point where
a run waits for the Reasoning module (before and after each call, with and without retries) and at a forced
point inside the database work; after each schedule, the run has ended, the cancellation answered 200 or 409,
the experiment shows the state of its run, each scenario run has one result per metric, every job finished or
was stopped, and one final event is recorded. `RUN_CONCURRENCY_REPORT=<file>` writes every schedule and its
outcome.

| Setting | Default | Meaning |
|---|---|---|
| `LAB_RUN_CONCURRENCY` | 4 | scenario runs at the same time |
| `LAB_RUN_MAX_RETRIES` | 2 | retries of a transient failure (LAB-RUN-06) |
| `LAB_RUN_RETRY_DELAY_MS` | 1000 | wait before a retry |
| `LAB_RUN_POLL_INTERVAL_MS` | 500 | how often a job is polled |
| `LAB_RUN_MAX_RUNTIME_SECONDS` | 3600 | time limit of a scenario run |
| `LAB_REASONING_GATEWAY` | mock | what answers behind `ReasoningGateway`; only `mock` exists (roadmap Q5) |
| `LAB_NOTIFICATION_GATEWAY` | mock | what answers behind `NotificationGateway`; only `mock` exists |

Invalid values stop the service at start-up.

## Results and reproducibility

- Metrics are computed at the end of each scenario run (LAB-MT-03): REQ-12 to REQ-14 from the pinned model,
  the family metrics from the Reasoning answer; a metric that cannot be computed stores its reason.
- `GET /experiments/:id/results`, `/export?format=csv|json|xlsx` and `/benchmark` give the values, the files
  and the solver comparison (LAB-MT-04 to 06).
- A completed run gets a persistent id `VLAB-XXXX-XXXX-XXXX-XXXY` (Crockford base 32, check character),
  resolved by `GET /runs/:persistentId`, and a ZIP package (`/runs/:runId/package`, format
  `variamos-laboratory-package/1`) with the models and the semantics of their languages named by their SHA-256
  in canonical JSON (LAB-RP-01 to 03).
- `POST /reproductions` checks every hash of a package and rebuilds a Ready experiment with the models and
  semantics of the package, not today's; a package made before the semantics was kept is refused;
  `GET /runs/compare` shows runs side by side and says whether they are equivalent, timings apart (LAB-RP-04).

## Comments

`/experiments/:id/comments` (LAB-COL-03): on the experiment, a scenario, a run, a scenario run, or one metric of
a scenario run result. Whoever reads the experiment can comment; the author edits; the author, the owner or the
director deletes.
