# Testing Strategy

## Available Commands

```powershell
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Current Automated Coverage

Backend Node tests cover the health response, CSRF cookie issuance, rejection of unsafe requests without a token, safe 404 responses, closed-day due-date calculation, fine grace periods, and fine caps. The HTTP smoke tests do not require a live database.

Frontend currently has Vitest and Testing Library dependencies but no configured or committed UI test suite. Build and Oxlint are the available frontend checks.

## Required Next Tests

- MySQL integration: migrations on an empty database, seed idempotency, member eligibility, issue/return/renew transaction consistency, reservations, waivers, and payment allocation.
- Concurrency: two concurrent issue attempts for one available barcode must yield exactly one loan and one conflict, with copy state and audit history consistent.
- Security: role/permission matrix, member ownership checks, CSRF, refresh rotation/revocation, login lockout, and safe file upload.
- Frontend: login validation, permission routes, catalogue URL filters/pagination, empty/error states, and issue/return preview-confirm behavior.
- End-to-end: create title/copies/member, issue, member loan view/renewal, return, fine, and receipt/history.

Do not treat the current smoke tests as proof of database transaction safety, production security, or full feature completion.