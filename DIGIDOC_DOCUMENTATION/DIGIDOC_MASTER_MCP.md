# DigiDoc Master MCP Document

This is the canonical implementation and reference guide for the DigiDoc Model Context Protocol (MCP) server and its integration with the DigiDoc healthcare backend.

---

## 1. Purpose & Architectural Role

The DigiDoc MCP server exposes carefully scoped, deterministic tools to AI clients (e.g., Claude, Antigravity, Open-WebUI). 

```text
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
│   AI Agent /    │  MCP  │  DigiDoc MCP Server  │ HTTP  │ Authenticated DigiDoc  │
│   LLM Client    │ ────> │ (mcp-server/index.ts)│ ────> │ REST API (Backend)     │
└─────────────────┘       └──────────────────────┘       └────────────────────────┘
                                                                     │
                                                       ┌─────────────┴────────────┐
                                                       │  - Deterministic Triage  │
                                                       │  - Verified Doctor Repo  │
                                                       │  - Live Scheduling Engine│
                                                       │  - Supabase PostgreSQL   │
                                                       └──────────────────────────┘
```

**Key Architectural Rules:**
1. **Tool Gateway, Not Decision Authority:** The MCP server is a transport layer and schema validator. It does not perform clinical triage in-process; all medical decisions are evaluated by the backend deterministic safety engine.
2. **Identical Authorization Boundary:** MCP tool calls execute under the exact same backend authorization, Row Level Security (RLS), and audit policies as web app user sessions.
3. **Never Fabricate Data:** Never hallucinate slots, doctor credentials, or bookings. Tools return structured errors (`isError: true`) when records or services are unavailable.

---

## 2. Technology Stack

- **Runtime:** Node.js (v20+ LTS recommended) + TypeScript (ES2022 / NodeNext)
- **SDK:** `@modelcontextprotocol/sdk` (v1.6+) using `McpServer` and `StdioServerTransport`
- **Validation:** `zod` (v3.24+) for strict input validation
- **Backend Transport:** HTTPS fetch with bearer authentication, timeout guards (`AbortSignal.timeout`), and `Idempotency-Key` headers

---

## 3. Directory Layout

The `mcp-server/` directory is fully self-contained with its own dependencies and TypeScript configuration:

```text
DIGIDOC_DOCUMENTATION/
├── mcp-server/
│   ├── index.ts           # Complete MCP server implementation (8 tools)
│   ├── package.json       # Dependencies, build & run scripts
│   ├── tsconfig.json      # NodeNext TypeScript compilation setup
│   └── dist/              # Compiled output (dist/index.js)
├── docs/
│   └── PROJECT_DOCUMENTATION.md
├── .mcp.json              # Local client MCP registration
└── DIGIDOC_MASTER_MCP.md  # This master document
```

---

## 4. Canonical Tool Contracts

The MCP server implements **8 core tools** matching the capabilities defined in `PROJECT_DOCUMENTATION.md`:

| # | Tool Name | HTTP Method & Backend Route | Purpose & Safety Constraint |
|---|---|---|---|
| 1 | `get_triage_guidance` | `POST /api/triage/assess` | Evaluates confirmed symptoms against clinician-reviewed protocol. Non-diagnostic. |
| 2 | `search_verified_doctors` | `GET /api/providers` | Queries only verified doctors by specialty, city, mode, fee, and language. |
| 3 | `get_available_slots` | `GET /api/providers/:id/slots` | Retrieves real-time slots from provider calendar source. No fabricated slots. |
| 4 | `book_consultation` | `POST /api/appointments` | Creates verified booking. Requires `patientConfirmed: true` & `idempotencyKey`. |
| 5 | `cancel_consultation` | `POST /api/appointments/:id/cancel` | Cancels existing booking. Requires `patientConfirmed: true`. |
| 6 | `create_patient_summary` | `POST /api/intake/sessions/summary-draft` | Builds structured clinical summary draft in Urdu/English for patient review. |
| 7 | `get_patient_record` | `GET /api/patient/me/records` | Retrieves authorized records for authenticated patient principal only. |
| 8 | `save_patient_consent` | `POST /api/consents` | Persists explicit patient consent/revocation with immutable audit log. |

---

## 5. Security & Safety Contract

1. **Authentication Token Forwarding:**
   - Patient-specific tools (`book_consultation`, `cancel_consultation`, `get_patient_record`, `save_patient_consent`) require `patientSessionToken`.
   - The token is forwarded via `Authorization: Bearer <token>`, guaranteeing that the backend and Supabase RLS enforce patient data segregation.
   - The LLM can never impersonate another user by fabricating a raw `patientId`.

2. **Action Confirmation Guards:**
   - Any state-mutating or consequential action (`book_consultation`, `cancel_consultation`) enforces:
     ```ts
     patientConfirmed: z.literal(true)
     ```
   - The agent cannot book or cancel without explicit patient agreement.

3. **Double-Booking & Idempotency Prevention:**
   - `book_consultation` requires a minimum 16-character `idempotencyKey` sent in the request header to prevent duplicate appointments during network retries.

4. **Error Sanitization:**
   - When backend calls fail, the server returns `{ isError: true, content: [{ type: "text", text: "..." }] }`.
   - Internal database traces and environment secrets are never exposed to the client.

---

## 6. Setup & Compilation

### Installation
Inside `DIGIDOC_DOCUMENTATION/mcp-server`:
```bash
npm install
```

### Build & Run
```bash
# Compile TypeScript to dist/index.js
npm run build

# Start MCP server in production
npm start

# Or run directly in development with tsx
npm run dev
```

---

## 7. Client Configuration (`.mcp.json`)

To register the server in compatible MCP clients (Antigravity, Claude Desktop, Cursor), configure `.mcp.json`:

```json
{
  "mcpServers": {
    "digidoc-healthcare": {
      "command": "node",
      "args": ["./DIGIDOC_DOCUMENTATION/mcp-server/dist/index.js"],
      "env": {
        "DIGIDOC_API_BASE_URL": "http://localhost:4000",
        "DIGIDOC_MCP_API_KEY": "YOUR_BACKEND_SERVICE_ROLE_KEY"
      }
    }
  }
}
```

---

## 8. Backend Routes Specification

The DigiDoc backend must implement these endpoints to fulfill the MCP server contract:

```text
POST /api/triage/assess
  Body: { symptoms, ageYears?, relevantHistory?, locale }
  Response: { urgencyLevel, protocolVersion, recommendation, emergencyNotice? }

GET /api/providers
  Query: specialty, city?, telehealth?, language?, maxFee?
  Response: { providers: [{ id, name, qualification, specialty, fee, modes }] }

GET /api/providers/:id/slots
  Query: fromISO, toISO, consultationMode
  Response: { slots: [{ slotId, startTime, endTime, mode, status }] }

POST /api/appointments
  Headers: Authorization: Bearer <patientSessionToken>, Idempotency-Key: <key>
  Body: { providerId, slotId, consentToShareSummary, patientConfirmed: true }
  Response: { appointmentId, status: "confirmed", bookingReference, time }

POST /api/appointments/:id/cancel
  Headers: Authorization: Bearer <patientSessionToken>
  Body: { reason?, patientConfirmed: true }
  Response: { appointmentId, status: "cancelled", timestamp }

POST /api/intake/sessions/summary-draft
  Headers: Authorization: Bearer <patientSessionToken>
  Body: { confirmedSymptoms, relevantHistory?, patientQuestions?, locale }
  Response: { summaryDraftId, formattedSummary, locale, generatedAt }

GET /api/patient/me/records
  Headers: Authorization: Bearer <patientSessionToken>
  Query: type (all | appointments | summaries | documents)
  Response: { records: [...] }

POST /api/consents
  Headers: Authorization: Bearer <patientSessionToken>
  Body: { purpose, policyVersion, granted }
  Response: { consentId, status: "recorded", timestamp }
```

---

## 9. Demo Mode vs. Production

- **In Demo Mode (`DEMO_MODE=true`):** The backend returns clearly labeled synthetic provider names and mock slot references with an explicit `[DEMO DATA - NOT REAL CARE]` disclaimer.
- **In Production (`DEMO_MODE=false`):** The backend must strictly verify PMDC/PMC doctor credentials, connect to real clinic calendar APIs, and require a licensed clinical protocol version. If any component is unconfigured, the system fails closed with a clear error.
