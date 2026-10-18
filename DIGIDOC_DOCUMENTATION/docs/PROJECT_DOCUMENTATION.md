# DigiDoc — Complete Project Documentation & Build Specification

**Product:** DigiDoc  
**Category:** Urdu-first AI healthcare navigation, patient intake, and consultation booking  
**Document status:** Architecture and implementation specification  
**Target users:** Patients, doctors, clinic staff, platform administrators  
**Initial market:** Pakistan (configure locale, providers, emergency guidance, privacy/legal requirements per deployment region)

> **Important:** This document defines a proposed architecture, not proof that all services are connected or clinically validated. Medical triage and clinical content must be reviewed by licensed healthcare professionals before real-world use. Never deploy the prototype as an autonomous diagnosis or prescribing system.

---

## 1. Executive summary

DigiDoc is a voice-first healthcare assistant that helps patients describe symptoms in Urdu, Roman Urdu, or English; collects relevant patient-confirmed information; identifies warning signs using a deterministic, clinician-reviewed safety protocol; explains general health information; and helps the patient find and book an appropriate verified healthcare professional.

DigiDoc is a care-navigation and patient-preparation tool. It does not replace a doctor, make definitive diagnoses, prescribe medication, or independently change a treatment plan.

### Product goals
- Make healthcare navigation easier for Urdu-speaking and low-literacy users.
- Gather a concise, structured and patient-confirmed symptom history.
- Prioritize safety and emergency escalation.
- Match patients to verified doctors based on specialty, availability, language, location/telehealth, and cost.
- Make real bookings only through a verified scheduling integration.
- Help patients understand and control their personal health information.
- Provide doctors with consented, concise summaries before consultations.

### Success measures
- Urdu speech recognition and transcript-correction success rates.
- Percentage of interviews completed without unnecessary questions.
- Safety-protocol test pass rate and clinician-reviewed escalation performance.
- Verified-provider search success and booking completion rate.
- Booking duplication/error rate.
- Patient understanding, accessibility, and satisfaction.
- Privacy incidents, unauthorized access tests, and consent-revocation correctness.

---

## 2. Roles and permissions

### Patient
- Create and manage their own account and profile.
- Give, review, and revoke consent where applicable.
- Conduct an AI intake interview and correct transcripts.
- View their own sessions, documents, appointments, and summaries.
- Search verified providers and request appointments.
- Export or request deletion of eligible data.
- Choose whether to share an intake summary with a selected provider.

### Doctor / provider
- Maintain a profile subject to credential verification.
- Manage permitted availability and appointments.
- Access only authorized patient information associated with their appointments.
- Review patient-approved summaries and record consultation outcomes.
- Cannot browse unrelated patients.

### Clinic staff
- Access only clinic scheduling workflows permitted by their role.
- No broad access to medical records unless explicitly authorized and required.

### Platform administrator
- Verify provider records, manage system configuration, investigate abuse, and view minimized operational metrics.
- Sensitive access must be limited, justified, and audited.
- Admin role must not bypass privacy protections silently.

### System / AI agent
- Access only explicitly authorized tools and minimum necessary data.
- Never trusts user-provided patient IDs without server-side authorization.
- Never creates fake providers, credentials, fees, appointment slots, or booking confirmations.

---

## 3. Feature specification

### 3.1 Voice-first conversation
- Push-to-talk microphone controls and optional continuous conversation only after explicit permission.
- Listening, processing, speaking, stopped, permission-denied, and error states.
- Urdu (`ur-PK`), Roman Urdu, English (`en-PK`); later add other languages only after quality testing.
- Speech-to-text transcript shown to the patient with edit/correction controls.
- Text entry fallback for browsers/devices with unsupported speech APIs.
- Stop speaking, replay, mute, and retry controls.
- Do not assume browser-native speech recognition supports Urdu well on every device. Use a tested provider abstraction.
- Do not infer diagnosis or emotional state from accent, voice pitch, or vocal tone.

### 3.2 Adaptive patient intake
Ask one clear question at a time. Gather only information relevant to the concern:
- Main concern in the patient's own words.
- Symptoms, onset, duration, severity, progression, and associated symptoms.
- Relevant medical history, allergies, current medications, and prior care.
- Age or age band only as needed; pregnancy status only when relevant and appropriate.
- Patient's worries, preferred language, accessibility needs, and preferred consultation type.
- Location only when necessary to locate in-person care.

Show a structured summary and let the patient correct it. Distinguish patient-reported facts, extracted facts, and AI-generated interpretations.

### 3.3 Safety and urgency
- Use a deterministic safety layer based on a clinician-approved protocol, separate from the general-purpose LLM.
- Red flags override routine interview, educational content, and normal booking.
- Provide clear emergency instructions without delaying care to finish the interview.
- Configure and verify local emergency guidance per deployment region; do not invent numbers.
- The model may extract candidate symptoms, but the policy engine determines the configured urgency category.
- Log protocol version and outcome without unnecessary raw health text.
- Test false negatives, false positives, ambiguous symptoms, negation, transcription errors, and language variations.

Suggested output categories:
1. Emergency care now.
2. Urgent clinician assessment.
3. Routine consultation.
4. General educational information / self-care guidance where appropriate.

These categories and all associated rules require clinical review before use.

### 3.4 Educational health guidance
- Explain general information in simple Urdu or English.
- State uncertainty and limitations.
- Encourage a clinician when symptoms persist, worsen, or are concerning.
- No definitive diagnosis, prescriptions, dosage recommendations, medication changes, or claims that a condition is ruled out.
- Use a curated, versioned, clinician-reviewed knowledge source for medical education; display source date where useful.

### 3.5 Provider directory and matching
- Only verified doctors are eligible for recommendations.
- Filter by relevant specialty, service location, telehealth availability, language, fee range, actual availability, and patient preferences.
- Explain why each provider matches.
- Show verification status, qualifications, fees, consultation mode, and cancellation policy only when sourced and current.
- Do not treat paid placement as clinical suitability. Disclose any sponsored placement.
- Do not fabricate ratings, credentials, or reviews.

### 3.6 Booking
- Retrieve actual slots from the provider/clinic scheduling source.
- Re-check slot availability immediately before booking.
- Require patient confirmation before creating, changing, or cancelling a booking.
- Use idempotency keys and transaction/slot-locking where supported.
- Confirm only after the scheduling system returns success and a real booking reference.
- Support time zones, cancellations, rescheduling, no-slot states, provider outages, and duplicate submission.
- If no real scheduler exists, run demo mode and label all slots and bookings as simulated.

### 3.7 Patient records and document analysis
- Optional private uploads for reports, prescriptions, and discharge summaries.
- Validate file type, size, ownership, malware scan where available, OCR confidence, and access controls.
- Show extracted values, units, reference ranges, and dates for patient confirmation.
- Explain that report interpretation is informational and may require clinician review.
- Never treat blurry, cropped, outdated, or ambiguous documents as certain.
- Keep private files in non-public storage.

### 3.8 Follow-up and reminders
- Opt-in appointment reminders.
- Follow-up check-ins that ask whether symptoms changed.
- Escalate newly reported warning signs using the safety protocol.
- Do not imply that the AI continuously monitors the patient.
- Provide notification preferences, quiet hours, and opt-out.

---

## 4. Recommended technology stack

These are recommendations, not claims that the project already uses them.

### Frontend
- React + TypeScript
- Vite
- Tailwind CSS
- Accessible UI primitives such as shadcn/ui (optional)
- React Router
- TanStack Query for server state (optional)
- Zod for client-side form validation (server must validate again)
- Browser Media APIs for microphone capture
- Speech provider adapter for Urdu ASR/TTS

### Backend
- Node.js + TypeScript
- Express or Fastify (choose one; do not use both without a reason)
- Zod request validation
- Structured logging with redaction
- Rate limiting, authentication middleware, and role-based authorization

### Database and storage
- Supabase PostgreSQL
- Supabase Auth
- Row Level Security (RLS) on every patient-owned table
- Supabase private Storage buckets for health documents
- Database migrations committed to version control

### AI and voice
Use provider adapters to keep services replaceable:
- LLM: OpenAI API or another approved provider that supports structured outputs/tool calling.
- Speech-to-text: a tested Urdu-capable ASR provider; evaluate OpenAI audio transcription or other vendors against representative Urdu/Roman Urdu samples.
- Text-to-speech: a tested Urdu-capable TTS provider; evaluate voices and pronunciation before selecting.
- Do not assume every model/provider supports Urdu voice natively or in real time.
- Validate model output with schemas and server-side rules.
- Never place API keys in frontend code.

### MCP
- TypeScript MCP server using `@modelcontextprotocol/sdk`
- Zod input schemas
- Narrow, authenticated backend API calls
- Separate server process; use the transport required by the chosen MCP client
- MCP tools do not replace backend authorization

### Scheduling
Select one real provider/clinic scheduling integration after confirming the target clinics' systems and API access. Options may include a clinic's own API, an approved scheduling platform, or a managed booking service. Calendly can be evaluated for general appointment workflows but should not be assumed to support healthcare-specific provider verification, medical records, or clinical scheduling requirements.

### Deployment and operations
- Frontend: Vercel or equivalent.
- API and MCP server: a secure Node.js host that supports required networking and environment secrets.
- Database/Auth/Storage: Supabase.
- Monitoring: error tracking and uptime monitoring with sensitive-data redaction.
- CI: lint, type-check, unit tests, integration tests, dependency audit, and migration checks.

### Optional tools / integrations
- OpenAI Developers documentation/connector: useful for implementation guidance; not a runtime API dependency.
- Context7: optional coding-time documentation lookup; not a runtime dependency.
- Calendly: optional scheduling integration candidate; only if its workflow matches the product.
- Firebase: alternative backend option, but avoid using Firebase and Supabase for the same core database/auth purpose unless there is a clear architecture reason.
- Email/SMS/WhatsApp provider: optional, subject to user consent, regional availability, template rules, and privacy review.
- OCR/document parsing provider: optional; test accuracy and retention terms before use.

**Important:** Do not add all optional providers by default. Choose the smallest set that meets requirements and verify pricing, data processing terms, regional availability, API limits, and Urdu performance before committing.

---

## 5. Proposed project structure

```text
digidoc/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── router.tsx
│   │   │   │   └── providers.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/
│   │   │   │   ├── voice/
│   │   │   │   ├── intake/
│   │   │   │   ├── providers/
│   │   │   │   └── appointments/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── patient/
│   │   │   │   ├── doctor/
│   │   │   │   ├── admin/
│   │   │   │   ├── consent/
│   │   │   │   └── documents/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── services/
│   │   │   ├── styles/
│   │   │   └── main.tsx
│   │   └── package.json
│   └── api/
│       ├── src/
│       │   ├── app.ts
│       │   ├── server.ts
│       │   ├── config/
│       │   ├── middleware/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── patients/
│       │   │   ├── intake/
│       │   │   ├── triage/
│       │   │   ├── providers/
│       │   │   ├── scheduling/
│       │   │   ├── documents/
│       │   │   ├── consent/
│       │   │   └── audit/
│       │   ├── adapters/
│       │   │   ├── llm/
│       │   │   ├── speech-to-text/
│       │   │   ├── text-to-speech/
│       │   │   ├── scheduling/
│       │   │   └── notifications/
│       │   ├── policies/
│       │   │   └── triage/
│       │   └── tests/
│       └── package.json
├── mcp-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   ├── schemas/
│   │   └── clients/
│   └── package.json
├── packages/
│   ├── shared-types/
│   ├── validation/
│   └── config/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_SPEC.md
│   ├── SECURITY_PRIVACY.md
│   ├── CLINICAL_SAFETY.md
│   ├── TEST_PLAN.md
│   └── DEPLOYMENT.md
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── DIGIDOC_MASTER_MCP.md
```

This is a proposed monorepo structure. If an existing repository has a different working architecture, inspect it first and adapt rather than destructively reorganizing it.

---

## 6. High-level architecture

```text
Patient Web App
   ├── Microphone / text input
   ├── Transcript review and consent
   └── Patient dashboard
          |
          v
Authenticated API
   ├── Authentication + role authorization
   ├── Intake/session service
   ├── Deterministic safety policy
   ├── LLM orchestration (structured output)
   ├── Speech provider adapters
   ├── Verified provider directory
   ├── Scheduling adapter
   ├── Document processing pipeline
   └── Audit/consent service
          |
          ├── Supabase PostgreSQL + RLS
          ├── Private object storage
          ├── Approved AI/speech APIs
          ├── Real provider scheduling system
          └── Notification provider (optional)

MCP Client / Agent
   └── DigiDoc MCP Server
          └── Authenticated API tools (same backend policy)
```

The MCP server must call the same secured backend services as the web application. It must not create a second path around authorization or clinical safety rules.

---

## 7. Data model proposal

Minimum proposed entities:
- `profiles`: auth user ID, role, display name, locale.
- `patient_profiles`: minimal demographic and accessibility preferences.
- `patient_consents`: purpose, policy version, grant/revoke timestamps.
- `symptom_sessions`: patient ID, status, locale, timestamps, protocol version.
- `symptom_entries`: session ID, patient-reported symptom, duration, severity, confirmation state.
- `allergies`: patient-confirmed allergy records.
- `medication_reconciliations`: patient-reported medication list; not a prescription engine.
- `patient_documents`: private object path, type, document date, processing state, OCR confidence.
- `providers`: provider ID, verification state, qualifications, specialties, languages, fees, modes.
- `provider_availability`: external slot ID, provider ID, times, timezone, status.
- `appointments`: patient ID, provider ID, slot ID, status, external booking reference.
- `clinician_summaries`: patient-approved summary and sharing/consent metadata.
- `notification_preferences`: channel, opt-in, quiet hours.
- `audit_events`: actor, action, resource type, timestamp, correlation ID, minimized metadata.

### Security requirements
- Apply RLS to all patient-owned tables and private storage objects.
- Never trust a `patient_id` from the browser without checking it against the authenticated principal.
- Doctors can access only authorized appointment-related records.
- Admin access is limited and audited.
- Keep secrets in server-side environment variables or a secrets manager.
- Never store raw audio by default unless there is a defined purpose, explicit consent, retention policy, and secure storage.
- Support correction, export, and deletion workflows where legally and operationally appropriate.

---

## 8. API endpoint proposal

All endpoints below are proposed; implement and document them before use.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/intake/sessions` | Start a consented intake session |
| POST | `/api/intake/sessions/:id/turns` | Submit text/transcribed patient answer |
| PATCH | `/api/intake/sessions/:id/summary` | Correct/confirm structured summary |
| POST | `/api/triage/assess` | Run the approved safety policy |
| GET | `/api/providers` | Search verified providers |
| GET | `/api/providers/:id/slots` | Fetch actual slots |
| POST | `/api/appointments` | Create booking after confirmation |
| POST | `/api/appointments/:id/cancel` | Cancel after authorization/confirmation |
| POST | `/api/documents` | Upload a validated private document |
| GET | `/api/patient/me/records` | Read current user's permitted records |
| POST | `/api/consents` | Record or update consent |
| GET | `/api/patient/me/export` | Start authorized data export request |

Requirements:
- Validate input/output schemas.
- Authenticate and authorize every sensitive endpoint.
- Apply rate limits and safe error messages.
- Use idempotency for booking creation.
- Do not expose stack traces or secrets.
- Do not put health information in URLs or analytics events.

---

## 9. MCP tool contract

Recommended MCP tools:
1. `get_triage_guidance`
2. `search_verified_doctors`
3. `get_available_slots`
4. `book_consultation`
5. `cancel_consultation`
6. `create_patient_summary`
7. `get_patient_record`
8. `save_patient_consent`

Every tool must:
- Have a narrow purpose and Zod input schema.
- Use authenticated server-side identity.
- Enforce ownership and role permissions in the backend.
- Return minimal necessary information.
- Never trust LLM-generated IDs without validating them.
- Require explicit confirmation for bookings, cancellations, and sensitive sharing.
- Use real source-of-truth results, never invented slots or providers.
- Return structured errors without exposing secrets or sensitive internals.

The included MCP server implements all eight core tool contracts with schema validation, authenticated token forwarding, and safe error handling, connecting directly to the backend API specifications.

---

## 10. Environment variables

Create `.env.example` with placeholder values only. Never commit real credentials.

```dotenv
# API
NODE_ENV=development
API_PORT=4000
WEB_ORIGIN=http://localhost:5173

# Supabase: public URL/anon key may be used in the browser with RLS.
SUPABASE_URL=
SUPABASE_ANON_KEY=
# Server-only; never expose to the browser:
SUPABASE_SERVICE_ROLE_KEY=

# LLM provider (choose and implement one)
LLM_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=

# Speech providers (select tested Urdu-capable providers)
SPEECH_TO_TEXT_PROVIDER=
SPEECH_TO_TEXT_API_KEY=
TEXT_TO_SPEECH_PROVIDER=
TEXT_TO_SPEECH_API_KEY=

# Scheduling adapter
SCHEDULING_PROVIDER=
SCHEDULING_API_BASE_URL=
SCHEDULING_API_KEY=

# MCP server to backend authentication
DIGIDOC_API_BASE_URL=http://localhost:4000
DIGIDOC_MCP_API_KEY=

# Optional notifications
NOTIFICATION_PROVIDER=
NOTIFICATION_API_KEY=

# Safety configuration
TRIAGE_PROTOCOL_VERSION=demo-not-clinically-validated
DEMO_MODE=true
```

Do not set a fake triage protocol version in production. Production startup should fail closed if required clinical policy configuration is missing or not approved.

---

## 11. UX and visual design

- Calm, accessible healthcare interface with teal/blue accents, readable typography, and responsive layouts.
- Large microphone control and clear listening/speaking indicator.
- Text input always available as fallback.
- Urdu RTL rendering for Urdu script; handle Roman Urdu and English appropriately.
- Avoid excessive animation, flashing alerts, or visuals that imply diagnostic certainty.
- Use clear labels: “AI-generated guidance,” “patient-confirmed,” “doctor verified,” “demo data,” and “booking confirmed.”
- Build loading, offline, permission-denied, speech-recognition failure, no-provider, no-slot, booking-failure, and emergency states.
- Make the patient review and edit the medical summary before sharing.

---

## 12. Testing plan

### Unit tests
- Input validation and locale handling.
- Structured extraction and transcript correction.
- Red-flag rules against clinician-authored test cases.
- Provider filtering and verified-only behavior.
- Appointment idempotency and time-zone handling.
- Consent state transitions.

### Integration/security tests
- Patient A cannot read Patient B's records or files.
- A doctor cannot access an unrelated patient's record.
- Admin actions are audited.
- Revoked consent prevents future optional sharing.
- The MCP server cannot bypass backend authorization.
- Invalid or stale slot IDs are rejected.
- Duplicate booking requests do not create duplicate appointments.
- API provider failure never results in a fake success message.
- Prompt injection cannot override safety policy or expose secrets.

### Voice and accessibility tests
- Representative Urdu speakers, accents, noise conditions, code-switching, and Roman Urdu.
- Transcription confidence and correction flow.
- Screen reader, keyboard navigation, contrast, mobile screen sizes, and slow network.

### Clinical validation
- A licensed clinical reviewer must approve the triage protocol and test set.
- Measure false negatives and false positives on a clinically reviewed evaluation set.
- Conduct controlled testing before any real patient deployment.

---

## 13. Deployment checklist

- [ ] Configure separate development, staging, and production environments.
- [ ] Run migrations and verify RLS policies.
- [ ] Keep all server secrets out of source control and frontend bundles.
- [ ] Set strict CORS and rate limits.
- [ ] Restrict upload types and sizes; use private storage.
- [ ] Configure logging redaction and audit trails.
- [ ] Test booking provider outage and duplicate requests.
- [ ] Verify provider credentials and live availability source.
- [ ] Approve clinical triage protocol with licensed clinicians.
- [ ] Complete privacy/security and applicable legal review.
- [ ] Clearly label demo data and disable real booking in demo mode.
- [ ] Publish support, incident, data-retention, and deletion processes.

---

## 14. Delivery phases

1. **Prototype:** UI, consent mock flow, Urdu/text intake, demo-only provider directory, test triage states.
2. **Foundation:** Supabase auth/schema/RLS, audit and consent records.
3. **AI/voice:** provider adapters, transcript correction, structured extraction.
4. **Safety:** reviewed protocol, deterministic escalation, clinical test suite.
5. **Scheduling:** verified providers and real booking integration.
6. **Portals:** doctor and admin dashboards.
7. **Hardening:** security, accessibility, performance, privacy and clinical validation.

### Definition of done
A feature is not complete merely because a button appears in the UI. It must have a working backend path, validated data, authorization tests, loading/error states, and clear demo/production labeling. A booking is complete only after the real scheduling provider confirms it.
