/**
 * DigiDoc MCP starter.
 *
 * This is a secure-by-default scaffold, not a clinical decision engine.
 * Connect the API adapter functions to your authenticated backend, verified
 * provider directory, clinician-approved triage protocol, and real scheduler.
 *
 * Install:
 *   npm install @modelcontextprotocol/sdk zod
 *   npm install -D typescript @types/node
 *
 * Compile with your TypeScript setup to dist/index.js.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "digidoc-healthcare",
  version: "0.1.0",
});

const apiBase = process.env.DIGIDOC_API_BASE_URL;
const apiKey = process.env.DIGIDOC_MCP_API_KEY;

function requireConfig() {
  if (!apiBase || !apiKey) {
    throw new Error("Missing DIGIDOC_API_BASE_URL or DIGIDOC_MCP_API_KEY");
  }
}

async function api<T>(path: string, body: unknown): Promise<T> {
  requireConfig();
  const response = await fetch(new URL(path, apiBase), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`DigiDoc API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

server.registerTool(
  "get_triage_guidance",
  {
    title: "Get protocol-based urgency guidance",
    description:
      "Returns clinician-configured care-navigation guidance. Not a diagnosis. Emergency rules must be implemented and validated by licensed clinicians in the backend.",
    inputSchema: {
      symptoms: z.array(z.object({
        description: z.string().min(1).max(500),
        duration: z.string().max(100).optional(),
        severity: z.enum(["mild", "moderate", "severe", "unknown"]).optional(),
      })).min(1).max(30),
      ageYears: z.number().int().min(0).max(120).optional(),
      relevantHistory: z.array(z.string().max(300)).max(20).optional(),
      locale: z.enum(["ur-PK", "en-PK", "ur-Latn-PK"]).default("ur-PK"),
    },
  },
  async (input) => {
    // Backend must apply a deterministic, clinician-approved triage policy.
    const result = await api<unknown>("/internal/triage/guidance", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "search_verified_doctors",
  {
    title: "Search verified doctors",
    description:
      "Searches the real provider directory. Only backend-verified doctors may be returned.",
    inputSchema: {
      specialty: z.string().min(2).max(100),
      city: z.string().max(100).optional(),
      telehealth: z.boolean().optional(),
      language: z.enum(["Urdu", "English", "Pashto", "Balochi", "Sindhi", "Punjabi"]).optional(),
      maxFee: z.number().nonnegative().optional(),
    },
  },
  async (input) => {
    const result = await api<unknown>("/internal/providers/search-verified", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "get_available_slots",
  {
    title: "Get actual appointment slots",
    description:
      "Fetches real slots from the connected scheduler. Never fabricate dates or availability.",
    inputSchema: {
      providerId: z.string().min(1).max(200),
      fromISO: z.string().datetime(),
      toISO: z.string().datetime(),
      consultationMode: z.enum(["in_person", "telehealth"]),
    },
  },
  async (input) => {
    if (Date.parse(input.toISO) <= Date.parse(input.fromISO)) {
      throw new Error("toISO must be later than fromISO");
    }
    const result = await api<unknown>("/internal/scheduling/available-slots", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "book_consultation",
  {
    title: "Book a consultation after confirmation",
    description:
      "Creates a real booking only after the user explicitly confirms. Backend must verify patient identity, consent, slot availability, authorization, and idempotency.",
    inputSchema: {
      patientSessionToken: z.string().min(1).max(4000),
      providerId: z.string().min(1).max(200),
      slotId: z.string().min(1).max(200),
      patientConfirmed: z.literal(true),
      consentToShareSummary: z.boolean().default(false),
      idempotencyKey: z.string().min(16).max(200),
    },
  },
  async (input) => {
    const result = await api<unknown>("/internal/scheduling/book", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.registerTool(
  "create_patient_summary",
  {
    title: "Create a patient-confirmed consultation summary",
    description:
      "Formats patient-confirmed information for review. Does not send it to any doctor; sharing requires separate consent and authorization.",
    inputSchema: {
      patientSessionToken: z.string().min(1).max(4000),
      confirmedSymptoms: z.array(z.string().max(500)).max(30),
      relevantHistory: z.array(z.string().max(500)).max(30).optional(),
      patientQuestions: z.array(z.string().max(300)).max(20).optional(),
      locale: z.enum(["ur-PK", "en-PK", "ur-Latn-PK"]).default("ur-PK"),
    },
  },
  async (input) => {
    const result = await api<unknown>("/internal/patients/summary-draft", input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
