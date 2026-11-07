import { createPrivateKey } from "crypto";
import { google } from "googleapis";
import { requireEnv } from "@/lib/utils";

export interface GoogleConfigCheck {
  serviceAccountEmail: string;
  sheetId: string;
  sheetTab: string;
  privateKeyLength: number;
  privateKeyValid: boolean;
}

export interface GoogleNetworkCheck {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
  hint?: string;
}

export interface GoogleDiagnostics {
  config: GoogleConfigCheck;
  network: GoogleNetworkCheck;
  auth: { ok: boolean; error?: string };
  sheets: { ok: boolean; rowCount?: number; error?: string };
}

/** Strip quotes and normalize PEM newlines from .env */
export function parseGooglePrivateKey(raw: string): string {
  let key = raw.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n");

  if (!key.includes("\n") && key.includes("-----BEGIN PRIVATE KEY-----")) {
    key = key
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----\n");
  }

  return key.trim();
}

/** Validate PEM can be parsed by Node crypto */
export function validateGooglePrivateKey(raw: string): void {
  const key = parseGooglePrivateKey(raw);
  try {
    createPrivateKey(key);
  } catch {
    throw new Error(
      "GOOGLE_PRIVATE_KEY is invalid. Use PEM format in .env.local with escaped newlines, e.g. " +
        'GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"',
    );
  }
}

/** Check env vars and private key format */
export function checkGoogleConfig(): GoogleConfigCheck {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const sheetId = requireEnv("GOOGLE_SHEET_ID");
  const sheetTab = process.env.GOOGLE_SHEET_PENDING_ORDERS_TAB ?? "Pending_Orders";
  const rawKey = requireEnv("GOOGLE_PRIVATE_KEY");

  let privateKeyValid = false;
  try {
    validateGooglePrivateKey(rawKey);
    privateKeyValid = true;
  } catch {
    privateKeyValid = false;
  }

  return {
    serviceAccountEmail: email,
    sheetId,
    sheetTab,
    privateKeyLength: rawKey.length,
    privateKeyValid,
  };
}

/** Test TCP/HTTPS reachability to Google APIs */
export async function checkGoogleNetwork(): Promise<GoogleNetworkCheck> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    await fetch("https://oauth2.googleapis.com/", {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    return {
      reachable: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    const detail = [msg, cause].filter(Boolean).join(" — ");

    return {
      reachable: false,
      error: detail || "Connection failed",
      hint:
        "Cannot reach googleapis.com. If you are in mainland China, enable VPN or set HTTPS_PROXY in .env.local. " +
        "Example: HTTPS_PROXY=http://127.0.0.1:7890",
    };
  }
}

/** Build JWT auth client for Google Sheets */
export function createGoogleAuthClient() {
  validateGooglePrivateKey(requireEnv("GOOGLE_PRIVATE_KEY"));

  return new google.auth.JWT({
    email: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: parseGooglePrivateKey(requireEnv("GOOGLE_PRIVATE_KEY")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/** Format google-auth-library errors with network hints */
export function formatGoogleError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const parts = [err.message];
  const errRecord = err as Error & {
    cause?: Error;
    response?: { data?: { error?: string; error_description?: string } };
  };

  if (errRecord.cause?.message) {
    parts.push(`cause: ${errRecord.cause.message}`);
  }

  const data = errRecord.response?.data;
  if (data?.error) {
    parts.push(`oauth: ${data.error}${data.error_description ? ` — ${data.error_description}` : ""}`);
  }

  if (
    err.message.includes("oauth2/v4/token") ||
    err.message.includes("fetch failed") ||
    errRecord.cause?.message?.includes("ECONNREFUSED") ||
    errRecord.cause?.message?.includes("ETIMEDOUT")
  ) {
    parts.push(
      "hint: Google APIs may be blocked on your network. Use VPN or HTTPS_PROXY=http://127.0.0.1:7890 in .env.local",
    );
  }

  return parts.join(" | ");
}

/** Run full staged diagnostics for /api/google/test */
export async function diagnoseGoogleSheets(): Promise<GoogleDiagnostics> {
  const config = checkGoogleConfig();
  const network = await checkGoogleNetwork();

  const result: GoogleDiagnostics = {
    config,
    network,
    auth: { ok: false },
    sheets: { ok: false },
  };

  if (!config.privateKeyValid) {
    result.auth.error =
      "GOOGLE_PRIVATE_KEY failed PEM validation — check format in .env.local";
    return result;
  }

  if (!network.reachable) {
    result.auth.error = network.hint ?? network.error;
    return result;
  }

  try {
    const auth = createGoogleAuthClient();
    await auth.authorize();
    result.auth.ok = true;
  } catch (err) {
    result.auth.error = formatGoogleError(err);
    return result;
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: createGoogleAuthClient() });
    const sheetId = requireEnv("GOOGLE_SHEET_ID");
    const tab = process.env.GOOGLE_SHEET_PENDING_ORDERS_TAB ?? "Pending_Orders";

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A1:J1`,
    });

    result.sheets.ok = true;
    result.sheets.rowCount = response.data.values?.length ?? 0;
  } catch (err) {
    result.sheets.error =
      formatGoogleError(err) +
      " | Also ensure the spreadsheet is shared with the service account email as Editor.";
  }

  return result;
}
