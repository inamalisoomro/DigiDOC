/**
 * DigiDoc Healthcare MCP Server.
 *
 * Exposes secure, protocol-governed tools to AI clients via the Model Context Protocol (MCP).
 * Communicates with the authenticated DigiDoc backend for deterministic triage,
 * verified provider directories, and scheduling systems.
 *
 * Specification:
 * - Uses modern @modelcontextprotocol/sdk (server.tool)
 * - Returns structured error responses ({ isError: true }) without leaking sensitive internals
 * - Enforces explicit user confirmation on sensitive/consequential actions
 * - Adheres strictly to the endpoints in PROJECT_DOCUMENTATION.md
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize MCP Server instance
const server = new McpServer({
  name: "digidoc-healthcare",
  version: "1.0.0",
});

const API_BASE = process.env.DIGIDOC_API_BASE_URL || "http://localhost:4000";
const SERVICE_API_KEY = process.env.DIGIDOC_MCP_API_KEY;

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  userToken?: string;
  idempotencyKey?: string;
}

/**
 * Standardized API client for DigiDoc backend communication.
 */
async function callDigiDocApi<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", params, body, userToken, idempotencyKey } = options;

  const url = new URL(path, API_BASE);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined) {
        url.searchParams.set(key, String(val));
      }
    }
  }

  const headers: Record<string, string> = {
    "Accept": "application/json",
  };

  // Provide server-to-server or user bearer authentication
  if (userToken) {
    headers["Authorization"] = `Bearer ${userToken}`;
  } else if (SERVICE_API_KEY) {
    headers["Authorization"] = `Bearer ${SERVICE_API_KEY}`;
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let requestBody: string | undefined;
  if (body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      let errorMessage = `DigiDoc API request failed with status ${response.status}`;
      try {
        const errorData = await response.json() as { message?: string; error?: string };
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Fallback to HTTP status text
        errorMessage = `${errorMessage}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown communication error";
    throw new Error(`[Backend Service Error] ${message}`);
  }
}

/**
 * Helper to wrap tool execution with standardized MCP error responses.
 */
function handleToolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Internal tool execution failure";
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

// -----------------------------------------------------------------------------
// TOOL 1: get_triage_guidance
// -----------------------------------------------------------------------------
server.tool(
  "get_triage_guidance",
  "Evaluates patient-confirmed symptoms against the clinician-reviewed deterministic safety protocol. Returns urgency classification and guidance. Not an autonomous clinical diagnosis.",
  {
    symptoms: z.array(
      z.object({
        description: z.string().min(1).max(500).describe("Symptom description reported by patient"),
        duration: z.string().max(100).optional().describe("Duration e.g., '2 days', 'since morning'"),
        severity: z.enum(["mild", "moderate", "severe", "unknown"]).optional(),
      })
    ).min(1).max(30).describe("List of patient-confirmed symptoms"),
    ageYears: z.number().int().min(0).max(120).optional().describe("Patient age in years"),
    relevantHistory: z.array(z.string().max(300)).max(20).optional().describe("Relevant medical history/allergies"),
    locale: z.enum(["ur-PK", "en-PK", "ur-Latn-PK"]).default("ur-PK").describe("Target language/locale"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/triage/assess", {
        method: "POST",
        body: input,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 2: search_verified_doctors
// -----------------------------------------------------------------------------
server.tool(
  "search_verified_doctors",
  "Searches the verified provider directory for certified practitioners by specialty, city, consultation mode, or language. Only verified doctors are returned.",
  {
    specialty: z.string().min(2).max(100).describe("Medical specialty e.g., 'Cardiology', 'General Physician'"),
    city: z.string().max(100).optional().describe("City filter e.g., 'Lahore', 'Karachi', 'Islamabad'"),
    telehealth: z.boolean().optional().describe("True if remote video/audio consultation is desired"),
    language: z.enum(["Urdu", "English", "Pashto", "Balochi", "Sindhi", "Punjabi"]).optional().describe("Preferred spoken language"),
    maxFee: z.number().nonnegative().optional().describe("Maximum consultation fee limit (PKR)"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/providers", {
        method: "GET",
        params: {
          specialty: input.specialty,
          city: input.city,
          telehealth: input.telehealth,
          language: input.language,
          maxFee: input.maxFee,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 3: get_available_slots
// -----------------------------------------------------------------------------
server.tool(
  "get_available_slots",
  "Queries live scheduling source-of-truth for actual provider consultation slots. Never returns simulated or hallucinated availability.",
  {
    providerId: z.string().min(1).max(200).describe("Verified doctor ID"),
    fromISO: z.string().datetime().describe("Start time boundary in ISO 8601 format"),
    toISO: z.string().datetime().describe("End time boundary in ISO 8601 format"),
    consultationMode: z.enum(["in_person", "telehealth"]).describe("Consultation mode"),
  },
  async (input) => {
    try {
      if (Date.parse(input.toISO) <= Date.parse(input.fromISO)) {
        throw new Error("Validation error: 'toISO' must be strictly later than 'fromISO'");
      }
      const result = await callDigiDocApi<unknown>(`/api/providers/${encodeURIComponent(input.providerId)}/slots`, {
        method: "GET",
        params: {
          fromISO: input.fromISO,
          toISO: input.toISO,
          consultationMode: input.consultationMode,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 4: book_consultation
// -----------------------------------------------------------------------------
server.tool(
  "book_consultation",
  "Reserves a verified appointment slot. Requires explicit patient confirmation, patient session authorization, and an idempotency key to prevent double bookings.",
  {
    patientSessionToken: z.string().min(1).max(4000).describe("Authenticated patient session token"),
    providerId: z.string().min(1).max(200).describe("Verified doctor ID"),
    slotId: z.string().min(1).max(200).describe("Target slot ID"),
    patientConfirmed: z.literal(true).describe("Must be explicitly confirmed by patient before execution"),
    consentToShareSummary: z.boolean().default(false).describe("Whether the patient consents to share intake summary with this doctor"),
    idempotencyKey: z.string().min(16).max(200).describe("Unique idempotency key generated per booking intent"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/appointments", {
        method: "POST",
        userToken: input.patientSessionToken,
        idempotencyKey: input.idempotencyKey,
        body: {
          providerId: input.providerId,
          slotId: input.slotId,
          consentToShareSummary: input.consentToShareSummary,
          patientConfirmed: input.patientConfirmed,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 5: cancel_consultation
// -----------------------------------------------------------------------------
server.tool(
  "cancel_consultation",
  "Cancels an existing appointment. Enforces patient ownership, policy checks, and explicit confirmation.",
  {
    patientSessionToken: z.string().min(1).max(4000).describe("Authenticated patient session token"),
    appointmentId: z.string().min(1).max(200).describe("Existing booking reference ID"),
    reason: z.string().max(500).optional().describe("Patient-stated reason for cancellation"),
    patientConfirmed: z.literal(true).describe("Must be explicitly confirmed by the patient"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>(`/api/appointments/${encodeURIComponent(input.appointmentId)}/cancel`, {
        method: "POST",
        userToken: input.patientSessionToken,
        body: {
          reason: input.reason,
          patientConfirmed: input.patientConfirmed,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 6: create_patient_summary
// -----------------------------------------------------------------------------
server.tool(
  "create_patient_summary",
  "Generates a concise structured clinical summary draft from patient-confirmed information. Draft is stored for patient review before any sharing.",
  {
    patientSessionToken: z.string().min(1).max(4000).describe("Authenticated patient session token"),
    confirmedSymptoms: z.array(z.string().max(500)).min(1).max(30).describe("Confirmed symptom list"),
    relevantHistory: z.array(z.string().max(500)).max(30).optional().describe("Confirmed medical history"),
    patientQuestions: z.array(z.string().max(300)).max(20).optional().describe("Questions patient wants to ask the doctor"),
    locale: z.enum(["ur-PK", "en-PK", "ur-Latn-PK"]).default("ur-PK").describe("Summary output language"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/intake/sessions/summary-draft", {
        method: "POST",
        userToken: input.patientSessionToken,
        body: {
          confirmedSymptoms: input.confirmedSymptoms,
          relevantHistory: input.relevantHistory,
          patientQuestions: input.patientQuestions,
          locale: input.locale,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 7: get_patient_record
// -----------------------------------------------------------------------------
server.tool(
  "get_patient_record",
  "Fetches authorized health records, summaries, or appointments for the authenticated patient principal. Never accepts arbitrary unverified patient IDs.",
  {
    patientSessionToken: z.string().min(1).max(4000).describe("Authenticated patient session token"),
    recordType: z.enum(["all", "appointments", "summaries", "documents"]).default("all").describe("Category of records to retrieve"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/patient/me/records", {
        method: "GET",
        userToken: input.patientSessionToken,
        params: {
          type: input.recordType,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// TOOL 8: save_patient_consent
// -----------------------------------------------------------------------------
server.tool(
  "save_patient_consent",
  "Records or updates patient consent for data processing, summary sharing, or notifications with an immutable audit log.",
  {
    patientSessionToken: z.string().min(1).max(4000).describe("Authenticated patient session token"),
    consentPurpose: z.enum(["intake_processing", "share_summary_with_provider", "appointment_reminders", "anonymous_analytics"]).describe("Consent policy scope"),
    policyVersion: z.string().min(1).max(50).describe("Consent policy version identifier e.g. 'v1.0'"),
    granted: z.boolean().describe("True to grant consent, false to revoke"),
  },
  async (input) => {
    try {
      const result = await callDigiDocApi<unknown>("/api/consents", {
        method: "POST",
        userToken: input.patientSessionToken,
        body: {
          purpose: input.consentPurpose,
          policyVersion: input.policyVersion,
          granted: input.granted,
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return handleToolError(error);
    }
  }
);

// -----------------------------------------------------------------------------
// Server Startup via Stdio Transport
// -----------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting DigiDoc MCP Server:", err);
  process.exit(1);
});
