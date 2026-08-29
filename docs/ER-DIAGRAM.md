# Database ER Diagram

Renders automatically on GitHub (Mermaid is supported natively in `.md` files). Generated from
`backend/prisma/schema.prisma` — if the schema changes, update this diagram to match in the same
commit.

```mermaid
erDiagram
    User ||--o{ Session : "has"
    User ||--o{ Conversation : "owns"
    User ||--o{ AuditLog : "generates"
    Conversation ||--o{ Message : "contains"

    User {
        string id PK
        string email UK
        string passwordHash
        string displayName
        datetime createdAt
        datetime updatedAt
    }

    Session {
        string id PK
        string userId FK
        string token UK
        datetime expiresAt
        datetime createdAt
    }

    Conversation {
        string id PK
        string userId FK
        string title
        datetime lastMessageAt
        datetime createdAt
        datetime updatedAt
    }

    Message {
        string id PK
        string conversationId FK
        string sender "USER or BOT"
        string body
        string requestId UK "idempotency key, nullable"
        datetime createdAt
    }

    ChatbotResponse {
        string id PK
        string keyword UK
        string response
        datetime createdAt
    }

    RequestLog {
        string id PK
        string requestId UK "nullable"
        string userId "nullable, no FK"
        string endpoint
        string method
        int statusCode
        int durationMs
        datetime createdAt
    }

    AuditLog {
        string id PK
        string userId FK "nullable"
        string action
        json metadata
        datetime createdAt
    }
```

## Notes on the design

- **`ChatbotResponse` and `RequestLog` have no foreign keys to `User`/`Conversation`.**
  `ChatbotResponse` is global reference data (keyword → reply), not owned by anyone.
  `RequestLog.userId` is stored as a plain string, not a FK, on purpose: request logs should keep
  existing even if the user who made the request is later deleted (the log describes what the API
  did, not something that belongs to the user's account).
- **`AuditLog.userId` IS a nullable FK with `onDelete: SetNull`** — deleting a user preserves the
  audit trail (doesn't cascade-delete history) but nulls out the reference, since GDPR-style
  "right to erasure" scenarios shouldn't leave a dangling foreign key.
- **`Message.requestId` is unique but nullable** — most messages won't be retried, so most rows
  have no idempotency key. Postgres allows multiple `NULL`s in a unique column, only enforcing
  uniqueness among the non-null values, which is exactly the semantics wanted (see
  `README.md` § Day 3 for the idempotency reasoning this constraint supports).
- **Cascades:** deleting a `User` cascades to their `Session`s and `Conversation`s; deleting a
  `Conversation` cascades to its `Message`s. Deleting a user is meant to actually remove their
  data, not orphan it.
