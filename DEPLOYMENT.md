# Production deployment

## Render from GitHub

1. Open [the deployment blueprint](https://render.com/deploy?repo=https://github.com/vikasdocker/virtual-phone-numbers) in your Render account. Connect GitHub if prompted. Review the **paid Starter service and 1 GB persistent disk** before creating anything. The blueprint uses Singapore and one instance.
2. Set the prompted environment variables directly in Render. Never put secrets in a GitHub issue, commit, browser URL, or chat:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` from an approved Twilio account. Use a dedicated Twilio project/subaccount for this business.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` from Stripe. Start with test keys and a test endpoint, then switch to live keys and the live endpoint secret before accepting real money.
   - `SUPPORT_EMAIL`, `OPERATOR_NAME`, `OPERATOR_ADDRESS` with real business details.
3. Keep `SALES_ENABLED=false` while preparing the service. The app refuses production demo mode, missing live credentials, an HTTP public URL, or an example support email. `APP_MODE=live` means real provider adapters; Stripe test keys still produce test payments.
4. In Render **Settings → Custom Domains**, add `numbers.blueflutex.in`. Copy the **exact DNS target Render returns**. At the DNS provider for `blueflutex.in`, replace the `numbers` CNAME target with that Render hostname. Keep other DNS records unchanged. Do not point it to `vikasdocker.github.io` for this full-stack deployment.
5. Wait for Render domain verification and TLS issuance. Confirm `https://numbers.blueflutex.in/api/health` returns `{"status":"ok"}`. The configured `APP_URL` must match the HTTPS origin visitors use; other hostnames intentionally fail write-origin checks.
6. Configure Stripe and Twilio as below, test the end-to-end path, complete business/legal review, set `LEGAL_REVIEWED=true`, then set `SALES_ENABLED=true` to open checkout. With test keys, this enables test checkout. Switch to live keys only when ready for real sales.

The Blueprint does not modify DNS or enter credentials for you. A deployable source release is different from a verified live service. For provider instructions see [Render Blueprints](https://render.com/docs/infrastructure-as-code), [persistent disks](https://render.com/docs/disks), and [custom domains](https://render.com/docs/custom-domains).

## Self-hosted Docker alternative

Use a Linux server with Docker Engine and Docker Compose v2, a domain pointing to the server, and inbound ports 80 and 443 available. The database requires persistent local disk. Suggested initial capacity is 1 CPU and 1 GB RAM, with monitoring to validate actual load.

```sh
git clone https://github.com/vikasdocker/virtual-phone-numbers.git
cd virtual-phone-numbers
git checkout v1.0.1
cp .env.example .env
chmod 600 .env
```

Edit `.env` on the server. Set:

```dotenv
NODE_ENV=production
APP_MODE=live
APP_URL=https://numbers.blueflutex.in
DOMAIN=numbers.blueflutex.in
DATABASE_PATH=/app/data/linea.db
TRUST_PROXY=1
SALES_ENABLED=false
```

Set all four provider secrets and business details. For a VPS, use an **A record** for `numbers` pointing to the server’s IPv4 address; replace a conflicting `numbers` CNAME. Add an AAAA record only if IPv6 is configured. Caddy obtains and renews HTTPS certificates automatically. Do not expose the app’s port 3000 directly.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail https://numbers.blueflutex.in/api/health
```

Compose runs the app as a non-root user with a read-only root filesystem. Database files persist in `linea_data`. The reverse proxy owns ports 80/443 and its own TLS volumes. Do not run `docker compose down -v` on production; it destroys persistent volumes.

## Stripe endpoint

Create a Stripe webhook endpoint at:

```text
https://numbers.blueflutex.in/api/webhooks/stripe
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Set the signing secret for that **specific test/live endpoint** as `STRIPE_WEBHOOK_SECRET`, then restart/redeploy. The SDK validates the raw body and signature. Fulfillment uses verified amount, currency, session ID, and order ID, never a success-page redirect.

The release accepts cards with one-time checkout. Payments are not subscriptions. Refund unprovisioned failed orders through the Operations screen; refunds or disputes made directly in Stripe require manual order/provider reconciliation as described in the runbook.

## Twilio setup

The Twilio account needs permission and funding to search and buy supported local SMS-capable numbers. Confirm your right to resell and any requirements for your business. The current live catalog deliberately lists only US/Canadian numbers whose `addressRequirements` is `none`.

Provisioning automatically sets these POST URLs:

```text
https://numbers.blueflutex.in/api/webhooks/twilio/sms
https://numbers.blueflutex.in/api/webhooks/twilio/voice
```

Do not rewrite these paths or add a trailing slash. Signature verification uses the exact public `APP_URL` and path. Rotate credentials by updating the server environment and restarting the app. If changing domains later, update webhooks on every already-provisioned number as well.

## Before opening sales

- Complete your merchant/provider account setup, regulatory review, refund/tax policy, operator details, and privacy/terms review. Tailor the notice to your jurisdiction, processing locations, retention obligations, and customer rights; the included terms are a starting point.
- Confirm retail prices and margins, including Twilio rental and inbound-message charges. Set provider spending alerts and fraud controls. This application does not impose a provider-level spend ceiling.
- Test signup, login, a Stripe test checkout, signed webhook delivery, provisioning, incoming SMS, tenant isolation, expiry/release, refund/reconciliation, and backup restoration. Twilio test credentials do not provide a full real-number provisioning test; any live Twilio test purchase is billable and must be deliberate.
- Promote the operator’s registered account to administrator. Enable host/uptime monitoring and review the Operations queue.
- Configure backups and verify database persistence across redeploys. Keep the service single-instance.
- Set `LEGAL_REVIEWED=true` and enable `SALES_ENABLED=true` only when setup is complete. Use live Stripe credentials for real charges.

## Updates

Render can deploy `main` after successful GitHub checks. Review dependency updates and keep backups before release changes. For Docker:

```sh
git fetch --tags
git checkout v1.0.1
docker compose up -d --build
```

Pin a tested release, preserve the data volume, and follow migration notes. This initial release creates schema version 1 automatically. A server outage can delay number release and continue supplier charges; monitor expiry/release failures.
