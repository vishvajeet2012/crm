# FASTOR7 CRM Backend

A production-style REST API for managing student course enquiries and counselor ownership. Students can submit enquiries without an account, while authenticated employees can view the shared unclaimed queue, atomically claim a lead, and access only their own claimed leads.

The central correctness guarantee is that one lead can have only one owner. Claiming is implemented as a single conditional MongoDB update, so simultaneous requests from different counselors cannot overwrite each other.

## Contents

- [Features](#features)
- [Technology](#technology)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running the application](#running-the-application)
- [API reference](#api-reference)
- [Authentication flow](#authentication-flow)
- [Lead lifecycle and ownership](#lead-lifecycle-and-ownership)
- [Concurrency-safe claiming](#concurrency-safe-claiming)
- [MongoDB indexing strategy](#mongodb-indexing-strategy)
- [Rate limiting](#rate-limiting)
- [Testing](#testing)
- [Index verification](#index-verification)
- [Postman collection](#postman-collection)
- [Security considerations](#security-considerations)
- [Common errors](#common-errors)

## Features

- Public student enquiry submission with strict Zod validation.
- Employee registration and login with normalized email addresses, bcrypt password hashing, and expiring JWTs.
- Authenticated, paginated views of unclaimed leads and the current employee's claimed leads.
- Course and age filters for the unclaimed queue.
- Single-document, atomic lead claiming with deterministic `409 Conflict` behavior for the losing requester.
- Real MongoDB unique and compound indexes designed around the API's filters and sort orders.
- Layered global and route-specific IP rate limiting.
- Helmet, configurable CORS, bounded JSON bodies, centralized errors, and production-safe responses.
- Integration tests using Supertest, Node.js's built-in test runner, and an isolated in-memory MongoDB.
- A standalone `explain("executionStats")` utility for examining query plans.
- An importable Postman Collection v2.1.

## Technology

- Node.js 22+
- Express.js with CommonJS modules
- MongoDB and Mongoose
- JSON Web Tokens (`jsonwebtoken`)
- `bcryptjs`
- Zod
- `helmet`, `cors`, `express-rate-limit`, and `morgan`
- Supertest and the Node.js built-in test runner
- `mongodb-memory-server` for isolated integration tests
- `nodemon` for local development

## Architecture

The application uses a small layered design:

- **Routes** define URLs and compose validation, authentication, and rate-limit middleware.
- **Controllers** translate HTTP requests into service calls and format responses.
- **Services** own authentication, lead querying, and atomic claim business logic.
- **Models** define persistence rules and database indexes.
- **Validators** define strict Zod schemas for bodies, path parameters, and query strings.
- **Middleware** handles cross-cutting concerns such as JWT verification and centralized errors.
- **Config and utilities** centralize environment parsing, database setup, JWT helpers, and response primitives.

`src/app.js` builds and exports the Express application without opening a socket. This makes the same app importable by Supertest. `src/server.js` validates startup configuration, connects to MongoDB, then starts listening and handles graceful shutdown.

All business endpoints are registered centrally below `/api/v1`. The unversioned `/health` route is intentionally limited to application health.

## Project structure

```text
.
├── src/
│   ├── config/
│   │   ├── cors.js
│   │   ├── db.js
│   │   └── env.js
│   ├── constants/
│   │   └── http-status.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── lead.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── error.middleware.js
│   │   ├── not-found.middleware.js
│   │   ├── rate-limit.middleware.js
│   │   └── validate.middleware.js
│   ├── models/
│   │   ├── employee.model.js
│   │   └── lead.model.js
│   ├── routes/
│   │   ├── index.js
│   │   └── v1/
│   │       ├── auth.routes.js
│   │       ├── index.js
│   │       └── lead.routes.js
│   ├── services/
│   │   ├── auth.service.js
│   │   └── lead.service.js
│   ├── utils/
│   │   ├── api-error.js
│   │   ├── api-response.js
│   │   ├── async-handler.js
│   │   └── jwt.js
│   ├── validators/
│   │   ├── auth.validator.js
│   │   └── lead.validator.js
│   ├── app.js
│   └── server.js
├── tests/
│   ├── auth.test.js
│   ├── concurrency.test.js
│   ├── leads.test.js
│   ├── rate-limit.test.js
│   └── setup.js
├── scripts/
│   └── verify-indexes.js
├── postman/
│   └── CRM.postman_collection.json
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Getting started

### Prerequisites

- Node.js 22 or newer
- npm
- A reachable MongoDB deployment for development and normal runtime

The automated test suite does not use the configured development or production database. It creates an isolated `mongodb-memory-server` instance.

### Install

```bash
npm install
```

Create a local environment file from the committed example:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Set a strong, private `JWT_SECRET` and point `MONGODB_URI` at a non-production development database before starting the server.

Example local MongoDB URI:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/fastor7_crm
```

## Environment variables

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime mode. Production mode suppresses internal error details. |
| `PORT` | `3000` | HTTP port used by `src/server.js`. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/fastor7_crm` | Canonical MongoDB connection string. Required for normal server startup. |
| `EC2_MONGO_URI` | unset | Legacy local compatibility fallback used only when `MONGODB_URI` is absent. New configuration should always use `MONGODB_URI`. |
| `JWT_SECRET` | no safe default | Secret used to sign and verify JWTs. It must contain at least 32 characters; use a long, random value and never commit it. |
| `JWT_EXPIRES_IN` | `1d` | Explicit JWT lifetime from 1 second through 10 years, such as `15m`, `1h`, or `1d`; a unitless value means seconds. |
| `CORS_ORIGIN` | `http://localhost:3000` | One allowed origin, a comma-separated allow-list, or `*`. Wildcard mode disables credentialed CORS. |
| `TRUST_PROXY` | `false` | Express proxy trust policy. Accepts false-like values, a hop count from 0 to 16, or Express-compatible names, addresses, CIDRs, and comma-separated lists. |
| `JSON_BODY_LIMIT` | `100kb` | Maximum accepted JSON request body size, using bytes, `kb`, or `mb` (capped at `10mb`). |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt work factor, validated from `10` through `15`. Tests use the low end of that range to keep isolated runs fast. |
| `GLOBAL_RATE_LIMIT_MAX` | `120` | Requests allowed by the global API limiter. |
| `GLOBAL_RATE_LIMIT_WINDOW_MS` | `900000` | Global window: 15 minutes. |
| `REGISTER_RATE_LIMIT_MAX` | `5` | Registration requests allowed per IP. |
| `REGISTER_RATE_LIMIT_WINDOW_MS` | `3600000` | Registration window: 1 hour. |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Login attempts allowed per IP. |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` | Login window: 15 minutes. |
| `PUBLIC_LEAD_RATE_LIMIT_MAX` | `20` | Public enquiry submissions allowed per IP. |
| `PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS` | `3600000` | Public enquiry window: 1 hour. |
| `CLAIM_RATE_LIMIT_MAX` | `60` | Claim requests allowed per IP. |
| `CLAIM_RATE_LIMIT_WINDOW_MS` | `60000` | Claim window: 1 minute. |

All numeric configuration is validated; rate-limit windows are capped at the maximum supported by the in-memory timer store (`2147483647ms`). A blanket `TRUST_PROXY=true` is accepted for local development and tests but rejected at production startup: trusting every upstream proxy allows clients to influence IP-derived controls when the network topology does not sanitize forwarding headers. In production, configure only the known proxy count, address, subnet, or named trust policy.

## Running the application

Development with automatic restarts:

```bash
npm run dev
```

Normal startup:

```bash
npm start
```

The server connects to MongoDB before accepting HTTP requests. `SIGINT` and `SIGTERM` trigger graceful HTTP shutdown and database disconnection.

Check application health:

```bash
curl http://localhost:3000/health
```

This repository provides application code and local tooling; it does not claim that a deployment has been completed.

## API reference

Base URL for business APIs: `http://localhost:3000/api/v1`

| Method | Endpoint | Authentication | Description | Success |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Public | Register an employee. | `201` |
| `POST` | `/api/v1/auth/login` | Public | Authenticate and return a JWT. | `200` |
| `POST` | `/api/v1/leads` | Public | Submit a student enquiry. | `201` |
| `GET` | `/api/v1/leads/unclaimed` | Bearer JWT | List the shared unclaimed queue. | `200` |
| `GET` | `/api/v1/leads/my-leads` | Bearer JWT | List only the authenticated employee's claimed leads. | `200` |
| `PATCH` | `/api/v1/leads/:id/claim` | Bearer JWT | Atomically claim an unclaimed lead. | `200` |
| `GET` | `/health` | Public | Basic service health. | `200` |

### Register an employee

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "Rahul Sharma",
  "email": "Rahul@example.com",
  "password": "StrongPass123!"
}
```

Email is trimmed and normalized to lowercase. A registration password must contain 8 through 72 characters, include at least one lowercase letter, one uppercase letter, and one number, and occupy no more than 72 UTF-8 bytes. The unique database index makes duplicate registration safe even if two matching requests race. `passwordHash` is never returned.

Example response:

```json
{
  "success": true,
  "message": "Employee registered successfully",
  "data": {
    "employee": {
      "_id": "670000000000000000000001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "createdAt": "2026-10-11T09:55:00.000Z",
      "updatedAt": "2026-10-11T09:55:00.000Z"
    }
  }
}
```

### Log in

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "rahul@example.com",
  "password": "StrongPass123!"
}
```

Example response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<signed-jwt>",
    "employee": {
      "_id": "670000000000000000000001",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "createdAt": "2026-10-11T09:55:00.000Z",
      "updatedAt": "2026-10-11T09:55:00.000Z"
    }
  }
}
```

### Create a public lead

```http
POST /api/v1/leads
Content-Type: application/json

{
  "name": "Ananya Singh",
  "email": "ananya@example.com",
  "phone": "+91 98765 43210",
  "courseInterest": "Node.js Backend",
  "age": 21,
  "message": "Please share the next batch schedule."
}
```

The API rejects unknown keys, including `status`, `claimedBy`, and `claimedAt`. Names must contain 2 through 100 characters; phone numbers, when present, contain 5 through 30 characters; age is an integer from 10 through 120; course interest is limited to 100 characters; and messages are limited to 2,000 characters. Email and course interest are trimmed and lowercased. Ownership fields are always assigned on the server. A new record is returned directly in `data` with `status: "unclaimed"`, `claimedBy: null`, and `claimedAt: null`.

### List unclaimed leads

```http
GET /api/v1/leads/unclaimed?page=1&limit=10&courseInterest=node.js%20backend&minAge=18&maxAge=25
Authorization: Bearer <token>
```

Query parameters:

| Parameter | Rules |
| --- | --- |
| `page` | Positive integer; defaults to `1`. |
| `limit` | Positive integer from `1` through `100`; defaults to `10`. |
| `courseInterest` | Optional normalized exact course filter. |
| `minAge` | Optional integer from `10` through `120`. |
| `maxAge` | Optional integer from `10` through `120`; must be greater than or equal to `minAge`. |

Only records matching both `status: "unclaimed"` and `claimedBy: null` are returned. Results are sorted by `createdAt` descending and then `_id` descending for deterministic ordering.

Paginated responses use a top-level metadata object:

```json
{
  "success": true,
  "message": "Unclaimed leads retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### List my claimed leads

```http
GET /api/v1/leads/my-leads?page=1&limit=10
Authorization: Bearer <token>
```

The employee identity comes exclusively from the verified token. A `claimedBy` query parameter is not accepted. Results match `claimedBy` and `status: "claimed"`, and are sorted by `claimedAt` descending with `_id` as the deterministic tie-breaker.

### Claim a lead

```http
PATCH /api/v1/leads/670000000000000000000010/claim
Authorization: Bearer <token>
```

Example success response:

```json
{
  "success": true,
  "message": "Lead claimed successfully",
  "data": {
    "_id": "670000000000000000000010",
    "name": "Ananya Singh",
    "email": "ananya@example.com",
    "phone": "+91 98765 43210",
    "courseInterest": "node.js backend",
    "age": 21,
    "message": "Please share the next batch schedule.",
    "status": "claimed",
    "claimedBy": "670000000000000000000001",
    "claimedAt": "2026-10-11T10:00:00.000Z",
    "createdAt": "2026-10-11T09:58:00.000Z",
    "updatedAt": "2026-10-11T10:00:00.000Z"
  }
}
```

Possible claim outcomes:

- `200 OK`: the conditional update succeeded.
- `400 Bad Request`: the path parameter is not a valid 24-character MongoDB ObjectId.
- `401 Unauthorized`: the bearer token is missing, invalid, expired, or belongs to an employee that no longer exists.
- `404 Not Found`: the ObjectId is valid but no lead exists.
- `409 Conflict`: the lead exists but has already been claimed, including a repeat attempt by its current owner.

## Authentication flow

1. Registration validates the payload, normalizes the email, hashes the password, and relies on a real unique email index to enforce identity uniqueness.
2. Login normalizes the email and compares the supplied password with the stored bcrypt hash.
3. A successful login signs an expiring JWT using `JWT_SECRET` and an explicitly allowed algorithm.
4. Protected routes require `Authorization: Bearer <token>`.
5. Authentication verifies the signature, algorithm, expiration, and referenced employee before attaching the identity to the request.
6. Lead ownership always comes from that verified identity. A client-supplied employee ID is never trusted.

## Lead lifecycle and ownership

```text
Public form submission
        │
        ▼
unclaimed
status="unclaimed", claimedBy=null, claimedAt=null
        │
        │ one successful atomic claim
        ▼
claimed
status="claimed", claimedBy=<employee ObjectId>, claimedAt=<timestamp>
```

All employees can see the same unclaimed queue. After a successful claim, the lead disappears from that queue and appears only in the winning employee's `my-leads` results. There is no API that transfers or overrides ownership.

## Concurrency-safe claiming

The claim service does not read a lead, modify it in JavaScript, and then save it. That sequence has a race window in which two workers can both observe the lead as unclaimed.

Instead, it sends one `findOneAndUpdate` operation with this logical condition:

```js
{
  _id: leadId,
  status: 'unclaimed',
  claimedBy: null
}
```

and this update:

```js
{
  $set: {
    status: 'claimed',
    claimedBy: authenticatedEmployeeId,
    claimedAt: now
  }
}
```

MongoDB serializes conflicting writes to the same document and re-evaluates the predicate. Exactly one concurrent requester can match the unclaimed state. Every later contender receives no updated document. A safe existence check then distinguishes a missing lead (`404`) from an existing, already-owned lead (`409`) without returning the other employee's private lead details.

This guarantee comes from MongoDB single-document atomicity, so it remains valid when requests are handled by different Node.js processes or application instances. An in-memory mutex or Redis lock would not improve this operation, and a multi-document transaction is unnecessary because ownership changes on only one lead document.

## MongoDB indexing strategy

The lead schema defines indexes around the Equality, Sort, Range (ESR) guideline and the API's exact sort orders.

| Query | Compound index | Rationale |
| --- | --- | --- |
| General unclaimed list | `{ status: 1, createdAt: -1, _id: -1 }` | Equality on `status`, followed by the complete deterministic sort. |
| Course-filtered unclaimed list | `{ status: 1, courseInterest: 1, createdAt: -1, _id: -1 }` | Equalities on status and normalized course, then sort. |
| Current employee's claimed list | `{ claimedBy: 1, status: 1, claimedAt: -1, _id: -1 }` | Equalities on owner and status, then claimed-time sort. |
| Course and age demonstration | `{ status: 1, courseInterest: 1, createdAt: -1, _id: -1, age: 1 }` | Equality fields, sort fields, then the age range field. |

Important qualifications:

- ESR is a planning guideline, not a promise that MongoDB will use a particular index.
- The trailing `age` key is an educational ESR example. Because `createdAt` and `_id` are not bounded by equality, applying the later age range can require scanning additional index keys. If age selectivity dominates, an ERS-shaped alternative may scan fewer keys but may require an in-memory sort. Measure both against representative production data before changing the design.
- The fourth index contains the course index as a prefix, so retaining both can be redundant for some workloads. Separate indexes may still be useful because the smaller index consumes less memory and write bandwidth. Actual query plans and operational measurements should decide whether the demonstration index remains worthwhile.
- Compound indexes support their leftmost prefixes; they do not make every subset or reordered field combination efficient.
- Every extra index adds storage cost and write amplification.
- MongoDB may reasonably choose a collection scan for a very small collection.
- The automatic `_id` index locates a lead for claiming. The listing indexes improve read performance; they are not what prevents double claims.

Normal application queries do not use `hint()`, leaving the query planner free to choose a plan based on MongoDB version, collection size, and data distribution.

## Rate limiting

The API uses independent global and route-specific IP limiters:

| Scope | Default allowance |
| --- | --- |
| All `/api/v1` requests | 120 requests per 15 minutes |
| Registration | 5 requests per hour |
| Login | 10 attempts per 15 minutes |
| Public enquiry submission | 20 requests per hour |
| Lead claim | 60 requests per minute |

A request to a specifically protected route intentionally consumes one entry in the global budget and one entry in that route's separate budget. It is not counted twice inside the same limiter. This provides broad abuse protection while keeping tighter limits around sensitive endpoints. Thresholds and windows are environment-configurable, allowing rate-limit tests to use small values without waiting for production windows.

When a limit is exceeded, the API responds with `429` and a consistent body:

```json
{
  "success": false,
  "message": "Too many requests. Please try again later."
}
```

Standard rate-limit headers are enabled, and `Retry-After` is supplied where supported.

The default store is in memory and is local to one Node.js process. It is appropriate for this assignment, but it cannot enforce one globally shared quota across horizontally scaled instances and resets when a process restarts. A production multi-instance deployment should use a supported shared store such as Redis. Redis is intentionally outside this project's scope. Rate limiting is an abuse control and is independent of MongoDB's atomic claim guarantee.

## Testing

Run the complete suite:

```bash
npm test
```

Run only the critical race test:

```bash
npm run test:concurrency
```

The integration suite covers:

- Registration, normalized duplicate emails, login, and invalid credentials.
- Public lead creation and server-owned default state.
- JWT enforcement on protected listings and claims.
- Shared visibility before claiming and owner-only visibility after claiming.
- Course filtering, pagination, deterministic sorting, and invalid input.
- Invalid and nonexistent lead IDs.
- Configurable `429` behavior.
- Two parallel claim requests from distinct authenticated employees.

The concurrency test sends both claim requests with `Promise.all`, without artificial sleeps. It asserts one `200`, one `409`, reads the final MongoDB record, and verifies that `claimedBy` matches the successful requester's employee ID. It does not assume which requester wins.

Tests use a newly created `mongodb-memory-server` database and must never point destructive setup or cleanup at a production URI. On its first run, the package may need to download a MongoDB binary. If the environment blocks that download and has no cached binary, the suite cannot start; report that environmental limitation instead of claiming a passing run.

## Index verification

Point `MONGODB_URI` at the database whose plans you want to inspect, then run:

```bash
npm run verify:indexes
```

The standalone script prints the collection's real indexes and runs `explain("executionStats")` for representative:

- General unclaimed-list query.
- Course-filtered unclaimed-list query.
- Authenticated employee's claimed-leads query.
- Course-filtered unclaimed query with an age range, demonstrating the fourth ESR index and its tradeoff.

The script chooses representative values from existing data when possible. You can override its inputs with `VERIFY_COURSE_INTEREST`, `VERIFY_EMPLOYEE_ID`, `VERIFY_MIN_AGE`, `VERIFY_MAX_AGE`, and `VERIFY_EXPLAIN_LIMIT`. `VERIFY_INDEX_DATABASE` selects a database name independently of the URI, and `MONGODB_SERVER_SELECTION_TIMEOUT_MS` controls connection selection timeout. Like the application, the script accepts `EC2_MONGO_URI` only as a legacy fallback when `MONGODB_URI` is absent.

Review:

- The winning plan and its stages, such as `IXSCAN`, `FETCH`, `SORT`, or `COLLSCAN`.
- `nReturned`.
- `totalKeysExamined`.
- `totalDocsExamined`.
- Whether a blocking `SORT` appears.

Low examined-to-returned ratios are generally desirable, but no single number proves an index is correct. A `COLLSCAN` can be rational on a tiny dataset, and a query planner may change its choice as data distribution and collection size evolve. The script reports actual results; it does not manufacture metrics or force production queries with `hint()`.

Run index verification only against a database you are authorized to inspect. It is not part of normal server startup.

## Postman collection

Import [`postman/CRM.postman_collection.json`](postman/CRM.postman_collection.json) into Postman. The Collection v2.1 includes:

- Employee Register
- Employee Login
- Create Public Lead
- Get Unclaimed Leads
- Get My Claimed Leads
- Claim Lead
- An ordered **Employee A / Employee B Claim Demo** folder

Collection variables:

- `baseUrl` — defaults to `http://localhost:3000`.
- `token` — populated by the standard login test script.
- `tokenA` and `tokenB` — populated independently by the two demo login scripts.
- `leadId` — populated by the public lead creation scripts.
- `page`, `limit`, and `courseInterest` — reusable list-query values.
- Employee, student, and Employee A/B name, email, and password values used by the example bodies.

For a two-counselor conflict demonstration:

1. Run the two registration requests; `409` is accepted if the demo accounts already exist.
2. Run both login requests to capture `tokenA` and `tokenB` without overwriting either value.
3. Create the shared public lead to refresh `leadId`.
4. Run Employee A's claim, which returns `200` for the fresh lead.
5. Run Employee B's claim against the same `leadId`, which returns `409` and confirms that ownership was not overwritten.

The automated concurrency test is the reliable way to send the requests in parallel; the Postman flow is useful for manual inspection.

## Security considerations

- Passwords are never stored in plaintext. bcrypt hashes are excluded from API responses and normal model selections.
- Employee emails are normalized before registration and login, then protected by a database-level unique index.
- JWT verification constrains the signing algorithm and validates expiration and employee existence.
- Ownership is derived only from the verified token.
- Strict schemas reject unknown and unauthorized fields as well as oversized, malformed, or unrealistic input.
- `helmet` supplies common defensive HTTP headers.
- CORS is allow-list driven through configuration.
- JSON bodies have a configurable size ceiling.
- Rate limiting provides basic abuse protection.
- Error handling avoids returning stack traces in production.
- Passwords and bearer tokens must not be written to logs.
- Secrets belong in the uncommitted `.env` file or a deployment secret manager, never in source control.

## Common errors

Error responses follow a consistent base envelope:

```json
{
  "success": false,
  "message": "Human-readable error message"
}
```

Validation responses may also include structured field details. They never include passwords, JWT secrets, stack traces in production, or another counselor's private lead data.

| Status | Typical meaning |
| --- | --- |
| `400 Bad Request` | Malformed JSON, invalid lead ObjectId, or an otherwise malformed request. |
| `401 Unauthorized` | Missing, malformed, invalid, expired, or orphaned bearer token; invalid login credentials. |
| `403 Forbidden` | A browser origin is not included in the configured CORS allow-list. |
| `404 Not Found` | Unknown route or valid lead ID that does not exist. |
| `409 Conflict` | Duplicate normalized employee email or an already-claimed lead. |
| `413 Payload Too Large` | JSON request body exceeds `JSON_BODY_LIMIT`. |
| `422 Unprocessable Entity` | Zod validation failure for a syntactically valid request. |
| `429 Too Many Requests` | Global or endpoint-specific request quota exceeded. |
| `500 Internal Server Error` | Unexpected server failure; internal details are suppressed in production. |

Unknown routes are handled by the same centralized JSON error path, and asynchronous controller failures are forwarded to it rather than becoming unhandled promise rejections.
