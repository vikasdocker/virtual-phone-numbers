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

The repository includes a Render Blueprint for a single Docker service with a persistent disk:

[Deploy on Render](https://render.com/deploy?repo=https://github.com/vikasdocker/virtual-phone-numbers)

**This creates paid hosting resources if you complete setup.** Review the plan and disk pricing in Render before deployment. GitHub stores the source; Render runs the backend. The proposed custom domain is **numbers.blueflutex.in**. Setup instructions, credentials, DNS, webhook registration, launch checks, and Docker alternatives are in [DEPLOYMENT.md](DEPLOYMENT.md).

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
docker build -t linea-virtual-numbers:1.0.0 .
```

Integration tests cover authentication, origin checks, quote expiry, server-controlled prices, duplicate reservations, actual Stripe/Twilio signature verification, idempotent provisioning, tenant isolation, uncertain provider responses, refunds, rental release retries, late payments, retention, and production configuration guards. Tests use in-memory SQLite and mocked external calls; they do not purchase numbers or process real payments.

GitHub Actions runs tests, TypeScript checks, frontend/backend builds, dependency audit, and a Docker image build on pushes and pull requests. Render’s Blueprint waits for passing checks before automatic deployment.

## Layout

| Path                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `src/`                | Responsive customer portal                           |
| `server/app.ts`       | Authenticated API, signed webhooks, order processing |
| `server/providers.ts` | Twilio and Stripe adapters                           |
| `server/db.ts`        | SQLite schema and persistence                        |
| `scripts/admin.mjs`   | Admin promotion, recovery, checkout reconciliation   |
| `scripts/backup.mjs`  | Online consistent SQLite backup                      |
| `tests/`              | API and lifecycle integration tests                  |
| `render.yaml`         | GitHub-connected managed Docker deployment           |
| `compose.yaml`        | Self-hosted app, persistent volumes, Caddy HTTPS     |

## Operations and security

Run **one app instance** against its local persistent SQLite volume. Horizontal scaling or multiple replicas require a database/worker redesign. Never deploy the database to an ephemeral filesystem or an NFS volume. Keep encrypted off-host backups and test recovery.

The app uses scrypt password hashes, hashed opaque sessions, HTTP-only secure cookies in live mode, same-origin write checks, request validation, prepared SQL, rate limits, security headers, raw-body Stripe verification, and Twilio signature validation. Secrets stay server-side. Uncertain provisioning is never blindly retried; review the Operations queue.

See [OPERATIONS.md](OPERATIONS.md) for refunds, reconciliation, monitoring, backup, recovery, and data handling. See [SECURITY.md](SECURITY.md) for security boundaries and reporting.
