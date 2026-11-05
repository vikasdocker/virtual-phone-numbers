# Linea · Virtual Phone Numbers

A complete virtual-number rental portal built with React, TypeScript, Express, Node.js 24, and SQLite. Includes Twilio number search/provisioning, Stripe Checkout, a private inbound SMS inbox, prepaid rental expiry, billing exports, account settings, and administrator reconciliation.

**Release status:** application code and automated tests are ready for deployment. Live sales require a hosting account, provider credentials, DNS configuration, and operator review. No live service, merchant account, domain change, or real transaction is created by cloning this repository.

## Run the demo

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The demo creates an isolated sample workspace with fictional numbers and messages. Checkout never charges a card or contacts Twilio. Do not expose the demo server to the public internet.

To preview the built application:

```sh
npm run build
npm run demo
```

Open **http://127.0.0.1:3000**. Use Node **24.13 or later in the 24.x line**. No external database is needed.

## Deploy from GitHub

The full application needs a Node/Docker backend. GitHub Pages only serves static files and cannot run this backend.

The default Render Blueprint deploys a **free public preview**. It uses isolated sample workspaces with in-memory data and cannot process real payments. Personal registration and password changes are disabled. Sample data resets whenever the service restarts or sleeps.

[Deploy on Render](https://render.com/deploy?repo=https://github.com/vikasdocker/virtual-phone-numbers)

For real sales, `render-production.yaml` contains the **paid persistent-storage profile**. It is never applied automatically by the free deployment. Review and approve hosting costs before using it. GitHub stores the source; Render runs the backend. The proposed custom domain is **numbers.blueflutex.in**. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and launch steps.

## Product scope

- US and Canadian local numbers in live mode, filtered to numbers without provider address requirements. Additional countries are demonstration samples until their regulatory workflows are implemented.
- One number per Stripe Checkout, in USD, prepaid for **30 days from activation**. No automatic renewals. The application releases the supplier number at expiry, retrying failed releases.
- Inbound SMS viewing with configurable retention (30 days by default). SMS is not forwarded by email. There is no outbound messaging, call forwarding, emergency calling, or guarantee that third-party services accept these numbers.
- “Voice-ready” describes a number’s Twilio capability. Incoming calls receive a short message and hang up.
- Supplier charges, availability, resale eligibility, messaging restrictions, taxes, and regulatory obligations remain the operator’s responsibility. Retail prices in `.env.example` are editable merchant prices, not verified supplier costs.
- Password recovery is operator-assisted through a hidden-input CLI. Email verification, self-service recovery, MFA, tax calculation, and subscription renewals are outside this release.

## Verification

```sh
npm run check
npm audit --omit=dev --audit-level=high
docker build -t linea-virtual-numbers:1.0.1 .
```

Integration tests cover authentication, origin checks, quote expiry, server-controlled prices, duplicate reservations, actual Stripe/Twilio signature verification, idempotent provisioning, tenant isolation, uncertain provider responses, refunds, rental release retries, late payments, retention, and production configuration guards. Tests use in-memory SQLite and mocked external calls; they do not purchase numbers or process real payments.

GitHub Actions runs tests, TypeScript checks, frontend/backend builds, dependency audit, and a Docker image build on pushes and pull requests. Render’s Blueprint waits for passing checks before automatic deployment.

## Layout

| Path                     | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `src/`                   | Responsive customer portal                           |
| `server/app.ts`          | Authenticated API, signed webhooks, order processing |
| `server/providers.ts`    | Twilio and Stripe adapters                           |
| `server/db.ts`           | SQLite schema and persistence                        |
| `scripts/admin.mjs`      | Admin promotion, recovery, checkout reconciliation   |
| `scripts/backup.mjs`     | Online consistent SQLite backup                      |
| `tests/`                 | API and lifecycle integration tests                  |
| `render.yaml`            | Free hosted preview; real sales disabled             |
| `render-production.yaml` | Paid live-sales profile with persistent storage      |
| `compose.yaml`           | Self-hosted app, persistent volumes, Caddy HTTPS     |

## Operations and security

For **real sales**, run **one app instance** against its local persistent SQLite volume. Horizontal scaling or multiple replicas require a database/worker redesign. Never deploy customer data to an ephemeral filesystem or an NFS volume. Keep encrypted off-host backups and test recovery. The separate free preview deliberately stores only simulated data in memory and never opens the configured live database.

The app uses scrypt password hashes, hashed opaque sessions, HTTP-only secure cookies in live mode, same-origin write checks, request validation, prepared SQL, rate limits, security headers, raw-body Stripe verification, and Twilio signature validation. Secrets stay server-side. Uncertain provisioning is never blindly retried; review the Operations queue.

See [OPERATIONS.md](OPERATIONS.md) for refunds, reconciliation, monitoring, backup, recovery, and data handling. See [SECURITY.md](SECURITY.md) for security boundaries and reporting.
