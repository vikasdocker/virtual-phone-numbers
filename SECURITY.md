# Security

Do not publish secrets, session cookies, received messages, customer records, or provider logs in GitHub issues. Report vulnerabilities privately to the repository owner using GitHub private vulnerability reporting when enabled, or the operator’s published support channel.

The production service requires HTTPS, exact public-origin configuration, non-example support details, and provider credentials. Sales remain disabled until explicitly enabled after operator and legal review. Demo mode is refused with `NODE_ENV=production`.

The explicitly non-commercial `APP_MODE=preview` profile is permitted on a public free host. It forces an in-memory database, uses only simulated providers, rejects real registration/login/account changes, and refuses `SALES_ENABLED=true`. It is distinct from the development-only demo and the live-sales service. Never switch an ephemeral free instance to live mode.

This release is designed for one application process with a local persistent SQLite database. It includes rate limits, prepared SQL, schema validation, scrypt password hashing, opaque hashed sessions, secure cookies, browser-origin checks, CSP/security headers, and provider signature checks. It does not include email verification, MFA, a security audit, external penetration testing, automatic chargeback handling, or enterprise-grade availability guarantees. Assess those requirements before deploying at scale or handling high-risk traffic.

Keep dependency updates, provider spending controls, backups, account recovery procedures, host access controls, and monitoring in place. Never expose a local demo to the internet. Never trust a payment-success URL to grant a number.
