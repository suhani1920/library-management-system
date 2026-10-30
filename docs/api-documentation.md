# API Documentation

Base path: `/api/v1`. Swagger UI is served at `/api/docs`; its current OpenAPI document is a starter subset and does not yet describe every route schema. JSON success responses generally use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?" } }`.

## Authentication and Safety

- Login returns public user data and sets HttpOnly access/refresh cookies.
- Call `GET /auth/csrf` to receive the CSRF token cookie and token value. Send the cookie value as `x-csrf-token` on mutating requests.
- `POST /auth/refresh` rotates the refresh cookie; logout revokes the stored refresh token.
- Passwords are hashed. Do not send tokens in URL parameters or store them in localStorage.
- API authorization is enforced per route. Roles and permissions are defined in `backend/src/config/permissions.js`.

## Implemented Route Groups

- Auth: login, logout, refresh, forgot/reset password, member registration, current user, password change. Password reset delivery requires configured SMTP.
- Catalogue: search/suggestions/lookups/details, create/update/archive, add/update copies, reading list and reviews.
- Members: list/create/detail/update/status/renew and current member profile.
- Circulation: issue preview/issue, return preview/return, renew, loan list/detail/overdue filtering.
- Reservations: create/list/cancel.
- Finance: fine list/waiver, payment record, receipt.
- Dashboard: role-aware summary and permission-scoped circulation series.
- Reports: `GET /reports/:type` for inventory, circulation, overdue, financial, members, popularity, lost, acquisitions, memberships, reservations, librarians, and audit; CSV is requested with `format=csv` where supported.
- Notifications: list, mark one read, mark all read.
- Administration: users, branches, audit logs, settings, membership types.

## Pagination and Filters

List endpoints accept page/limit where implemented. Limits are capped by the shared pagination helper. Catalogue search supports `q`, category/author/language, availability, sorting, and page/limit. Member lists support `q`, status, department, page, and limit. Loan lists support member/status filters. Exact allowed fields are validated in their owning controller/service.

## Main Workflow Contracts

### Issue

`POST /loans/preview-issue` and `POST /loans/issue` accept `{ "memberKey": "member code or student ID", "barcode": "copy barcode", "notes?": "..." }`. Preview returns member/copy, due date, eligibility, reasons, and policy summary. Issue returns loan ID/code and due date. Both require circulation permission.

### Return

`GET /loans/preview-return?barcode=...` accepts barcode, copy code, or loan code and returns the active loan and calculated preview fine. `POST /loans/:loanId/return` accepts condition (`good`, `fair`, `damaged`, `lost`), optional damage charge, and notes. Return is transaction-backed and requires circulation permission.

### Catalogue

`GET /books` returns `{ data: { items, pagination } }`. Book creation uses `bookSchema`; updates additionally accept lifecycle status (`active`, `archived`, `withdrawn`). Copy addition is limited to 1-50 copies per request. Catalogue reads are public under current route registration; sensitive writes require permissions.

`GET /fines` returns paginated records plus an aggregate `summary` with outstanding amount, open-record count, and total record count. `POST /payments` records a library payment entry and allocates it to fines; it is not an online payment transaction.

## Status and Error Notes

Validation errors return 422, CSRF/permission errors return 403, authentication errors return 401, missing records return 404, and business conflicts generally return 409. Generated API schemas and automated contract tests remain incomplete. Email-verification tokens have storage/schema support but no confirmation endpoint, so do not enable mandatory verification until that flow is completed.