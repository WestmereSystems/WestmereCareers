import "server-only";
import type { AdIdentifiers } from "./contracts";
import { hasMatchingSignal } from "./contracts";

export type ImportDestination = {
  customerId: string;
  loginId: string;
  purchaseActionId: string;
};
export type ImportEvent = {
  transactionId: string;
  occurredAt: string;
  valueMinor: number;
  identifiers: AdIdentifiers;
  emailHash?: string | null;
};
export function importPayload(
  destination: ImportDestination,
  event: ImportEvent,
) {
  if (
    !/^\d{10}$/.test(destination.customerId) ||
    !/^\d{10}$/.test(destination.loginId) ||
    !/^\d+$/.test(destination.purchaseActionId) ||
    !hasMatchingSignal(event.identifiers, event.emailHash) ||
    !Number.isSafeInteger(event.valueMinor) ||
    event.valueMinor <= 0 ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(event.transactionId)
  )
    throw new Error("INVALID_IMPORT_EVENT");
  return {
    destinations: [
      {
        operatingAccount: {
          accountType: "GOOGLE_ADS",
          accountId: destination.customerId,
        },
        loginAccount: {
          accountType: "GOOGLE_ADS",
          accountId: destination.loginId,
        },
        productDestinationId: destination.purchaseActionId,
      },
    ],
    events: [
      {
        transactionId: event.transactionId,
        eventTimestamp: event.occurredAt,
        eventSource: "WEB",
        conversionValue: event.valueMinor / 100,
        currency: "AUD",
        consent: { adUserData: "GRANTED", adPersonalization: "DENIED" },
        ...(Object.keys(event.identifiers).length
          ? { adIdentifiers: event.identifiers }
          : {}),
        ...(event.emailHash
          ? {
              userData: {
                userIdentifiers: [{ emailAddress: event.emailHash }],
              },
            }
          : {}),
      },
    ],
    ...(event.emailHash ? { encoding: "HEX" } : {}),
  };
}
export class MeasurementError extends Error {
  constructor(
    public code: string,
    public retryable = false,
  ) {
    super(code);
  }
}
export type DataManagerFetch = typeof fetch;
export async function dataManagerToken(fetcher: DataManagerFetch = fetch) {
  const {
    GOOGLE_DATA_MANAGER_CLIENT_ID: clientId,
    GOOGLE_DATA_MANAGER_CLIENT_SECRET: secret,
    GOOGLE_DATA_MANAGER_REFRESH_TOKEN: refreshToken,
  } = process.env;
  if (!clientId || !secret || !refreshToken)
    throw new MeasurementError("GOOGLE_AUTH_NOT_CONFIGURED");
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new MeasurementError(
      "GOOGLE_AUTH_FAILED",
      response.status >= 500 || response.status === 429,
    );
  const result = await response.json();
  if (typeof result.access_token !== "string")
    throw new MeasurementError("GOOGLE_AUTH_RESPONSE_INVALID");
  return result.access_token as string;
}
export async function submitImport(
  token: string,
  payload: ReturnType<typeof importPayload>,
  fetcher: DataManagerFetch = fetch,
) {
  const response = await fetcher(
    "https://datamanager.googleapis.com/v1/events:ingest",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new MeasurementError(
      `GOOGLE_INGEST_HTTP_${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  const result = await response.json();
  if (typeof result.requestId !== "string" || !result.requestId)
    throw new MeasurementError("GOOGLE_INGEST_RESPONSE_INVALID", true);
  return {
    requestId: result.requestId as string,
    warning: Boolean(result.fieldWarnings?.length),
  };
}
export function processingResult(
  result: unknown,
  destination: ImportDestination,
): {
  state: "processed" | "submitted" | "retry" | "permanent_failure";
  code: string | null;
} {
  const response = result as {
    requestStatusPerDestination?: Array<{
      destination?: {
        operatingAccount?: { accountId?: string };
        productDestinationId?: string;
      };
      requestStatus?: string;
      errorInfo?: { errorCounts?: Array<{ reason?: string }> };
      warningInfo?: unknown;
      eventsIngestionStatus?: { recordCount?: string };
    }>;
  };
  const rows = response?.requestStatusPerDestination;
  const row = rows?.find(
    (r) =>
      r.destination?.operatingAccount?.accountId === destination.customerId &&
      r.destination?.productDestinationId === destination.purchaseActionId,
  );
  if (!row || rows?.length !== 1)
    return { state: "submitted", code: "GOOGLE_PROCESSING_STATUS_PENDING" };
  const errors = row.errorInfo?.errorCounts || [];
  if (
    row.requestStatus === "SUCCESS" &&
    !errors.length &&
    row.eventsIngestionStatus?.recordCount === "1"
  )
    return {
      state: "processed",
      code: row.warningInfo ? "GOOGLE_PROCESSING_WARNING" : null,
    };
  if (["FAILED", "PARTIAL_SUCCESS"].includes(row.requestStatus || "")) {
    const reason = errors[0]?.reason || "GOOGLE_PROCESSING_FAILED";
    return {
      state:
        errors.length > 0 &&
        errors.every(
          (e) => e.reason === "PROCESSING_ERROR_REASON_INTERNAL_ERROR",
        )
          ? "retry"
          : "permanent_failure",
      code: /^[A-Z_]{1,120}$/.test(reason)
        ? reason
        : "GOOGLE_PROCESSING_FAILED",
    };
  }
  return { state: "submitted", code: "GOOGLE_PROCESSING_PENDING" };
}
export async function pollImport(
  token: string,
  requestId: string,
  destination: ImportDestination,
  fetcher: DataManagerFetch = fetch,
) {
  const response = await fetcher(
    `https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=${encodeURIComponent(requestId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new MeasurementError(
      `GOOGLE_STATUS_HTTP_${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  return processingResult(await response.json(), destination);
}
