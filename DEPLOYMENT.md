# Deploying the Laboratory

A checklist for the backend (`variamos_ms_laboratory`) and the interface (`VariaMosLaboratory`) on the
production server of the platform (`app.variamos.com`), deployed like the other services: each merge on `main`
builds an image, pushes it to Docker Hub and recreates the service on the server. Points still to decide are
marked **open**.

## 1. Database

- [ ] The platform's PostgreSQL (14.8 in production; the tests use 16), reachable from the backend on the Docker
      network, with the account of the other services (`VARIAMOS_MS_LANGUAGES_DB_*` in the server's env file,
      used by the admin, the notifications, the languages and vms_projects): no new variable. The server has
      `ssl = off`, so `DB_SSL=false` (set in `docker-compose-aws.yml`); the connection stays on the Docker network.
- [ ] A schema for the Laboratory (`DB_SCHEMA`, default `variamos_laboratory`), created by the migrations. It is
      distinct from `variamos_laboratory_test`, which already exists on the server.
- [ ] Read access to the platform tables in the `variamos` schema: `user`, `project`, `user_project`, `model`,
      `language`. The Laboratory never writes them.
- [ ] A backup of the database before the first start, which applies the migrations.
- [ ] **Open**: two database roles. Run data, attempts, model and semantics copies, history, versions, metric
      results, packages and comments are protected by triggers (LAB-R-01, migrations 006, 007, 011), but the
      owner of a table can disable its triggers. The service should connect with a role that does not own the
      Laboratory tables; the migrations need the owner. Today the image runs the migrations with the service's
      own credentials at start (section 3), so it owns the tables; in production, that account is the
      superuser shared by the platform's services. To decide: a role of its own for the Laboratory, without
      ownership of its tables, with a separate migration step for the owner.

## 2. Backend settings

| Setting | Needed | Note |
|---|---|---|
| `PORT` | 8002 | port inside the container; nothing is published on the host (section 3) |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` | yes | given at run time, never in the image (`.dockerignore`) |
| `DB_SCHEMA` | `variamos_laboratory` | |
| `DB_SSL` | `false` in production | `true` (the default) encrypts without checking the certificate; the platform's PostgreSQL has no TLS. Any other value stops the service |
| `VARIAMOS_PUBLIC_KEY_PATH` | yes | public key of the platform session (`@variamosple/variamos-security`), mounted as a file. The service only checks sessions: it needs no private key |
| `LAB_CORS_ORIGINS` | no | origins allowed to call the service with the session cookie; by default the platform and the local servers of the interface (README) |
| `LAB_RUN_*` | defaults in the README | invalid values stop the service |
| `LAB_REASONING_GATEWAY` | `mock` | `mock` marks every result simulated; `semantic_translator` runs real solvers |
| `LAB_SEMANTIC_TRANSLATOR_URL` | with `semantic_translator` | the `/query` endpoint of the VariaMos semantic translator; the service does not start without it |
| `LAB_NOTIFICATION_GATEWAY` | `mock` | only the mock exists |

## 3. Images and server

| | Backend | Interface |
|---|---|---|
| Image | `jasotov/variamos_ms_laboratory:main` | `jasotov/variamoslaboratory:main` |
| Workflow | `.github/workflows/variamos_ms_laboratory-main-aws-image.yml` | `.github/workflows/variamoslaboratory-main-aws-image.yml` (VariaMosLaboratory) |
| Compose service | `variamos_ms_laboratory` | `variamoslaboratoryaws` |
| Host name on the Docker network | `variamos_ms_laboratory` | `variamoslaboratory` |
| Port inside the container | 8002 | 3000 (nginx of the image) |
| Route of the platform proxy | `/variamos_ms_laboratory/` | `/variamos_laboratory/` |

- [ ] **Server first, then merge.** The two blocks of `docker-compose-aws.yml` are added to the platform's
      compose file on the server (they only use variables its env file already has), and the platform proxy
      gets the two routes. A workflow that runs before that fails at its deployment step: the service does not exist.
- [ ] **No published port.** The platform proxy reaches each service by its host name on the Docker network. The
      published ports of the other services answer in clear HTTP from the Internet; the Laboratory does not add
      new ones.
- [ ] Both routes remove their prefix before passing the request on, as for `/variamos_languages/`: the backend
      serves `/health`, `/experiments`…, and the interface, built for `/variamos_laboratory/` (`homepage` in
      `package.json`), is served by its nginx from `/`.
      In `nginx-develop.conf`, next to the routes of the other services (the platform's nginx has
      `resolver 127.0.0.11`, so these routes may exist before the containers: they answer 502 until then):

      ```nginx
      location ~* ^/variamos_laboratory/(.*) {
          proxy_pass http://variamoslaboratory:3000/$1$is_args$args;
          proxy_redirect off;
      }
      location ~* ^/variamos_ms_laboratory/(.*) {
          proxy_pass http://variamos_ms_laboratory:8002/$1$is_args$args;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          # The backend accepts bodies up to 60 MB (reproducibility packages); nginx refuses above 1 MB by default
          client_max_body_size 60m;
      }
      ```
- [ ] Backend: `Dockerfile`, Node 24, `npm ci`. At start it applies the pending migrations, then starts the
      service; a run interrupted by the previous stop is marked failed and its Reasoning jobs are stopped.
- [ ] **One instance only.** The job queue lives in the process, and each start fails every run still pending
      or running and stops its jobs: a second instance would end the runs of the first. The workflow never runs
      two deployments at once.
- [ ] Interface: `Dockerfile`, Node 24 to build, nginx on port 3000. The addresses of the services are built
      into the interface: the workflow writes `.env` before the build (the build stops when it is
      missing): the platform's addresses from the organization variables of the other interfaces
      (`REACT_APP_ADMIN_API_URL`, `REACT_APP_LOGIN_URL`, `REACT_APP_PROJECTS_API_URL`,
      `REACT_APP_LANGUAGES_API_URL`), and two variables of VariaMosLaboratory to create:
      `REACT_APP_URLBACKENDLABORATORY` (`https://app.variamos.com/variamos_ms_laboratory`) and
      `REACT_APP_URLBACKENDRESTRICTION` (the restriction service, as in VariaMosPLE). The run stops before the
      build when one of them has no value.
- [ ] The workflows use the organization secrets of the other services (`ACRUSERNAME_DOKCERHUB`,
      `ACRUSERPASSWORD_DOKCERHUB`, `AWS_HOST`, `AWS_USERNAME`, `VARIAMOS_AWS_PEM`) and the variable
      `ACR_DOKCERHUB`.

## 4. Platform

- [ ] The Administration module issues the session cookie `authToken` that the backend checks.
- [ ] CORS: only the origins of `LAB_CORS_ORIGINS` may call the backend with the session cookie. In production
      the interface and the backend share the origin `app.variamos.com`, through the proxy.
- [ ] The Laboratory tab of the platform menu, between Languages and Wiki, comes from `variamos_ms_admin`
      (`GET /v1/configurations/menu`). It and every backend route except `/health` need the permission
      `laboratory::access`; the admin migration 0012 creates it and grants it to the Administrator role only.
      To open the Laboratory to more people, an administrator adds the permission to their role in the Roles
      page. The permissions travel in the session token: a user sees the change at the next sign-in.
- [ ] Monitoring: the labels of the backend block put it on the Micro-services page of the Administration
      module, probed on `/health` (`variamos.service.*`, internal port 8002).

## 5. After each deployment

- [ ] The workflows check it: `GET /variamos_ms_laboratory/health` answers `"status": "ok"` within 5 minutes, and
      `/variamos_laboratory/` answers 200 with the page of this build and its main script. `/health` does not
      say when the service started, so the backend check cannot tell the new container from the previous one.
- [ ] `GET /health` answers 200 with `{"status": "ok", "gateways": {"reasoning": "mock", "notifications": "mock"}}`;
      503 when the database is unreachable. The start-up log names the same gateways.
- [ ] `npm run migrate` reports nothing left to apply.
- [ ] Signed in without `laboratory::access`: no Laboratory tab, and the backend answers 403.
- [ ] In the interface, signed in with it: the experiment list of a project opens; an experiment can be created,
      marked Ready (each model shows its pinned copy and the semantics of its language), run and its results read.
- [ ] Nothing more: no load or performance target is checked before the real Reasoning service (MVP plan, step 9).
