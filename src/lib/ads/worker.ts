import "server-only";
import { randomUUID } from "node:crypto";
import { premiumAdmin, stripeClient } from "@/lib/premium/providers";
import { adsConfig } from "./config";
import { contextPermits, permittedEmail, type AdContext } from "./context";
import { clickIdentifiers, hasMatchingSignal } from "./contracts";
import {
  dataManagerToken,
  importPayload,
  MeasurementError,
  pollImport,
  submitImport,
} from "./data-manager";
import { scanCustomerHistory } from "./invoice";

type Admin = ReturnType<typeof premiumAdmin>;
const issues = new Set([
  "INVOICE_HISTORY_INCOMPLETE",
  "PAYMENT_HISTORY_INCOMPLETE",
  "INVALID_CASH_ALLOCATION",
  "UNVERIFIED_INVOICE_PAYMENT",
  "PAYMENT_TIMESTAMP_INCONSISTENT",
  "PAYMENT_INCONSISTENT",
  "MISSING_PAYMENT_INTENT",
  "PAYMENT_NOT_SETTLED",
  "MISSING_SUCCESSFUL_CHARGE",
  "UNSUPPORTED_PAYMENT_RECORD",
  "CHARGE_NOT_SETTLED",
  "MISSING_PAYMENT_SUCCESS_TIME",
  "HISTORY_SCAN_DEFERRED",
  "IDENTITY_REVIEW_REQUIRED",
]);
function code(error: unknown) {
  return error instanceof MeasurementError
    ? error.code
    : error instanceof Error && issues.has(error.message)
      ? error.message
      : "MEASUREMENT_PROVIDER_UNAVAILABLE";
}
function checked<T extends { error: unknown }>(result: T): T {
  if (result.error)
    throw new MeasurementError("MEASUREMENT_STORAGE_UNAVAILABLE", true);
  return result;
}
async function employerCustomers(db: Admin, owner: string, employerId: string) {
  const [current, history] = await Promise.all([
    db
      .from("organisation_billing_accounts")
      .select("stripe_customer_id,organisation_id,organisations(is_test)")
      .eq("billing_user_id", owner)
      .eq("livemode", true),
    db
      .from("billing_customer_history")
      .select("stripe_customer_id,organisation_id,organisations(is_test)")
      .eq("user_id", owner)
      .eq("livemode", true),
  ]);
  checked(current);
  checked(history);
  const rows = [...(current.data || []), ...(history.data || [])].filter(
    (r) =>
      r.organisations &&
      !(r.organisations as unknown as { is_test: boolean }).is_test,
  );
  for (const row of rows) {
    checked(
      await db.from("ads_customer_identities").upsert(
        {
          stripe_customer_id: row.stripe_customer_id,
          employer_id: employerId,
        },
        { onConflict: "stripe_customer_id", ignoreDuplicates: true },
      ),
    );
    checked(
      await db
        .from("ads_business_identities")
        .upsert(
          { organisation_id: row.organisation_id, employer_id: employerId },
          { onConflict: "organisation_id", ignoreDuplicates: true },
        ),
    );
    const [customer, org] = await Promise.all([
      db
        .from("ads_customer_identities")
        .select("employer_id")
        .eq("stripe_customer_id", row.stripe_customer_id)
        .single(),
      db
        .from("ads_business_identities")
        .select("employer_id")
        .eq("organisation_id", row.organisation_id)
        .single(),
    ]);
    checked(customer);
    checked(org);
    if (
      customer.data?.employer_id !== employerId ||
      org.data?.employer_id !== employerId
    )
      throw new Error("IDENTITY_REVIEW_REQUIRED");
  }
  return [...new Set(rows.map((r) => r.stripe_customer_id as string))];
}
async function saveState(
  db: Admin,
  id: string,
  state: string,
  errorCode: string | null,
  extra: Record<string, unknown> = {},
) {
  checked(
    await db
      .from("ads_conversion_events")
      .update({
        status: state,
        error_code: errorCode,
        updated_at: new Date().toISOString(),
        ...extra,
      })
      .eq("id", id),
  );
  checked(
    await db.from("ads_delivery_attempts").insert({
      event_id: id,
      state,
      code: errorCode,
      ...(typeof extra.request_id === "string"
        ? { request_id: extra.request_id }
        : {}),
    }),
  );
}
export async function runMeasurementWorker() {
  const config = adsConfig();
  if (config.production) checked(await premiumAdmin().rpc("ads_purge_expired"));
  if (!config.capture)
    return { disabled: true, reason: "CAPTURE_NOT_CONFIGURED" };
  const db = premiumAdmin();
  const token = randomUUID();
  const lock = checked(await db.rpc("ads_worker_lock", { p_token: token }));
  if (lock.data !== true) return { busy: true };
  const deadline = performance.now() + 95000;
  const result = {
    scanned: 0,
    held: 0,
    submitted: 0,
    processed: 0,
    suppressed: 0,
    failed: 0,
    purchaseConfigured: config.purchase,
  };
  try {
    checked(await db.rpc("ads_seed_employers"));
    const claimed = checked(
      await db.rpc("ads_claim_employers", { p_limit: 5 }),
    );
    const stripe = stripeClient("live");
    for (const employer of claimed.data || []) {
      try {
        if (performance.now() > deadline - 20000)
          throw new Error("HISTORY_SCAN_DEFERRED");
        const customers = await employerCustomers(
          db,
          employer.owner_user_id,
          employer.id,
        );
        const first = await scanCustomerHistory(
          stripe,
          customers,
          Math.min(deadline - 15000, performance.now() + 45000),
        );
        checked(
          await db.rpc("ads_complete_history", {
            p_employer: employer.id,
            p_token: employer.scan_token,
            p_first: first,
          }),
        );
        result.scanned++;
        if (first && (first.refundedMinor > 0 || first.disputed)) {
          const reason = first.disputed
            ? "DISPUTE_REVIEW_REQUIRED"
            : "REFUND_REVIEW_REQUIRED";
          checked(
            await db.from("ads_payment_reviews").upsert(
              {
                invoice_id: first.invoiceId,
                employer_id: employer.id,
                reason,
                refunded_minor: first.refundedMinor,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "invoice_id" },
            ),
          );
          const event = checked(
            await db
              .from("ads_conversion_events")
              .select("id,status")
              .eq("employer_id", employer.id)
              .eq("kind", "purchase")
              .maybeSingle(),
          );
          if (event.data)
            checked(
              await db
                .from("ads_conversion_events")
                .update({
                  review_code: reason,
                  ...(event.data.status !== "processed" &&
                  event.data.status !== "submitted"
                    ? { status: "review" }
                    : {}),
                })
                .eq("id", event.data.id),
            );
          result.held++;
        }
      } catch (error) {
        checked(
          await db.rpc("ads_complete_history", {
            p_employer: employer.id,
            p_token: employer.scan_token,
            p_first: null,
            p_issue: code(error),
          }),
        );
        result.held++;
      }
    }
    const events = checked(
      await db
        .from("ads_conversion_events")
        .select("*")
        .eq("kind", "purchase")
        .in("status", ["queued", "retry", "submitted", "configuration_hold"])
        .lte("next_attempt_at", new Date().toISOString())
        .order("occurred_at")
        .limit(20),
    );
    let accessToken: string | undefined;
    for (const event of events.data || []) {
      if (performance.now() > deadline - 10000) break;
      const attempts = event.attempts + 1;
      const retryAt = new Date(
        Date.now() +
          Math.min(24 * 3600000, 60000 * 2 ** Math.min(attempts, 10)),
      ).toISOString();
      try {
        if (!config.purchase) {
          if (event.status !== "configuration_hold")
            await saveState(
              db,
              event.id,
              "configuration_hold",
              "PURCHASE_DESTINATION_NOT_CONFIGURED",
            );
          continue;
        }
        const destination = `${config.customerId}/${config.purchaseActionId}`;
        if (event.destination && event.destination !== destination) {
          await saveState(db, event.id, "review", "DESTINATION_CHANGED");
          result.held++;
          continue;
        }
        if (event.status === "submitted" && event.request_id) {
          accessToken ??= await dataManagerToken();
          const processed = await pollImport(
            accessToken,
            event.request_id,
            config,
          );
          await saveState(db, event.id, processed.state, processed.code, {
            next_attempt_at: retryAt,
            attempts,
            request_id: event.request_id,
          });
          if (processed.state === "processed") result.processed++;
          else if (processed.state === "permanent_failure") result.failed++;
          continue;
        }
        if (Date.parse(event.occurred_at) < config.start) {
          await saveState(
            db,
            event.id,
            "historical",
            "BEFORE_TRACKING_CUTOVER",
          );
          continue;
        }
        // Conservative automatic retry horizon. Older events are held for an
        // operator to check the route's age/identifier limits, never re-dated.
        if (Date.now() - Date.parse(event.occurred_at) > 7 * 86400000) {
          await saveState(db, event.id, "review", "UPLOAD_AGE_REVIEW_REQUIRED");
          result.held++;
          continue;
        }
        if (
          event.review_code ||
          !Number.isSafeInteger(Number(event.value_minor)) ||
          Number(event.value_minor) <= 0
        ) {
          await saveState(
            db,
            event.id,
            "review",
            event.review_code || "VALUE_REVIEW_REQUIRED",
          );
          result.held++;
          continue;
        }
        const context = event.context_id
          ? (checked(
              await db
                .from("ads_contexts")
                .select("*")
                .eq("id", event.context_id)
                .maybeSingle(),
            ).data as AdContext | null)
          : null;
        if (!contextPermits(context, event.occurred_at)) {
          await saveState(db, event.id, "suppressed", "CONSENT_NOT_PERMITTED");
          result.suppressed++;
          continue;
        }
        const identifiers =
          context!.identifiers_at &&
          Date.parse(context!.identifiers_at!) <= Date.parse(event.occurred_at)
            ? clickIdentifiers(context!.identifiers)
            : {};
        const emailHash = permittedEmail(
          context!,
          event.occurred_at,
          config.enhanced,
        );
        if (event.delivery_payload?.events?.[0]?.userData && !emailHash) {
          await saveState(
            db,
            event.id,
            "suppressed",
            "ENHANCED_CONSENT_WITHDRAWN",
          );
          result.suppressed++;
          continue;
        }
        if (!hasMatchingSignal(identifiers, emailHash)) {
          await saveState(
            db,
            event.id,
            "suppressed",
            "NO_PERMITTED_MATCHING_SIGNAL",
          );
          result.suppressed++;
          continue;
        }
        const payload =
          event.delivery_payload ||
          importPayload(config, {
            transactionId: event.transaction_id,
            occurredAt: event.occurred_at,
            valueMinor: Number(event.value_minor),
            identifiers,
            emailHash,
          });
        // Persist before sending. A crash after HTTP success retries exactly the
        // same action, transaction, value, timestamp and matching payload.
        checked(
          await db
            .from("ads_conversion_events")
            .update({
              delivery_payload: payload,
              destination,
              attempts,
              next_attempt_at: retryAt,
            })
            .eq("id", event.id),
        );
        accessToken ??= await dataManagerToken();
        const response = await submitImport(accessToken, payload);
        await saveState(
          db,
          event.id,
          "submitted",
          response.warning ? "GOOGLE_INGEST_WARNING" : null,
          {
            request_id: response.requestId,
            next_attempt_at: retryAt,
            attempts,
          },
        );
        result.submitted++;
      } catch (error) {
        const retryable =
          !(error instanceof MeasurementError) || error.retryable;
        await saveState(
          db,
          event.id,
          retryable ? "retry" : "configuration_hold",
          code(error),
          { attempts, next_attempt_at: retryAt },
        );
        result.failed++;
      }
    }
    return result;
  } finally {
    checked(
      await db.rpc("ads_worker_lock", { p_token: token, p_release: true }),
    );
  }
}
