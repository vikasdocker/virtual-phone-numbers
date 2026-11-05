# Operator runbook

## Administrator access

Create your own account in the portal, then grant the role from the trusted server shell:

```sh
docker compose exec app node scripts/admin.mjs promote owner@your-domain.com
```

On Render, run `node scripts/admin.mjs promote owner@your-domain.com` from the service Shell. Administrator access is never granted by signup or an API request.

## Order lifecycle

`awaiting_payment → paid → provisioning → active → release_pending → expired`

- Search quotes expire after 10 minutes. Stripe sessions expire after 30 minutes; local checkout reservations retain a five-minute safety margin.
- The maintenance loop runs every 15 seconds and claims paid orders before contacting Twilio. Activation starts the 30-day rental clock.
- Supplier errors and process restarts during provisioning produce `needs_review`. Do not automatically retry the purchase: the provider may already have bought the number.
- Expired numbers move to `release_pending`; failed releases stay queued and retry. Investigate this state if it persists, because supplier rental charges may continue.
- An unpaid checkout can become `expired`. Payment received after that reservation was released becomes `payment_review`; refund it rather than assigning a number already reserved by someone else.

## Reconcile uncertain provisioning

Open **Operations** as an admin. Look up the order in Twilio and Stripe. Each provisioned number’s Friendly Name is `linea:ORDER_ID`. Use **reconcile** only when the matching provider number exists and verified payment is recorded; the API confirms that marker before assigning it. Otherwise inspect provider request logs, allow time for any in-flight request to settle, and use **refund** only after confirming no supplier number was purchased.

Refunds are sent with a stable Stripe idempotency key. A failed refund stays visible for review. Never return a number to inventory solely because an external call timed out.

## Reconcile uncertain checkout creation

If Stripe Checkout creation timed out before its session ID was saved, find the session in Stripe using the order ID metadata. Run:

```sh
docker compose exec app node scripts/admin.mjs reconcile-checkout ORDER_ID cs_SESSION_ID
```

The tool retrieves the session from Stripe, verifies metadata, amount, currency, and client reference, then restores the local checkout/payment state. Paid orders queue for provisioning; a late payment on an expired order queues for refund. Do not edit payment state using an unverified browser success URL.

## Refunds and disputes outside the portal

This version automatically handles checkout success/expiry webhooks, not arbitrary Stripe Dashboard refunds or chargebacks. If you refund an active rental directly in Stripe or receive a dispute, manually investigate, terminate/release the Twilio number as appropriate, update/reconcile the order, and record the action in your operational records. Do not assume a Stripe Dashboard action cancels the supplier rental. Active number cancellations and post-activation partial refunds require operator handling.

## Account recovery

Verify the requester’s identity through your business’s recovery procedure before resetting access. Use a trusted interactive shell:

```sh
docker compose exec app node scripts/admin.mjs reset-password customer@their-domain.com
```

The new password is read with hidden terminal input; do not pass it on the command line. The script revokes all sessions and records an audit event. Share a temporary credential only through your approved private recovery channel and have the customer change it immediately. Self-service recovery and email verification are not included.

## Backups

Use SQLite’s online backup API, not a bare copy of an active database file:

```sh
docker compose exec app node scripts/backup.mjs /app/data/backup-2026-11-05.db
docker compose cp app:/app/data/backup-2026-11-05.db ./backup-2026-11-05.db
```

On Render, create a backup under `/app/data` from Shell, then transfer it through an authenticated SSH/SFTP session. Schedule backups through your host and keep encrypted off-host copies; a backup on the same disk is insufficient. Test restores on a separate instance. Stop the app before replacing its database, preserve file ownership, and reconcile any provider changes that happened after the snapshot. Never restore a stale database and blindly re-run external purchases.

## Monitor

- HTTPS `/api/health` externally, application/container health, disk space, and restart frequency.
- `needs_review`, `payment_review`, and prolonged `release_pending` orders in Operations.
- Stripe failed webhook deliveries and Twilio Debugger errors.
- Twilio account balance, number inventory, supplier charges, fraud, and stale numbers without matching active orders.
- Backup completion, off-host retention, restore tests, and provider credential rotation.

The app logs general failures without message bodies or secrets. A generic failure log does not replace provider request logs or host monitoring. Session tokens are stored only as hashes. Retention cleanup removes SMS after `MESSAGE_RETENTION_DAYS`; deletion must also account for your backups and providers’ own retention policies. User/order/audit retention and privacy requests are operator-managed.
