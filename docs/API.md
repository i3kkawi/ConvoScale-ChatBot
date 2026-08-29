# API Documentation

Base URL (local): `http://localhost:4000`. All request/response bodies are JSON.

Every response follows one of these shapes:

```json
{ "success": true, "data": { ... } }
{ "success": true, "data": [ ... ], "pagination": { "limit": 20, "offset": 0, "total": 42 } }
{ "success": false, "error": { "code": "SOME_CODE", "message": "Human-readable explanation" } }
```

Authenticated routes require `Authorization: Bearer <token>`, where `<token>` comes from
`POST /auth/login`.

---

## Health

### `GET /health`
No auth. Returns `{ status, database, redis }`. `status` is `"ok"` only if both `database` and
`redis` are `"ok"`; otherwise `"degraded"` with HTTP 503.

---

## Auth

Rate-limited: 20 requests/min per IP (`AUTH_RATE_LIMIT_MAX`), shared between register and login.

### `POST /auth/register`
Body: `{ "email": string, "password": string (min 8 chars), "displayName"?: string }`
- `201` → `{ user: { id, email, displayName, createdAt } }`
- `409 EMAIL_TAKEN` if the email is already registered

### `POST /auth/login`
Body: `{ "email": string, "password": string }`
- `200` → `{ token, user: { id, email, displayName } }` — also creates a `Session` row
- `401 INVALID_CREDENTIALS` for either a wrong email or wrong password (deliberately the same
  error for both, so the response doesn't reveal which one was wrong)

### `POST /auth/logout`
Auth required.
- `200` → `{ loggedOut: true }` — deletes the `Session` row, revoking the token immediately even
  though the JWT itself would still cryptographically verify until it expires

### `GET /auth/me`
Auth required.
- `200` → `{ user: { id, email, displayName, createdAt } }`

---

## Conversations

All routes require auth. All routes check `conversation.userId === <the authenticated user>` and
return `404 NOT_FOUND` — not `403` — if it doesn't match, so a caller can't distinguish "doesn't
exist" from "exists but isn't yours."

### `POST /conversations`
Body: `{ "title"?: string }`
- `201` → `{ conversation }`

### `GET /conversations?limit=&offset=`
Limit/offset pagination (default `limit=20`, `offset=0`, max `limit=100`).
- `200` → `{ data: [conversation, ...], pagination: { limit, offset, total } }`, ordered by
  `lastMessageAt` descending

### `GET /conversations/:id`
- `200` → `{ conversation }`
- `404 NOT_FOUND`

### `PATCH /conversations/:id`
Body: `{ "title": string }`
- `200` → `{ conversation }`
- `404 NOT_FOUND`

### `DELETE /conversations/:id`
- `200` → `{ deleted: true }` — cascades to the conversation's messages
- `404 NOT_FOUND`

---

## Messages

All routes require auth and the same ownership check as conversations. Sending a message is
additionally rate-limited to 60/min **per user** (`MESSAGE_RATE_LIMIT_MAX`), independent of the
global IP-based limit.

### `POST /conversations/:id/messages`
Body: `{ "body": string (1-4000 chars), "requestId"?: string }`

- `201` → `{ userMessage, botMessage }` — created inside a single database transaction
- `200` with `{ userMessage, botMessage, deduplicated: true }` if `requestId` was already used —
  **this is not an error**, it's the idempotency guarantee working as intended (see
  `README.md` § Day 3)
- `404 NOT_FOUND` if the conversation isn't yours
- `429 RATE_LIMITED` if you've exceeded 60 sends/minute

### `GET /conversations/:id/messages?limit=&cursor=`
Keyset (cursor) pagination, newest-first (default `limit=20`, max `100`).
- `200` → `{ data: [message, ...], pagination: { limit, nextCursor } }`
- `nextCursor` is `null` on the last page; pass it back verbatim as `?cursor=` to get the next
  page — don't construct one manually, it's an opaque encoded value

---

## Error codes reference

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query/params failed schema validation |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired token, or a revoked session |
| `INVALID_CREDENTIALS` | 401 | Login email/password didn't match |
| `NOT_FOUND` | 404 | Resource doesn't exist, or exists but isn't yours |
| `EMAIL_TAKEN` | 409 | Registration with an already-used email |
| `RATE_LIMITED` | 429 | Exceeded a rate limit window — see `X-RateLimit-*` response headers |
| `INTERNAL_ERROR` | 500 | Unhandled server error — check server logs, nothing internal is exposed to the client |
