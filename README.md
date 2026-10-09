# Task Management System

## Project Overview

The **Task Management System** is a backend RESTful API service built with Node.js, Express, PostgreSQL, and Prisma ORM. The system is designed to support role-based task workflows with two distinct roles: regular users (`USER`) and administrators (`ADMIN`). Regular users manage their own personal tasks and view tasks assigned to them, while administrators oversee system-wide tasks and manage team task assignments.

## Technology Stack

- **Runtime Environment:** Node.js (v20+)
- **Web Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma ORM (v7)
- **Database Driver:** `@prisma/adapter-pg` & `pg`
- **Password Hashing:** `bcrypt`
- **Authentication & Tokens:** `jsonwebtoken` (JWT)
- **Environment Management:** `dotenv`
- **Development Tooling:** `nodemon`

## Database

The application utilizes **PostgreSQL** as its relational database management system, paired with **Prisma ORM** for schema definition, type safety, and database migrations.

- **PostgreSQL:** Handles relational data integrity, foreign key constraints, cascading deletions, and transactional consistency.
- **Prisma ORM:** Provides declarative schema modeling, database migrations, and an intuitive client API with native driver adapter support.

## Database Schema

The database design consists of three core relational tables:

### 1. `users`
Stores user profile, authentication, and role information.
- `id`: Auto-incrementing primary key (`Int`).
- `name`: User's full name (`String`).
- `email`: Unique email address (`String`).
- `password`: Hashed password (`String`).
- `role`: Role enum value (`USER` or `ADMIN`, default: `USER`).
- `created_at`: Account creation timestamp.
- `updated_at`: Account last update timestamp.

### 2. `tasks`
Stores tasks created within the system.
- `id`: Auto-incrementing primary key (`Int`).
- `user_id`: Foreign key referencing the creator (`users.id`).
- `title`: Short task title (`String`).
- `description`: Optional detailed description (`String?`).
- `status`: Task status enum (`Pending`, `In Progress`, `Testing`, `Completed`, default: `Pending`).
- `created_at`: Task creation timestamp.
- `updated_at`: Task last update timestamp.

### 3. `task_assignments`
Join table supporting many-to-many relationships between tasks and assignees.
- `id`: Auto-incrementing primary key (`Int`).
- `task_id`: Foreign key referencing `tasks.id`.
- `user_id`: Foreign key referencing `users.id`.
- Unique constraint on `(task_id, user_id)` to prevent duplicate task assignments.

---

### Task Creator vs. Task Assignees

Understanding the distinction between `tasks.user_id` and `task_assignments.user_id` is central to the system's business rules:

- **Task Creator (`tasks.user_id`):**
  Represents the user who originally created the task. A regular user can only create personal tasks (where they are both creator and assignee). An administrator can create team tasks or personal tasks.
- **Task Assignees (`task_assignments.user_id`):**
  Represents users who are assigned to work on or view the task. For team tasks created by an admin, multiple regular users can be assigned via separate records in `task_assignments`.

## Environment Variables

Configuration is loaded from environment variables using `dotenv`. A template is provided in `.env.example`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/DATABASE_NAME?schema=public"
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=1h
```

> **Note:** Never commit actual `.env` files containing real database passwords, JWT secrets, or sensitive credentials to version control.

## Database Setup

To set up the database and run the application locally:

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and update `DATABASE_URL` with your local PostgreSQL credentials:
```bash
# Example format
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/task_management_db?schema=public"
JWT_SECRET=your_secret_key_for_development
JWT_EXPIRES_IN=1h
```

### 3. Run Prisma Migrations
Apply the initial migration to create the tables, enums, and foreign-key constraints in PostgreSQL:
```bash
npx prisma migrate dev --name init
```
*(If the database `task_management_db` does not exist yet, Prisma will automatically prompt to create it.)*

Alternatively, to deploy existing migrations:
```bash
npx prisma migrate deploy
```

### 4. Generate the Prisma Client
Generate the Prisma Client whenever the schema is updated:
```bash
npx prisma generate
```

### 5. Seed the Database
Populate the database with initial development and testing users:
```bash
npm run db:seed
# or
npx prisma db seed
```

## Test Credentials

> **Notice:** The following credentials are provided strictly for **development and testing purposes**.

### ADMIN
- **Email:** `admin@example.com`
- **Password:** `Admin@123`
- **Role:** `ADMIN`

### REGULAR USER
- **Email:** `user@example.com`
- **Password:** `User@123`
- **Role:** `USER`

### Seeding Notes
- All passwords in the database are securely hashed using **bcrypt** (salt rounds = 10) before insertion. Plaintext passwords are never stored in the database.
- The seed script (`prisma/seed.js`) uses an **idempotent upsert operation** keyed on user email. It is completely safe to run repeatedly without creating duplicate accounts or violating unique constraints.

## Authentication APIs

### 1. Register User

Creates a new regular user account in the system.

- **Method:** `POST`
- **Endpoint:** `/api/auth/register`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "name": "Rahul Sharma",
  "email": "rahul@gmail.com",
  "password": "Rahul@123"
}
```

#### Successful Response (`201 Created`)
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "id": 3,
    "name": "Rahul Sharma",
    "email": "rahul@gmail.com",
    "role": "USER"
  }
}
```

#### Validation Rules & Error Responses
- **Missing or empty `name`:** Returns `400 Bad Request` (`Name is required and must be a non-empty string`).
- **Missing or invalid `email`:** Returns `400 Bad Request` (`Email is required` or `Invalid email format`).
- **Missing or weak `password`:** Returns `400 Bad Request` (`Password is required` or `Password must be at least 6 characters long`). Minimum password requirement is 6 characters.

#### Duplicate Email Handling (`409 Conflict`)
If an account already exists with the normalized email:
```json
{
  "success": false,
  "message": "Email is already registered"
}
```

---

### 2. Login User

Authenticates existing users and returns a signed JSON Web Token (JWT).

- **Method:** `POST`
- **Endpoint:** `/api/auth/login`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```
*or:*
```json
{
  "email": "user@example.com",
  "password": "User@123"
}
```

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "name": "System Admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Validation Errors (`400 Bad Request`)
- **Missing `email`:** Returns `400 Bad Request` (`Email is required`).
- **Invalid `email` pattern:** Returns `400 Bad Request` (`Invalid email format`).
- **Missing `password`:** Returns `400 Bad Request` (`Password is required`).

#### Invalid Credentials (`401 Unauthorized`)
If the user is not found or the password does not match the bcrypt hash:
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```
*Note:* The generic error prevents username enumeration by never revealing whether the email exists.

---

### 3. Verify Authenticated User (Assessment Verification Endpoint)

Returns the authenticated user's profile details. Protected by the JWT authentication middleware.

- **Method:** `GET`
- **Endpoint:** `/api/auth/me`
- **Headers:** `Authorization: Bearer <JWT>`

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "name": "System Admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    }
  }
}
```

## JWT Authentication Middleware

The `authenticate` middleware (`src/middleware/authenticate.js`) verifies and identifies callers on protected routes:

### 1. Authorization Header Format
Protected endpoints require an `Authorization` header formatted as a Bearer token:
```http
Authorization: Bearer <JWT>
```

### 2. Bearer Token Validation & Extraction
- Verifies that the `Authorization` header is present and starts with `Bearer `.
- Rejects missing headers or non-Bearer schemes (e.g. `Basic`, raw tokens) with `401 Unauthorized` (`Authentication required: Missing Authorization header` / `Authentication required: Invalid Bearer token format`).

### 3. Cryptographic Signature & Expiration Verification
- Verifies tokens using `jsonwebtoken.verify()` against `process.env.JWT_SECRET`.
- Cryptographically rejects invalid signatures, malformed tokens, and expired tokens with a safe `401 Unauthorized` (`Invalid or expired token`).

### 4. Database User Lookup & Identity Integrity
- After token verification, extracts `userId` and queries PostgreSQL using Prisma to confirm the user exists and is active.
- If the account no longer exists in PostgreSQL, rejects with `401 Unauthorized` (`Authentication invalid: User does not exist`).

### 5. Safe `req.user` Attachment
- Attaches the verified database user to `req.user`:
  ```javascript
  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  }
  ```
- **Passwords and password hashes are strictly omitted from `req.user`.**
- Makes the authenticated user's role accessible via `req.user.role` for downstream handlers.

### 6. Architectural Boundary
- The `authenticate` middleware strictly answers **"Who is this user?"**
- Role-based authorization (**"Is this user allowed to perform this action?"**) is decoupled into a dedicated `authorize` middleware layer.
- Public routes (`/api/health`, `/api/auth/register`, `/api/auth/login`) remain accessible without tokens.

## Role-Based Authorization

The `authorize` middleware (`src/middleware/authorize.js`) enforces access restrictions based on the authenticated user's role:

### 1. Authentication vs. Authorization

- **Authentication (`authenticate`):** Answers *"Who is the user making this request?"* It validates the JWT token, looks up the user in PostgreSQL, and attaches the safe profile to `req.user`.
- **Authorization (`authorize`):** Answers *"Does this authenticated user have permission to access this resource?"* It verifies that `req.user.role` matches one of the required roles for the endpoint.

### 2. HTTP Status Code Distinction: 401 vs. 403

- **`401 Unauthorized`:** Returned when authentication is missing, invalid, or expired. The user's identity is not established.
  ```json
  {
    "success": false,
    "message": "Authentication required"
  }
  ```
- **`403 Forbidden`:** Returned when the user is successfully authenticated, but their role does not have the necessary permissions.
  ```json
  {
    "success": false,
    "message": "Access denied"
  }
  ```

### 3. Middleware Design & Usage

The `authorize` middleware is reusable, lightweight, and supports single or multiple allowed roles:

```javascript
// Single role:
router.get('/admin-test', authenticate, authorize('ADMIN'), adminController);

// Multiple allowed roles:
router.get('/tasks', authenticate, authorize('ADMIN', 'USER'), taskController);
// or: authorize(['ADMIN', 'USER'])
```

### 4. Middleware Execution Order

Authentication **must** precede authorization. Authorization strictly depends on `req.user` populated by `authenticate`:

```text
Request
   ↓
authenticate          // Validates JWT, sets req.user from PostgreSQL
   ↓
req.user              // Safe user identity: { id, name, email, role }
   ↓
authorize(...)        // Validates req.user.role against allowed roles
   ↓
permission check      // Allows next() if authorized, returns 403 if forbidden
   ↓
controller            // Executes route business logic
```

If `authorize` is called without `authenticate` having populated `req.user`, it safely returns `401 Unauthorized` without assuming the caller is authenticated.

### 5. Supported Roles & Database Integrity

The application strictly enforces the existing database roles:
- `ADMIN`
- `USER`

The authoritative role is retrieved directly from the PostgreSQL database lookup during authentication (`req.user.role`). Roles supplied via request bodies, query strings, URL parameters, or custom HTTP headers (e.g. `X-Role`) are completely ignored and cannot override the database role.

### 6. Assessment Verification Endpoints

Because task APIs have not been implemented yet, two minimal assessment verification endpoints are provided to demonstrate and test authorization in isolation:

#### `GET /api/auth/admin-test`
- **Purpose:** Assessment verification endpoint for `ADMIN`-only authorization.
- **Middleware Chain:** `authenticate`, `authorize('ADMIN')`
- **Expected Access:**
  - `ADMIN` token → `200 OK` (`Admin authorization successful`)
  - `USER` token → `403 Forbidden` (`Access denied`)
  - No token / Invalid token → `401 Unauthorized`

#### `GET /api/auth/user-test`
- **Purpose:** Assessment verification endpoint for `USER`-only authorization.
- **Middleware Chain:** `authenticate`, `authorize('USER')`
- **Expected Access:**
  - `USER` token → `200 OK` (`User authorization successful`)
  - `ADMIN` token → `403 Forbidden` (`Access denied`)
  - No token / Invalid token → `401 Unauthorized`

> **Note:** These endpoints exist strictly to verify that the authentication and authorization middlewares function properly. They contain no task or business logic and will not be used as operational features.

## Task APIs (Stage 4A: Task Creation)

### `POST /api/tasks`

Creates a new task in the system. Supports personal task creation by `ADMIN` and `USER`, and team task creation by `ADMIN` assigned to multiple regular users.

- **Method:** `POST`
- **Endpoint:** `/api/tasks`
- **Authentication:** Required (`Authorization: Bearer <JWT>`)
- **Content-Type:** `application/json`

#### Request Headers
```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

#### 1. USER Personal Task Request
Regular users can create personal tasks where they are both the creator and the sole assignee. The `assignmentType` defaults to `PERSONAL` if omitted.
```json
{
  "title": "Complete database assignment",
  "description": "Finish the SQL queries"
}
```

#### 2. ADMIN Personal Task Request
Administrators can create personal tasks for themselves by providing `assignmentType: "PERSONAL"` or omitting it (defaults to `PERSONAL`).
```json
{
  "title": "Review project documentation",
  "description": "Review the API documentation",
  "assignmentType": "PERSONAL"
}
```

#### 3. ADMIN Team Task Request
Administrators can create team tasks and assign them to one or more regular users (`role: USER`) via `assigneeIds`.
```json
{
  "title": "Implement authentication testing",
  "description": "Test login and authorization",
  "assignmentType": "TEAM",
  "assigneeIds": [2, 3]
}
```

#### Successful Response (`201 Created`)
Returns the created task along with its assignment records. The default status is `Pending`.
```json
{
  "success": true,
  "message": "Task created successfully",
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "Implement authentication testing",
    "description": "Test login and authorization",
    "status": "Pending",
    "created_at": "2026-10-09T07:55:00.000Z",
    "updated_at": "2026-10-09T07:55:00.000Z",
    "assignments": [
      {
        "id": 1,
        "task_id": 1,
        "user_id": 2
      },
      {
        "id": 2,
        "task_id": 1,
        "user_id": 3
      }
    ]
  }
}
```

#### Assignment Rules
1. **Personal Tasks (`PERSONAL`):**
   - The authenticated user is the task creator (`tasks.user_id`).
   - The authenticated user is the sole assignee (`task_assignments.user_id = req.user.id`).
   - `assigneeIds` must NOT be provided for personal tasks; unexpected assignment fields are rejected with `400 Bad Request`.
2. **Team Tasks (`TEAM`):**
   - Only `ADMIN` accounts can create team tasks.
   - `assigneeIds` is required and must be a non-empty array of unique, positive integer user IDs.
   - Every assignee must exist in the database and have the `USER` role.
   - Attempting to assign tasks to `ADMIN` accounts is rejected with `400 Bad Request`.
   - The creator remains the authenticated `ADMIN` (`tasks.user_id`), but no self-assignment is created for the admin unless explicitly defined.

#### Validation Rules & Errors (`400 Bad Request`)
- **Missing or empty `title`:** Returns `400 Bad Request` (`Title is required` or `Title cannot be empty or whitespace only`).
- **Non-string `title`:** Returns `400 Bad Request` (`Title must be a string`).
- **`title` exceeds 200 characters:** Returns `400 Bad Request` (`Title cannot exceed 200 characters`).
- **Non-string `description`:** Returns `400 Bad Request` (`Description must be a string when provided`).
- **Invalid `assignmentType`:** Returns `400 Bad Request` (`Invalid assignmentType. Allowed values are PERSONAL or TEAM`).
- **`assigneeIds` provided for `PERSONAL` task:** Returns `400 Bad Request` (`assigneeIds is not allowed for personal tasks`).
- **Missing or non-array `assigneeIds` for `TEAM` task:** Returns `400 Bad Request` (`assigneeIds is required for TEAM task creation`).
- **Empty `assigneeIds` array for `TEAM` task:** Returns `400 Bad Request` (`assigneeIds must be a non-empty array`).
- **Non-integer or non-positive IDs in `assigneeIds`:** Returns `400 Bad Request` (`All assignee IDs must be valid positive integers`).
- **Duplicate IDs in `assigneeIds`:** Returns `400 Bad Request` (`assigneeIds must not contain duplicate user IDs`).
- **Non-existent assignee ID:** Returns `400 Bad Request` (`One or more assignee IDs do not exist`).
- **Assignee is an `ADMIN` account:** Returns `400 Bad Request` (`Cannot assign tasks to ADMIN accounts; assignees must have role USER`).

#### Authorization Errors (`403 Forbidden`)
- **Regular user attempts `TEAM` task creation:** Returns `403 Forbidden` (`Access denied: Only administrators can create team tasks`).

#### Security & Identity Integrity Rules
- **Authentication requirement:** Missing or invalid Bearer tokens return `401 Unauthorized`.
- **Authoritative creator identity:** Client-supplied `user_id`, `userId`, `creatorId`, or `role` fields in the request body are strictly ignored and discarded. The creator ID and role are derived directly from the authenticated PostgreSQL user attached to `req.user`.
- **No sensitive data leakage:** Password hashes and JWT secrets are never returned in task or assignment responses.

#### Database Transaction & Atomicity Behavior
- Task creation and assignment creation are executed within an atomic database transaction using Prisma (`prisma.$transaction`).
- If any validation fails (e.g., nonexistent assignee ID, duplicate assignees, invalid role) or a database constraint fails, the entire transaction rolls back completely. No partial task or assignment records are created.

---

### `GET /api/tasks` (Stage 4B: Task Listing)

Retrieves tasks visible to the authenticated user based on role-based visibility rules.

- **Method:** `GET`
- **Endpoint:** `/api/tasks`
- **Authentication:** Required (`Authorization: Bearer <JWT>`)

#### Request Headers
```http
Authorization: Bearer <JWT>
```

#### Visibility Rules

1. **`ADMIN`:**
   - Sees **all tasks** across the system (personal tasks created by users, personal tasks created by the admin, and team tasks).
   - Includes creator information and all assignment records.
   - Enforced safely without exposing passwords, password hashes, or sensitive credentials.

2. **`USER`:**
   - Sees **only tasks assigned to them** through `task_assignments`.
   - Includes their own personal tasks (where they are creator and assignee) and team tasks where they are an assignee.
   - Tasks assigned exclusively to another user do NOT appear in the regular user's list.
   - Team tasks created by an admin that are assigned to other users do NOT appear.
   - **Enforced strictly at the database query level** (`WHERE EXISTS (SELECT 1 FROM task_assignments ...)`), avoiding in-memory filtering.
   - Client-supplied IDs or parameters cannot bypass database-enforced assignment filtering.

#### Deterministic Ordering
- Tasks are returned in deterministic **newest-first** order:
  1. Primary sort: `created_at` descending (`createdAt: 'desc'`).
  2. Secondary stable sort: `id` descending (`id: 'desc'`).

#### Successful Response (`200 OK`)
Returns `200 OK` with the list of visible tasks. If the user has no assigned tasks, returns `200 OK` with an empty array (`data: []`).

```json
{
  "success": true,
  "message": "Tasks retrieved successfully",
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "Implement authentication testing",
      "description": "Test login and authorization",
      "status": "Pending",
      "created_at": "2026-10-09T07:55:00.000Z",
      "updated_at": "2026-10-09T07:55:00.000Z",
      "creator": {
        "id": 1,
        "name": "System Admin",
        "email": "admin@example.com",
        "role": "ADMIN"
      },
      "assignments": [
        {
          "id": 1,
          "task_id": 1,
          "user_id": 2,
          "user": {
            "id": 2,
            "name": "Regular User",
            "email": "user@example.com",
            "role": "USER"
          }
        }
      ]
    }
  ]
}
```

#### Duplicate Prevention
- A team task assigned to multiple users appears **exactly once** in each authorized user's response.

#### Read-Only / Idempotence
- Calling `GET /api/tasks` is strictly read-only and does not create, update, or delete any database records.

#### Current Scope & Limitations
- Pagination is not implemented in this stage; all visible tasks are returned.

---

### `GET /api/tasks/:id` (Stage 4C: Single Task Retrieval)

Retrieves the details of a specific task by ID based on role-based access rules.

- **Method:** `GET`
- **Endpoint:** `/api/tasks/:id`
- **Authentication:** Required (`Authorization: Bearer <JWT>`)

#### Request Headers
```http
Authorization: Bearer <JWT>
```

#### Access & Visibility Rules

1. **`ADMIN`:**
   - Can retrieve **any existing task** by ID in the database.
   - Includes full task details, safe creator information, and all assignment records.

2. **`USER`:**
   - Can retrieve a task **only if assigned to it** through `task_assignments`.
   - Includes their own personal tasks (where creator and assignee is the user) and team tasks where the user is an assignee.
   - Tasks assigned exclusively to other users return `404 Not Found`.
   - Team tasks created by an admin that are not assigned to the user return `404 Not Found`.
   - Creator status (e.g., admin-created) does NOT grant access to unassigned regular users.
   - Visibility is enforced directly in the database query (`WHERE id = $id AND EXISTS (SELECT 1 FROM task_assignments WHERE user_id = $userId)`).

#### Non-Disclosing 404 Behavior
To prevent username, task ID, and project enumeration:
- If a task does **not exist**, the API returns `404 Not Found` (`Task not found`).
- If a task **exists but is not assigned to the requesting user**, the API returns the exact same `404 Not Found` (`Task not found`).
- The existence of unauthorized tasks is never disclosed to clients.

#### Validation & Client Errors (`400 Bad Request`)
- If `:id` is malformed, not a number, non-integer, zero, or negative (e.g., `/api/tasks/abc`, `/api/tasks/-5`, `/api/tasks/1.5`), returns `400 Bad Request`:
  ```json
  {
    "success": false,
    "message": "Invalid task ID"
  }
  ```

#### Successful Response (`200 OK`)
```json
{
  "success": true,
  "message": "Task retrieved successfully",
  "data": {
    "id": 1,
    "user_id": 1,
    "title": "Implement authentication testing",
    "description": "Test login and authorization",
    "status": "Pending",
    "created_at": "2026-10-09T07:55:00.000Z",
    "updated_at": "2026-10-09T07:55:00.000Z",
    "creator": {
      "id": 1,
      "name": "System Admin",
      "email": "admin@example.com",
      "role": "ADMIN"
    },
    "assignments": [
      {
        "id": 1,
        "task_id": 1,
        "user_id": 2,
        "user": {
          "id": 2,
          "name": "Regular User",
          "email": "user@example.com",
          "role": "USER"
        }
      },
      {
        "id": 2,
        "task_id": 1,
        "user_id": 3,
        "user": {
          "id": 3,
          "name": "Second User",
          "email": "user2@example.com",
          "role": "USER"
        }
      }
    ]
  }
}
```

#### Security & Data Integrity
- Only safe creator and assignee user fields are returned (`id`, `name`, `email`, `role`). Password hashes, JWT secrets, and internal database details are strictly omitted.
- Retrieval is strictly read-only and does not modify database records.

---

### `PATCH /api/tasks/:id` (Stage 4D: Task Update)

Updates an existing task's title and/or description based on role-based authorization rules.

- **Method:** `PATCH`
- **Endpoint:** `/api/tasks/:id`
- **Authentication:** Required (`Authorization: Bearer <JWT>`)
- **Content-Type:** `application/json`

#### Request Headers
```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

#### Role-Based Edit Permissions

1. **`ADMIN`:**
   - Can edit **any existing task** across the system, including personal tasks (created by any user or admin) and team tasks.
   - Can update `title`, `description`, or both.
   - Cannot modify task status through this endpoint (must use the dedicated status endpoint).
   - Cannot modify task assignments through this endpoint.

2. **`USER`:**
   - Can edit **only their own personal task** where they are both the creator (`tasks.user_id = req.user.id`) and the sole assignee (`task_assignments.user_id = req.user.id`).
   - **Cannot edit personal tasks belonging to another user.**
   - **Cannot edit team tasks**, even if assigned to work on the task.
   - Cannot modify task assignments.
   - Cannot modify task status through this endpoint.

#### Non-Disclosing 404 Behavior
To prevent unauthorized users from discovering the existence of tasks they do not own:
- If a task **does not exist**, the API returns `404 Not Found` (`Task not found`).
- If a regular user attempts to edit a task that **exists but is not their personal task** (e.g. another user's personal task or any team task), the API returns the exact same `404 Not Found` (`Task not found`).
- No task metadata or error details are disclosed in unauthorized responses.
- Unsuccessful update attempts leave the database record completely unchanged.

#### Editable Fields
Only the following two fields may be modified via this endpoint:
- **`title`** (`String`): Short title of the task. Must be a string, non-empty after trimming, and at most 200 characters.
- **`description`** (`String`): Optional detailed description. If supplied, it must be a string. Empty strings `""` or whitespace-only strings are accepted and trimmed to `""`.

#### Rejected Protected Fields & Mass-Assignment Prevention
To ensure strict security and data integrity, an **explicit allowlist policy** is enforced. If the request body includes any field other than `title` and `description`, the request is immediately rejected with `400 Bad Request`:
- **`status`**: Rejected. Status updates are managed through the dedicated status endpoint.
- **`user_id` / `userId` / `creatorId`**: Rejected. Creator identity cannot be modified or spoofed.
- **`assignmentType` / `assigneeIds`**: Rejected. Task assignments cannot be altered through this endpoint.
- **`id`**: Rejected. Primary keys cannot be altered.
- **`created_at` / `createdAt` / `updated_at` / `updatedAt`**: Rejected. Timestamps are managed automatically by PostgreSQL and Prisma ORM.
- **Arbitrary / Unexpected properties**: Rejected with an explicit list of forbidden keys.

#### Validation Rules & HTTP Status Codes

| Status Code | Condition | Example Response |
| :--- | :--- | :--- |
| **`200 OK`** | Task successfully updated. | Returns updated task data with safe creator and assignment info. |
| **`400 Bad Request`** | Empty request body (`{}`). | `{"success": false, "message": "Request body cannot be empty"}` |
| **`400 Bad Request`** | Neither `title` nor `description` supplied. | `{"success": false, "message": "At least one editable field (title or description) must be provided"}` |
| **`400 Bad Request`** | Forbidden or extra fields supplied (mass-assignment). | `{"success": false, "message": "Invalid or forbidden fields in request body: status. Only 'title' and 'description' can be updated."}` |
| **`400 Bad Request`** | `title` is not a string. | `{"success": false, "message": "Title must be a string"}` |
| **`400 Bad Request`** | `title` is empty or whitespace-only. | `{"success": false, "message": "Title cannot be empty or whitespace only"}` |
| **`400 Bad Request`** | `title` exceeds 200 characters. | `{"success": false, "message": "Title cannot exceed 200 characters"}` |
| **`400 Bad Request`** | `description` is not a string (e.g. number, object). | `{"success": false, "message": "Description must be a string"}` |
| **`400 Bad Request`** | Malformed `:id` (non-integer, zero, negative). | `{"success": false, "message": "Invalid task ID"}` |
| **`401 Unauthorized`** | Missing, invalid, or expired JWT. | `{"success": false, "message": "Authentication required: Missing Authorization header"}` |
| **`404 Not Found`** | Task does not exist OR unauthorized user attempt. | `{"success": false, "message": "Task not found"}` |
| **`500 Internal Error`** | Unhandled server or database exception. | `{"success": false, "message": "Internal server error"}` |

#### Example Requests & Responses

##### 1. Update Title Only
```http
PATCH /api/tasks/1
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "title": "Updated Task Title"
}
```

##### 2. Update Description Only
```http
PATCH /api/tasks/1
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "description": "Updated task description notes"
}
```

##### 3. Update Both Title and Description
```http
PATCH /api/tasks/1
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "title": "Comprehensive Title Update",
  "description": "Comprehensive description update"
}
```

##### Successful Response (`200 OK`)
```json
{
  "success": true,
  "message": "Task updated successfully",
  "data": {
    "id": 1,
    "user_id": 2,
    "title": "Comprehensive Title Update",
    "description": "Comprehensive description update",
    "status": "Pending",
    "created_at": "2026-10-09T07:55:00.000Z",
    "updated_at": "2026-10-09T08:35:12.345Z",
    "creator": {
      "id": 2,
      "name": "Regular User",
      "email": "user@example.com",
      "role": "USER"
    },
    "assignments": [
      {
        "id": 1,
        "task_id": 1,
        "user_id": 2,
        "user": {
          "id": 2,
          "name": "Regular User",
          "email": "user@example.com",
          "role": "USER"
        }
      }
    ]
  }
}
```

#### Test Command
```bash
npm run test:update-task
```

---

### `PATCH /api/tasks/:id/status` (Stage 4E: Task Status Update)

Updates an existing task's lifecycle status. This endpoint is strictly restricted to administrator users (`ADMIN`).

- **Method:** `PATCH`
- **Endpoint:** `/api/tasks/:id/status`
- **Authentication:** Required (`Authorization: Bearer <JWT>`)
- **Authorization:** `ADMIN` role only
- **Content-Type:** `application/json`

#### Request Headers
```http
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json
```

#### Access & Role Permissions

1. **`ADMIN`:**
   - Possesses exclusive permission to update task status.
   - Can update the status of **any existing task** (personal tasks created by users, personal tasks created by admins, or team tasks).
   - Any valid status may be selected directly without an enforced sequential transition state machine.

2. **`USER`:**
   - **Access Denied (`403 Forbidden`).** Regular users cannot modify the status of any task, including their own personal tasks or team tasks assigned to them.
   - Any attempt by a regular user returns `403 Forbidden` (`{"success": false, "message": "Access denied"}`) and leaves the database record completely unchanged.

#### Allowed Status Values
The endpoint accepts strictly the following four public status values:
- `"Pending"`
- `"In Progress"`
- `"Testing"`
- `"Completed"`

> **Prisma ORM Mapping Note:** The database stores `"In Progress"` in PostgreSQL's native `TaskStatus` enum. The Prisma client schema maps this enum to `InProgress` (`InProgress @map("In Progress")`). The API accepts the exact public string `"In Progress"` and maps it seamlessly to the ORM enum, returning `"In Progress"` in the response.

#### Rejected Status Values (`400 Bad Request`)
The following values are invalid and rejected with `400 Bad Request`:
- Unsupported statuses such as `"Done"`, `"Cancelled"`, `"Closed"`, `"Review"`
- Casing mismatches such as lowercase `"pending"`, `"in progress"`, `"completed"`
- Empty strings `""` or whitespace-only strings
- `null`, numbers, booleans, arrays, and objects

#### Strict Request-Body Allowlist & Protected Fields (`400 Bad Request`)
To enforce single-responsibility and prevent mass-assignment vulnerabilities, the request body may **only** contain the `status` field:
- **Empty bodies (`{}`)**: Rejected with `400 Bad Request` (`Request body cannot be empty`).
- **Protected/Non-status fields**: Supplying `title`, `description`, `user_id`, `userId`, `creatorId`, `assignmentType`, `assigneeIds`, `id`, `created_at`, or `updated_at` returns `400 Bad Request`.
- **Arbitrary properties**: Any unexpected fields are rejected with an explicit error detailing the forbidden keys.
- **Side effects prevention**: Task title, description, creator identity, and assignees remain completely unaffected by status updates.

#### Validation Rules & HTTP Status Codes

| Status Code | Condition | Example Response |
| :--- | :--- | :--- |
| **`200 OK`** | Task status successfully updated. | Returns updated task data with safe creator and assignment info. |
| **`400 Bad Request`** | Empty request body (`{}`). | `{"success": false, "message": "Request body cannot be empty"}` |
| **`400 Bad Request`** | `status` field missing. | `{"success": false, "message": "Status is required"}` |
| **`400 Bad Request`** | `status` is not a string (null, number, object). | `{"success": false, "message": "Status must be a string"}` |
| **`400 Bad Request`** | Invalid or unsupported status value. | `{"success": false, "message": "Invalid status: \"Done\". Allowed values are: Pending, In Progress, Testing, Completed"}` |
| **`400 Bad Request`** | Extra or forbidden fields supplied. | `{"success": false, "message": "Invalid or forbidden fields in request body: title. Only 'status' can be updated."}` |
| **`400 Bad Request`** | Malformed `:id` (non-integer, zero, negative, float). | `{"success": false, "message": "Invalid task ID"}` |
| **`401 Unauthorized`** | Missing, invalid, or expired JWT. | `{"success": false, "message": "Authentication required: Missing Authorization header"}` |
| **`403 Forbidden`** | Authenticated user has role `USER`. | `{"success": false, "message": "Access denied"}` |
| **`404 Not Found`** | Task with given ID does not exist in the database. | `{"success": false, "message": "Task not found"}` |
| **`500 Internal Error`** | Unhandled server or database error. | `{"success": false, "message": "Internal server error"}` |

#### Example Request & Response

##### Request
```http
PATCH /api/tasks/1/status
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json

{
  "status": "In Progress"
}
```

##### Successful Response (`200 OK`)
```json
{
  "success": true,
  "message": "Task status updated successfully",
  "data": {
    "id": 1,
    "user_id": 2,
    "title": "Build authentication testing",
    "description": "Test login and authorization",
    "status": "In Progress",
    "created_at": "2026-10-09T07:55:00.000Z",
    "updated_at": "2026-10-09T08:50:30.123Z",
    "creator": {
      "id": 2,
      "name": "Regular User",
      "email": "user@example.com",
      "role": "USER"
    },
    "assignments": [
      {
        "id": 1,
        "task_id": 1,
        "user_id": 2,
        "user": {
          "id": 2,
          "name": "Regular User",
          "email": "user@example.com",
          "role": "USER"
        }
      }
    ]
  }
}
```

#### Test Command
```bash
npm run test:update-task-status
```

---

## Postman Collection & API Testing (Stage 5)

The project includes an official Postman Collection v2.1 and environment configuration for end-to-end API testing across all 11 implemented endpoints.

### 1. File Locations

- **Collection File:** [`postman/Kanishka-Task-Management-API.postman_collection.json`](file:///postman/Kanishka-Task-Management-API.postman_collection.json)
- **Environment File:** [`postman/Kanishka-Task-Management-Local.postman_environment.json`](file:///postman/Kanishka-Task-Management-Local.postman_environment.json)

### 2. Postman Import Instructions

1. Open **Postman Desktop** or **Postman Web**.
2. Click **Import** in the top-left corner of the workspace.
3. Drag and drop or select both files:
   - `postman/Kanishka-Task-Management-API.postman_collection.json`
   - `postman/Kanishka-Task-Management-Local.postman_environment.json`
4. In the top-right environment selector dropdown, select **Kanishka Task Management Local**.

### 3. Environment Variables Configuration

The environment file defines the following variables:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `baseUrl` | `http://localhost:5000` | Base URL of the running API server (configurable). |
| `adminEmail` | `admin@example.com` | Seeded development administrator email. |
| `adminPassword` | `Admin@123` | Seeded development administrator password. |
| `userEmail` | `user@example.com` | Seeded development regular user email. |
| `userPassword` | `User@123` | Seeded development regular user password. |
| `adminToken` | `""` | Dynamically populated by *Login as Admin* test script. |
| `userToken` | `""` | Dynamically populated by *Login as Regular User* test script. |
| `taskId` | `""` | Dynamically captured from created task responses. |
| `personalTaskId` | `""` | Dynamically captured from regular user personal task creation. |
| `teamTaskId` | `""` | Dynamically captured from admin team task creation. |
| `adminPersonalTaskId` | `""` | Dynamically captured from admin personal task creation. |
| `assignedUserId` | `""` | Dynamically captured from user registration for team assignment. |

> **Security Note:** Exported files contain only safe development placeholder credentials (`Admin@123`, `User@123`). Tokens and dynamic IDs are initialized as empty strings (`""`) and populated in memory during test execution. No production secrets or JWT tokens are committed or exported.

### 4. Starting the Server

Ensure the PostgreSQL database is migrated and seeded, then start the Express server:

```bash
# Verify database and seed data
npm run db:test
npm run db:seed

# Start the API server on port 5000
npm start
# or with live reload:
npm run dev
```

### 5. Collection Organization & Recommended Execution Order

The collection contains **47 requests across 10 folders**, structured for linear top-to-bottom execution:

1. **`1. Health`**
   - `Health Check` (`GET /api/health`): Verifies server operational status without authentication.
2. **`2. Authentication`**
   - `Register User` (`POST /api/auth/register`): Creates a unique test user with timestamped email and stores `assignedUserId`.
   - `Login as Admin` (`POST /api/auth/login`): Logs in as Admin and extracts `adminToken`.
   - `Login as Regular User` (`POST /api/auth/login`): Logs in as User and extracts `userToken`.
   - `Get Current Authenticated User (Admin)` (`GET /api/auth/me`): Verifies admin profile and role.
   - `Get Current Authenticated User (Regular User)` (`GET /api/auth/me`): Verifies regular user profile and role.
3. **`3. Admin Authorization`**
   - `Admin-only Access as Admin` (`GET /api/auth/admin-test`): Expects `200 OK`.
   - `Admin-only Access Attempt as Regular User` (`GET /api/auth/admin-test`): Expects `403 Forbidden`.
4. **`4. User Authorization`**
   - `User-only Access as Regular User` (`GET /api/auth/user-test`): Expects `200 OK`.
   - `User-only Access Attempt as Admin` (`GET /api/auth/user-test`): Expects `403 Forbidden`.
5. **`5. Task Creation`**
   - `Create Personal Task as Regular User` (`POST /api/tasks`): Stores `personalTaskId` and `taskId`.
   - `Create Personal Task as Admin` (`POST /api/tasks`): Stores `adminPersonalTaskId`.
   - `Create Team Task as Admin Assigned to Multiple Users` (`POST /api/tasks`): Assigns to regular users and stores `teamTaskId`.
   - `Attempt Team Task Creation as Regular User` (`POST /api/tasks`): Expects `403 Forbidden`.
   - `Attempt to Assign Admin as Regular-User Assignee` (`POST /api/tasks`): Expects `400 Bad Request`.
6. **`6. Task Listing`**
   - `Admin Lists All Tasks` (`GET /api/tasks`): Verifies system-wide task visibility.
   - `Regular User Lists Permitted Tasks` (`GET /api/tasks`): Verifies database-enforced assignment visibility.
7. **`7. Get Task by ID`**
   - `Admin Retrieves a Task by ID` (`GET /api/tasks/{{taskId}}`): Expects `200 OK`.
   - `Regular User Retrieves an Assigned Task` (`GET /api/tasks/{{personalTaskId}}`): Expects `200 OK`.
   - `Regular User Attempts to Retrieve Task Assigned Exclusively to Someone Else` (`GET /api/tasks/{{adminPersonalTaskId}}`): Expects non-disclosing `404 Not Found`.
   - `Request for a Nonexistent Task` (`GET /api/tasks/999999`): Expects `404 Not Found`.
   - `Request with Invalid Task ID` (`GET /api/tasks/invalid-id`): Expects `400 Bad Request`.
8. **`8. Update Task`**
   - `Admin Updates Title` (`PATCH /api/tasks/{{taskId}}`): Expects `200 OK`.
   - `Admin Updates Description` (`PATCH /api/tasks/{{taskId}}`): Expects `200 OK`.
   - `Regular User Updates Their Own Personal Task` (`PATCH /api/tasks/{{personalTaskId}}`): Expects `200 OK`.
   - `Regular User Attempts to Update Another User's Task` (`PATCH /api/tasks/{{adminPersonalTaskId}}`): Expects non-disclosing `404 Not Found`.
   - `Regular User Attempts to Update a Team Task` (`PATCH /api/tasks/{{teamTaskId}}`): Expects non-disclosing `404 Not Found`.
   - `Attempt to Update Protected Fields (Status)` (`PATCH /api/tasks/{{personalTaskId}}`): Expects `400 Bad Request`.
   - `Attempt Update with an Invalid Title` (`PATCH /api/tasks/{{personalTaskId}}`): Expects `400 Bad Request`.
9. **`9. Update Task Status`**
   - `Admin Changes Status to In Progress` (`PATCH /api/tasks/{{taskId}}/status`): Expects `200 OK`.
   - `Admin Changes Status to Testing` (`PATCH /api/tasks/{{taskId}}/status`): Expects `200 OK`.
   - `Admin Changes Status to Completed` (`PATCH /api/tasks/{{taskId}}/status`): Expects `200 OK`.
   - `Admin Changes Status Back to Pending` (`PATCH /api/tasks/{{taskId}}/status`): Expects `200 OK`.
   - `Regular User Attempts Status Update` (`PATCH /api/tasks/{{personalTaskId}}/status`): Expects `403 Forbidden`.
   - `Status Update with Invalid Status Value` (`PATCH /api/tasks/{{taskId}}/status`): Expects `400 Bad Request`.
   - `Status Update with Missing Status (Empty Body)` (`PATCH /api/tasks/{{taskId}}/status`): Expects `400 Bad Request`.
   - `Attempt to Submit Protected Fields Alongside Status` (`PATCH /api/tasks/{{taskId}}/status`): Expects `400 Bad Request`.
10. **`10. Negative and Security Tests`**
    - `Access Protected Route Without Token (401)`: Expects `401 Unauthorized`.
    - `Access Protected Route With Invalid Token (401)`: Expects `401 Unauthorized`.
    - `Register With Duplicate Email (409)`: Expects `409 Conflict`.
    - `Register With Invalid Email Format (400)`: Expects `400 Bad Request`.
    - `Register With Short Password (400)`: Expects `400 Bad Request`.
    - `Login With Incorrect Password (401)`: Expects `401 Unauthorized` without user enumeration.
    - `Create Task With Empty Title (400)`: Expects `400 Bad Request`.
    - `Update Task Status With Malformed ID (400)`: Expects `400 Bad Request`.
    - `Update Task With Empty Body (400)`: Expects `400 Bad Request`.
    - `Security: Ensure Password Hash Is Not Disclosed`: Confirms zero password or hash leakage in response bodies.

### 6. Automated Testing with Newman (CLI)

The collection can be executed headlessly via **Newman** against a running server:

```bash
# Start server in terminal 1
npm start

# Run collection in terminal 2
npx newman run postman/Kanishka-Task-Management-API.postman_collection.json -e postman/Kanishka-Task-Management-Local.postman_environment.json
```

#### Test Execution Summary

```text
┌─────────────────────────┬───────────────────┬──────────────────┐
│                         │          executed │           failed │
├─────────────────────────┼───────────────────┼──────────────────┤
│              iterations │                 1 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│                requests │                47 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│            test-scripts │                47 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│      prerequest-scripts │                 2 │                0 │
├─────────────────────────┼───────────────────┼──────────────────┤
│              assertions │                99 │                0 │
├─────────────────────────┴───────────────────┴──────────────────┤
│ total run duration: 6s                                         │
├────────────────────────────────────────────────────────────────┤
│ total data received: 12.67kB (approx)                          │
├────────────────────────────────────────────────────────────────┤
│ average response time: 40ms                                    │
└────────────────────────────────────────────────────────────────┘
```

---

## Current Implementation Status

### COMPLETED:
- [x] Project foundation (Express, directory structure, health check endpoint)
- [x] PostgreSQL database configuration
- [x] Prisma schema definition (`users`, `tasks`, `task_assignments`, enums)
- [x] Database migrations and PostgreSQL table creation
- [x] Seed users (Admin and Regular User)
- [x] Password hashing with bcrypt
- [x] User registration API (`POST /api/auth/register`)
- [x] User login API (`POST /api/auth/login`)
- [x] JWT token generation
- [x] JWT authentication middleware (`src/middleware/authenticate.js`)
- [x] Role-based authorization middleware (`src/middleware/authorize.js`)
- [x] Task Creation API (`POST /api/tasks`) — Stage 4A
- [x] Task Listing API (`GET /api/tasks`) — Stage 4B
- [x] Task Retrieval API (`GET /api/tasks/:id`) — Stage 4C
- [x] Task Update API (`PATCH /api/tasks/:id`) — Stage 4D
- [x] Task Status Update API (`PATCH /api/tasks/:id/status`) — Stage 4E
- [x] Postman Collection & API Testing (`postman/`) — Stage 5

### NOT YET IMPLEMENTED:
- [ ] Task Deletion API (`DELETE /api/tasks/:id`)
- [ ] Frontend application

