# User Manual

## Sign In

Open the frontend and sign in with an institution-provisioned account, or use member registration if enabled. Development accounts are created by the seed process; their passwords are configurable in `backend/.env.example` and must not be used outside local development. Forgot-password requests return generic confirmation; reset requires a valid emailed token.

## Librarian and Administrator

- Overview shows live summary counts, recent circulation, and overdue attention items from the API.
- Catalogue supports title/author/ISBN/keyword search, availability filtering, sorting, and URL-preserved pagination.
- Members supports directory search, account details, registration, and suspend/reactivate actions. Initial passwords must be shared using an approved channel.
- Circulation desk checks member eligibility and copy availability before issue. Returns preview current overdue charges before recording condition and return.
- Books & inventory supports title creation, lookup-backed author/category/publisher assignment, copy batches, physical-copy detail, archive, and restore.
- Reservations supports title search, queue history, member cancellation, and staff reservation placement.
- Fines & payments shows database-wide balances; authorized staff can record a manual receipt or approve a reasoned waiver. No online payment processing is connected.
- Reports supports date ranges, aggregate charts/tables, and CSV downloads. User access, global settings, branches, and audit events are available under Administration to permitted roles.
- Notifications displays in-app updates and supports mark-read actions.

## Member

- Overview shows current loans, due dates, outstanding fines, reservations, and saved items.
- Catalogue lets members search and filter the campus collection.
- Notifications lists account messages.
- My account supports profile edits, password change, loan renewal requests, reservation cancellation, and reading-list removal.

Member fine history is read-only. Review submission, notification preferences, and online payments are not available.

If email verification is enabled, new accounts may remain pending because the verification confirmation route has not yet been implemented. Keep that setting disabled until the workflow is completed.

## Auditor

The auditor's read-only access includes the permission-gated reports and audit screens; write actions remain hidden and are rejected by backend permission middleware.