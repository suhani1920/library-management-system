# Requirements and Status

## Problem Statement

Campus libraries need one reliable record of titles, individual copies, members, loans, reservations, fines, and staff actions. LibraCore centralizes these records in MySQL and exposes guarded workflows through an Express API.

## Objectives

- Keep catalogue titles separate from barcoded physical copies.
- Apply membership and loan rules on the server.
- Preserve financial and circulation history.
- Provide role-based access for administrators, librarians, auditors, and members.
- Support staff and member discovery through one API-backed application.

## Role Capabilities

| Role | Current server capabilities |
| --- | --- |
| Super admin | All configured permissions; branch, user, settings, audit, catalogue, circulation, and reports APIs. |
| Librarian | Catalogue, members, circulation, reservations, fines/payments, and reports subject to assigned permissions. |
| Auditor | Read-only reports, audit, catalogue, member, and dashboard access. |
| Member | Own profile and loans, catalogue, reservations, reading list/reviews, fines, and notifications, subject to API rules. |

## Implementation Checklist

- [x] Express API v1, cookie authentication, CSRF, permission middleware, validation, and centralized errors.
- [x] MySQL pool, initial InnoDB migration, and development seed.
- [x] Backend catalogue/member/circulation/reservation/fine/payment/notification/report/admin service modules.
- [x] Frontend login, session restore, dashboards, catalogue, inventory title/copy management, member self-checkout, notifications, member directory/self-service, and circulation desk.
- [x] Frontend reservations, fine ledger/manual payment recording, waiver actions, reports, staff account/settings/branch/audit surfaces.
- [x] Database-free health/security tests and pure circulation-policy tests.
- [ ] Catalogue cover uploads, bulk CSV import/export, barcode labels, reservation fulfillment/priority actions, and payment history view.
- [ ] Notification preference management, password reset/email-verification UI, and book-review submission UI.
- [ ] Complete email-verification workflow. The current backend can mark registrations pending when verification is required but has no confirmation route.
- [ ] MySQL integration tests, concurrent issue test, frontend tests, and end-to-end workflow.
- [ ] Complete OpenAPI schemas, data migration coverage, production hardening, and deployment verification.

## Known Scope Limits

SMTP is optional and environment-configured. Payment records are not a payment gateway. Multi-branch data is represented in the schema and selected service paths, but branch scoping is not comprehensive across all reports. The UI hides actions by permission but relies on backend enforcement for security. Local migrations could not run because MySQL denied the configured `libracore` account; Docker is unavailable, so no database integration test has completed.