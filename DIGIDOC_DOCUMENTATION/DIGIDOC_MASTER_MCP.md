# DigiDoc Master MCP Document

This is the single implementation guide for the DigiDoc MCP server and its connection to the wider healthcare platform.

## 1. Purpose
The MCP server exposes carefully scoped tools to an AI agent. It is a tool gateway, not a database, a medical model, or an authorization boundary by itself. All sensitive operations must be authorized by the backend.

## 2. Proposed stack
- Node.js + TypeScript
- `@modelcontextprotocol/sdk`
- `zod` for tool input schemas
- HTTPS authenticated API calls to DigiDoc backend
- Supabase/PostgreSQL behind the backend
- A clinician-reviewed deterministic triage service
- A verified provider directory and actual scheduling adapter

## 3. Suggested directory

```text
mcp-server/
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── triage.ts
│   │   ├── providers.ts
│   │   ├── scheduling.ts
│   │   ├── patient-summary.ts
│   │   └── consent.ts
│   ├── schemas/
│   ├── clients/
│   │   └── digidoc-api.ts
│   └── tests/
├── package.json
├── tsconfig.json
└── README.md
```

## 4. Tools and behavior

### `get_triage_guidance`
Input: patient-confirmed symptoms, duration/severity where known, limited relevant history, locale.
Backend: deterministic policy engine with approved protocol version.
Output: urgency category, next-step guidance, protocol version, uncertainty flags.
Restriction: not a diagnosis; never let free-form model output override emergency rules.

### `search_verified_doctors`
Input: specialty, city or telehealth preference, language, fee limit.
Backend: return only currently verified providers from the real directory.
Output: provider ID, sourced name/specialty/language/mode/fee and verification status.
Restriction: no invented doctors, credentials, ratings, or prices.

### `get_available_slots`
Input: provider ID, date range, consultation mode.
Backend: query actual scheduling source.
Output: real slot IDs, start/end, timezone, source status.
Restriction: do not make up slots; revalidate at booking time.

### `book_consultation`
Input: trusted authenticated patient context, provider ID, slot ID, explicit confirmation, consent choice, idempotency key.
Backend: validate identity, permissions, consent, provider/slot, slot freshness, and booking idempotency.
Output: confirmed status only after provider success, plus actual booking reference.
Restriction: the model must not be able to impersonate a patient by choosing an arbitrary patient ID.

### `cancel_consultation`
Input: appointment reference, explicit confirmation.
Backend: verify appointment ownership/role and cancellation policy, then call the scheduler.
Output: actual cancellation status.
Restriction: no cancellation based only on model assumption.

### `create_patient_summary`
Input: patient-confirmed symptoms and relevant history.
Output: concise draft in selected locale.
Restriction: draft only; never share with a clinician without separate explicit patient consent.

### `get_patient_record`
Input: minimal record selection.
Backend: infer identity from trusted authentication and enforce row-level/record-level authorization.
Restriction: avoid arbitrary patient IDs from the LLM.

### `save_patient_consent`
Input: consent purpose, policy version, granted/revoked state.
Backend: record audit metadata and enforce the resulting access/sharing policy.

## 5. Security contract
- Keep MCP server credentials on the server.
- Use TLS for network transport.
- Validate every input using a schema.
- Re-check authorization inside the backend on every tool call.
- Minimize health data returned to the model.
- Do not log raw health narratives unless explicitly necessary and protected.
- Rate-limit calls and use request timeouts.
- Use idempotency for booking.
- Require explicit confirmation for consequential actions.
- Return generic errors that do not leak tokens, patient records, or stack traces.
- Test prompt injection, unauthorized access, stale slots, duplicate booking, consent revocation, and backend outage.

## 6. MCP client configuration example
The following is a local stdio-style example for a compatible MCP client. Exact file name and environment-variable interpolation differ between clients. Do not assume every editor reads `.mcp.json`.

```json
{
  "mcpServers": {
    "digidoc-healthcare": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "DIGIDOC_API_BASE_URL": "http://localhost:4000",
        "DIGIDOC_MCP_API_KEY": "SET_THIS_IN_YOUR_LOCAL_ENVIRONMENT"
      }
    }
  }
}
```

Never commit a real API key. For production, prefer a secret manager and a deployment-specific authenticated transport.

## 7. Example package dependencies
Install compatible current versions and lock them in your package manager:

```bash
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript @types/node
```

Configure TypeScript to compile `src/index.ts` into `dist/index.js` and use an ESM-compatible setup consistent with the SDK version. Verify the official SDK docs for the installed version rather than copying outdated API examples blindly.

## 8. Backend routes to implement
- `POST /internal/triage/guidance`
- `POST /internal/providers/search-verified`
- `POST /internal/scheduling/available-slots`
- `POST /internal/scheduling/book`
- `POST /internal/scheduling/cancel`
- `POST /internal/patients/summary-draft`
- `GET /internal/patients/me/records`
- `POST /internal/consents`

These are proposed endpoints, not pre-existing services. Protect them with service authentication, user-context authorization, input validation, rate limits, and audit events.

## 9. Demo mode versus production
In demo mode, use clearly labeled synthetic providers and fake slots; do not contact real patients or imply a real booking exists. In production, fail closed when verified provider data, scheduler configuration, approved triage protocol, or required consent is missing.

## 10. Release checklist
- [ ] MCP server starts and tools appear in the selected client.
- [ ] Every tool validates input.
- [ ] Every sensitive tool uses trusted identity and backend authorization.
- [ ] Red-flag rules are clinician-approved and tested.
- [ ] Provider data is verified and current.
- [ ] Slots come from a real scheduling source.
- [ ] Booking requires explicit confirmation and idempotency.
- [ ] Consent controls sharing.
- [ ] Secrets and health data are redacted from logs.
- [ ] Security and clinical validation are complete.
