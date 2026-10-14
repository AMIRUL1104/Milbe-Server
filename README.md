# Milbe Backend

### Live Link --- [View Live Application](https://milbe.vercel.app)

Backend API for **Milbe** — a student-to-student academic book marketplace for Bangladesh. This API handles authentication, book listings, request workflows, dashboards, and admin management.

---

## Project Overview

Milbe connects students who have completed courses with those who need affordable textbooks for upcoming semesters. The backend provides a REST API that powers the frontend marketplace, managing users, book posts, purchase/donation requests, and platform administration.

**Core Responsibilities:**

- User authentication & session management (Better Auth compatible)
- Book post CRUD with search, filtering, and pagination
- Book request lifecycle (create → accept/reject/cancel with cascading status updates)
- Role-based access control (User / Admin)
- Dashboard analytics for users and administrators
- MongoDB data persistence with native driver

---

## Key Features

| Category                    | Capabilities                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**          | Bearer token validation, session expiry checks, user blocking, role extraction                                                  |
| **Authorization**           | Role-based middleware (`user`, `admin`), route-level protection                                                                 |
| **Book Posts**              | Create, read, update, soft-delete; search by Bengali, English, or Banglish title/book name/author/publisher; filter by condition, type (sell/donate), sort; pagination |
| **Book Requests**           | Send requests; duplicate prevention; seller accept/reject; auto-cancel competing requests; restore availability on cancellation |
| **Email Notifications**    | Durable outbox for 1st/5th/10th request milestones and accepted requests; retryable SMTP delivery |
| **User Dashboard**          | Active posts, pending requests, books sold/donated, recent activity                                                             |
| **Admin Dashboard**         | Total users, active posts, recent platform activity (registrations, posts, requests)                                            |
| **User Management (Admin)** | List users with search, role filter, pagination                                                                                 |
| **Post Management (Admin)** | View all posts, soft-delete inappropriate listings                                                                              |

---

## Tech Stack

| Layer             | Technologies                                |
| ----------------- | ------------------------------------------- |
| **Runtime**       | Node.js (ES Modules)                        |
| **Framework**     | Express.js 5                                |
| **Language**      | TypeScript (strict mode)                    |
| **Database**      | MongoDB (native driver v7)                  |
| **Validation**    | Manual query/body validation in controllers |
| **Configuration** | dotenv                                      |
| **CORS**          | cors (credentials enabled)                  |
| **Development**   | tsx (watch mode)                            |
| **Build**         | tsc (declaration maps, source maps)         |

---

## Architecture

The backend follows a **modular, layered architecture** with clear separation of concerns:

```
src/
├── app.ts                 # Express app setup, middleware, route mounting
├── server.ts              # Entry point, DB connection, server startup
├── routes/                # Route definitions (thin, middleware composition)
│   ├── index.ts           # Route aggregation
│   ├── user.route.ts
│   ├── post.route.ts
│   ├── bookRequest.route.ts
│   └── dashboard.route.ts
├── controllers/           # Request handling, business logic, response formatting
│   ├── user.controller.ts
│   ├── post.controller.ts
│   ├── bookRequest.controller.ts
│   └── dashboard.controller.ts
├── middleware/            # Reusable request processing
│   ├── auth.middleware.ts    # Token verification, session validation
│   └── role.middleware.ts    # Role-based access control
├── database/              # Data access layer
│   ├── index.ts           # MongoClient connection
│   ├── collections.ts     # Typed collection references
│   └── dashboard.database.ts # Aggregation queries for dashboards
└── types/                 # TypeScript interfaces
    ├── auth.types.ts
    ├── post.types.ts
    ├── bookRequest.types.ts
    ├── dashboard.types.ts
    └── user.types.ts
```

### Request Lifecycle

```
Request → CORS → JSON Body Parser → Route Middleware
  → verifyToken (validates Bearer token, loads user from session)
  → verifyUser / verifyAdmin (role check)
  → Controller (business logic, DB operations)
  → JSON Response
```

---

## Authentication & Authorization

### Authentication Flow

1. Frontend obtains session via Better Auth (email/password)
2. Requests include `Authorization: Bearer <token>` header
3. `verifyToken` middleware:
   - Extracts token from header
   - Looks up session in `session` collection
   - Validates expiry (`expiresAt > now`)
   - Fetches user from `user` collection
   - Checks `isBlocked` flag
   - Attaches `req.user` (AuthUser) to request
4. Protected routes proceed; invalid/expired tokens return `401`

### Authorization (Role-Based)

- **`verifyUser`** — Allows only `role === "user"`
- **`verifyAdmin`** — Allows only `role === "admin"`
- Applied per-route in route files

### AuthUser Shape

```typescript
interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isBlocked: boolean;
  emailVerified: boolean;
}
```

---

## Database

**MongoDB** with native driver (v7). Collections defined in `src/database/collections.ts`:

| Collection          | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `user`              | Core user accounts (managed by Better Auth)                         |
| `userProfile`       | Extended profile (phone, district, area, avatar, role, memberSince) |
| `session`           | Active sessions with token, userId, expiresAt                       |
| `posts`             | Book listings with embedded `books` array                           |
| `imageAssets`       | Cloudinary asset ownership, lifecycle state, attachment, and cleanup retry metadata |
| `bookRequests`      | Request records linking requester, seller, post                     |
| `publishers`        | (Reserved) Publisher information                                    |
| `pendingPublishers` | (Reserved) Pending publisher approvals                              |
| `emailOutbox`       | Transactional notification events and Brevo API delivery/retry state |

### Request email rollout

Before deploying this request lifecycle version, resolve any duplicate
`bookRequests` records with the same `postId` and `requesterId`, then run:

```sh
npm run backfill:request-milestones
```

Stop the old backend while running the migration so request creation cannot
race the count backfill. Run the migration before starting the upgraded
backend or routing traffic to it.

The migration initializes each post's request count from all existing request
statuses, records whether a request has ever been accepted, and creates the
request/outbox indexes. It stops without updating posts when duplicate request
pairs are found. MongoDB must support multi-document transactions.

Configure `BREVO_API_KEY` and `EMAIL_FROM` in the backend environment.
`EMAIL_FROM` must identify a sender verified in Brevo; it accepts either
`Milbe <no-reply@example.com>` or a bare email address. Production startup
requires both values. In development/test, if Brevo is not configured, API
operations continue and email events remain queued. The frontend base URL is
read from `CLIENT_URL`.

Milestone delivery is attempted at request counts 1, 5, and 10 only. Requests
in any status remain part of the count. Accepted posts suppress unsent
milestone messages. A retry may cause duplicate delivery if Brevo accepted a
message but the backend failed before recording it as sent; the outbox does not
provide exactly-once delivery.

The backend request-notification worker uses Brevo's HTTP API. Frontend
Better Auth emails (verification, password reset, and account alerts) use a
separate frontend mail flow and are not configured by these backend variables.

### Key Data Models

**Post** (`src/types/post.types.ts`)

```typescript
interface Post {
  _id?: ObjectId;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  title: string;
  type: "sell" | "donate";
  image?: string;
  district: string;
  area: string;
  phone?: string;
  messenger?: string;
  whatsappOnly?: boolean;
  description?: string;
  category?: string;
  status: "available" | "requested" | "sold";
  isDeleted?: boolean;
  books: PostBook[]; // Multiple books per post
  publishedAt: Date;
  updatedAt?: Date;
}
```

**BookRequest** (`src/types/bookRequest.types.ts`)

```typescript
interface BookRequest {
  _id?: ObjectId;
  postId: string;
  postTitle: string;
  bookCoverUrl: string;
  sellerId: string;
  sellerName: string;
  sellerContact?: { phone?: string; messenger?: string };
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  requesterContact?: { phone?: string };
  message?: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  requestDate: Date;
  createdAt: Date;
  updatedAt?: Date;
}
```

---

## API Documentation

All endpoints prefixed with `/api`.

### Authentication

| Method | Endpoint | Description  | Auth |
| ------ | -------- | ------------ | ---- |
| GET    | `/`      | Health check | —    |

### Users (`/api/users`)

| Method | Endpoint | Description                           | Auth | Role  |
| ------ | -------- | ------------------------------------- | ---- | ----- |
| POST   | `/`      | Create user profile (on signup)       | ✓    | user  |
| GET    | `/`      | Get own profile                       | ✓    | user  |
| PATCH  | `/me/profile` | Update own profile and image asset reference | ✓ | user |
| GET    | `/admin` | List users (search, filter, paginate) | ✓    | admin |
| DELETE | `/:id`   | Delete user                           | ✓    | user  |

### Posts (`/api/posts`)

| Method | Endpoint    | Description                                   | Auth | Role  |
| ------ | ----------- | --------------------------------------------- | ---- | ----- |
| POST   | `/`         | Create post                                   | ✓    | user  |
| GET    | `/`         | Browse posts (search, filter, sort, paginate) | —    | —     |
| GET    | `/featured` | Latest 8 available posts                      | —    | —     |
| GET    | `/my`       | Get own posts                                 | ✓    | user  |
| GET    | `/admin`    | Get all posts (admin)                         | ✓    | admin |
| GET    | `/:id`      | Get single post                               | —    | —     |
| PATCH  | `/:id`      | Update own post                               | ✓    | user  |
| DELETE | `/:id`      | Soft-delete own post                          | ✓    | user  |

Post creation, editing, and soft deletion update image asset references transactionally. Cloudinary deletion runs after the database commit; failed cleanup is queued for retry.

### Images (`/api/images`)

| Method | Endpoint | Description | Auth |
| ------ | -------- | ----------- | ---- |
| POST | `/` | Upload a post/profile image as multipart data; returns an application asset ID and secure URL | ✓ |
| DELETE | `/:assetId` | Delete the authenticated user's unattached pending upload | ✓ |

The backend stores Cloudinary `public_id` values in `imageAssets`; clients cannot submit a Cloudinary public ID to delete an attached image. Post/profile updates attach a new image and detach the old image in a MongoDB transaction, then remove the old remote asset after commit. A scheduled worker retries failed remote cleanup. Existing ImgBB URLs are retained for display and are not migrated or deleted.

**Browse Query Parameters:**

- `search` — text search (title, category, book names, publisher)
- `category` — exact category match (case-insensitive)
- `condition` — book condition filter
- `listingType` — `sell` or `donate`
- `sort` — `newest`, `oldest`, `title-asc`, `title-desc`
- `page`, `limit` — pagination (default 1/20, max 50)

### Book Requests (`/api/book-requests`)

| Method | Endpoint      | Description                                      | Auth | Role |
| ------ | ------------- | ------------------------------------------------ | ---- | ---- |
| POST   | `/`           | Send request                                     | ✓    | user |
| GET    | `/sent`       | Get own sent requests                            | ✓    | user |
| GET    | `/received`   | Get requests on own posts                        | ✓    | user |
| GET    | `/check`      | Check if can request (prevents duplicates)       | —    | —    |
| PATCH  | `/:id/accept` | Accept request (marks post sold, cancels others) | ✓    | user |
| PATCH  | `/:id/reject` | Reject request                                   | ✓    | user |
| PATCH  | `/:id/cancel` | Cancel request (restores post availability)      | ✓    | user |

**Check Request Query:** `postId`, `requesterId`, `sellerId`

### Dashboard (`/api/dashboard`)

| Method | Endpoint | Description                      | Auth | Role  |
| ------ | -------- | -------------------------------- | ---- | ----- |
| GET    | `/user`  | User dashboard stats & activity  | ✓    | user  |
| GET    | `/admin` | Admin dashboard stats & activity | ✓    | admin |

**User Dashboard Response:**

```json
{
  "activePosts": 5,
  "pendingRequests": 2,
  "booksSold": 12,
  "booksDonated": 3,
  "recentActivities": [...]
}
```

**Admin Dashboard Response:**

```json
{
  "totalUsers": 1250,
  "activePosts": 340,
  "pendingReviews": 0,
  "knowledgeBaseCount": 0,
  "recentActivities": [...]
}
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?appName=Cluster0
CLIENT_URL=http://localhost:3000
NODE_ENV=development
TRANSLATION_PROVIDER=mymemory
MYMEMORY_ENDPOINT=https://api.mymemory.translated.net/get
MYMEMORY_EMAIL=your-email@example.com
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Post URL slugs and canonical `searchKeywords` are generated when a post is
created or when its title or book name, author, or publisher changes. Each
searchable value retains its original text and receives a Bengali/English
translation plus Banglish transliteration when applicable. If translation is
unavailable, the original text remains searchable. Search requests query
`searchKeywords` and legacy searchable fields; translations are not requested
while handling search requests. The URL `slug` remains separate from search
metadata.

To populate the canonical `searchKeywords` array on existing posts, run this
idempotent backfill after deploying the backend:

```bash
npm run backfill:post-search
```

| Variable               | Required                          | Description                                                               |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `PORT`                 | No (default 4000)                 | Server port                                                               |
| `MONGODB_URI`          | **Yes**                           | MongoDB connection string                                                 |
| `CLIENT_URL`           | Yes                               | Frontend origin for CORS                                                  |
| `NODE_ENV`             | No                                | Environment name (development/production)                                 |
| `TRANSLATION_PROVIDER` | No (default `mymemory`)           | Provider used for Bengali ↔ English post metadata translation            |
| `MYMEMORY_ENDPOINT`    | No (translation falls back if unset) | MyMemory translation API endpoint                                      |
| `MYMEMORY_EMAIL`       | No                                | MyMemory account email (identified usage raises the anonymous rate limit) |
| `CLOUDINARY_CLOUD_NAME` | Required for image operations | Cloudinary cloud identifier |
| `CLOUDINARY_API_KEY`   | Required for image operations | Server-only Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Required for image operations | Server-only Cloudinary API secret; never expose in frontend configuration |

---

## Local Development

### Prerequisites

- Node.js 22+
- npm
- MongoDB database (local or Atlas)

### Setup

```bash
# Clone repository
git clone https://github.com/AMIRUL1104/Mission-Tracker-server.git
cd Mission-Tracker-server

# Install dependencies
npm install

# Configure environment
# Create .env file with required variables (see Environment Variables section)

# Start development server (with hot reload)
npm run dev
```

Server runs at `http://localhost:4000` (or configured PORT).

### Available Scripts

| Command         | Description                                |
| --------------- | ------------------------------------------ |
| `npm run dev`   | Start dev server with tsx watch mode       |
| `npm run build` | Compile TypeScript to `dist/`              |
| `npm start`     | Run production build from `dist/server.js` |
| `npm test`      | Not configured                             |

---

## Production Deployment

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Requirements

- Node.js 18+ on target environment
- MongoDB accessible via `MONGODB_URI`
- `CLIENT_URL` set to production frontend URL
- `NODE_ENV=production` recommended

### Verified Deployment

The frontend (https://milbe.vercel.app) communicates with a production instance of this API.

---

## Engineering Highlights

- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Native MongoDB Driver** — No ORM overhead; direct collection access with typed generics
- **Layered Separation** — Routes → Controllers → Database layer; each independently testable
- **Soft Deletes** — Posts marked `isDeleted: true` instead of hard removal
- **Cascading Request Logic** — Accepting a request auto-cancels competing requests and marks post sold; cancelling restores availability
- **Duplicate Prevention** — `checkBookRequest` endpoint prevents double-requests
- **Session-Based Auth** — Stateless token validation against MongoDB sessions
- **Role Middleware** — Composable `verifyUser` / `verifyAdmin` for route-level RBAC
- **Safe Date Handling** — `safeISO()` utility prevents `toISOString()` crashes on malformed dates
- **Query Validation** — Centralized helpers (`getPositiveInteger`, `escapeRegex`) for consistent pagination/search
- **ES Modules** — `"type": "module"` with `nodenext` resolution

---

## Project Structure Summary

```
bookbridge-server/
├── src/
│   ├── app.ts                 # Express setup
│   ├── server.ts              # Entry point
│   ├── routes/                # 5 route modules
│   ├── controllers/           # 4 controller modules
│   ├── middleware/            # auth, role
│   ├── database/              # connection, collections, aggregations
│   └── types/                 # 5 type definition files
├── dist/                      # Compiled output (gitignored)
├── package.json
├── tsconfig.json
└── .env                       # Not committed
```

---

## Related Repositories

- **Frontend**: https://github.com/AMIRUL1104/Milbe
- **Backend (this repo)**: https://github.com/AMIRUL1104/Milbe-Server

---

## License

This project is created for educational purposes.
