# Deploying the Laboratory (draft)

A checklist for the backend (`variamos_ms_laboratory`) and the interface (`VariaMosLaboratory`). It lists what
the code needs; how the platform deploys its services is still to be agreed with the team (marked **open**).
Nothing has been deployed yet: the first target is the team's test environment, not production.

## 1. Database

- [ ] PostgreSQL 16 (the version of the tests), reachable from the backend. `DB_SSL=true` (the default)
      encrypts the connection without checking the certificate, as `variamos_ms_notifications` does.
- [ ] A schema for the Laboratory (`DB_SCHEMA`, default `variamos_laboratory`), created by the migrations.
- [ ] Read access to the platform tables in the `variamos` schema: `user`, `project`, `user_project`, `model`,
      `language`. The Laboratory never writes them.
- [ ] **Open**: two database roles. Run data, attempts, model and semantics copies, history, versions, metric
      results, packages and comments are protected by triggers (LAB-R-01, migrations 006, 007, 011), but the
      owner of a table can disable its triggers. The service should connect with a role that does not own the
      Laboratory tables; the migrations need the owner. Today the image runs the migrations with the service's
      own credentials at start (section 3), so it owns the tables. To decide: a separate migration step with
      the owner role, or the same role accepted for the test environment only.

## 2. Backend settings

| Setting | Needed | Note |
|---|---|---|
| `PORT` | 4000 | |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` | yes | given at run time, never in the image (`.dockerignore`) |
| `DB_SCHEMA` | `variamos_laboratory` | |
| `DB_SSL` | `true` | `false` only for a local database without TLS; any other value stops the service |
| `VARIAMOS_PUBLIC_KEY_PATH`, `VARIAMOS_PRIVATE_KEY_PATH`, `VARIAMOS_JWT_EXP_IN_SECONDS` | yes | keys of the platform session (`@variamosple/variamos-security`), mounted as files |
| `LAB_RUN_*` | defaults in the README | invalid values stop the service |
| `LAB_REASONING_GATEWAY`, `LAB_NOTIFICATION_GATEWAY` | `mock` | only the mocks exist: every result is marked simulated |

## 3. Images

- [ ] Backend: `Dockerfile`, Node 24. At start it applies the pending migrations, then starts the service; a
      run interrupted by the previous stop is marked failed and its Reasoning jobs are stopped.
- [ ] **One instance only.** The job queue lives in the process, and each start fails every run still pending
      or running and stops its jobs: a second instance would end the runs of the first. Running several needs
      a shared queue first.
- [ ] Interface: `Dockerfile`, Node 24 to build, nginx on port 3000. The addresses of the services are built
      into the interface: the deployment writes `.env` (all variables in `.env.example`) before the build; the
      build stops when it is missing.
- [ ] The interface is built for the path `/variamos_laboratory/` (`homepage` in `package.json`) and nginx
      serves it from `/`: the platform proxy removes the prefix, as for `/variamos_languages/`. **Open**: to
      confirm with whoever maintains the proxy.

## 4. Platform

- [ ] The Administration module issues the session cookie `authToken` that the backend checks.
- [ ] **Open**: CORS. The backend accepts credentials from any origin (`cors({ origin: true, credentials: true })`
      in `src/app.ts`); with a cookie session, the allowed origins should be the platform's. Depends on the
      `SameSite` attribute of the cookie, set by the Administration module.
- [ ] **Open**: the entry to the Laboratory from VariaMos (menu or link).

## 5. After each deployment

- [ ] `GET /health` answers 200 with `{"status": "ok", "gateways": {"reasoning": "mock", "notifications": "mock"}}`;
      503 when the database is unreachable. The start-up log names the same gateways.
- [ ] `npm run migrate` reports nothing left to apply.
- [ ] In the interface, signed in: the experiment list of a project opens; an experiment can be created,
      marked Ready (each model shows its pinned copy and the semantics of its language), run and its results read.
- [ ] Nothing more: no load or performance target is checked before the real Reasoning service (MVP plan, step 9).
