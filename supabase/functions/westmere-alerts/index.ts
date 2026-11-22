import { renderLaunchEmail } from "../_shared/launch-email.ts";
import { renderMarketingEmail } from "../_shared/marketing-email.ts";
import { renderAccountEmail } from "../_shared/account-email.ts";
import { isDeliverableRecipient } from "../_shared/recipient.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  alertEvents,
  renderAlert,
  retrySeconds,
  uuidPattern,
  verifySvix,
} from "../_shared/alerts.ts";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
function admin() {
  let key = "";
  try {
    key =
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || "";
  } catch {
    /* Legacy compatibility below. */
  }
  key ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL");
  if (!key || !url) throw new Error("DATABASE_NOT_CONFIGURED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function bytes(req: Request, limit = 262144) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    result.set(c, at);
    at += c.length;
  }
  return result;
}
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url),
      route = url.pathname.split("/").pop();
    if (route === "unsubscribe") {
      const token = url.searchParams.get("token") || "";
      if (!uuidPattern.test(token))
        return json({ error: "Invalid unsubscribe link." }, 400);
      if (req.method === "GET")
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: `https://westmere.com.au/email-preferences?token=${token}`,
          },
        });
      if (req.method !== "POST")
        return json({ error: "Use POST to unsubscribe." }, 405);
      const { error } = await admin().rpc("unsubscribe_job_alert", {
        p_token: token,
      });
      if (error)
        return json(
          { error: "Preferences could not be updated. Please try again." },
          503,
        );
      return new Response(
        "Job alerts for this saved search are now paused. You can close this page or manage your saved searches in Westmere Careers.",
        {
          headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    if (route === "webhook") {
      if (req.method !== "POST") return json({ error: "Use POST." }, 405);
      const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
      if (!secret) return json({ error: "Webhook is not configured." }, 503);
      const raw = await bytes(req);
      if (!(await verifySvix(raw, req.headers, secret)))
        return json({ error: "Invalid signature." }, 401);
      let event;
      try {
        event = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return json({ error: "Invalid event." }, 400);
      }
      if (!alertEvents.has(event.type))
        return json({ received: true, ignored: true });
      const id = event.data?.email_id,
        at = event.created_at;
      let outbox = event.data?.tags?.outbox_id;
      if (Array.isArray(event.data?.tags))
        outbox = event.data.tags.find(
          (t: { name: string }) => t.name === "outbox_id",
        )?.value;
      if (
        typeof id !== "string" ||
        id.length > 200 ||
        typeof at !== "string" ||
        !Number.isFinite(Date.parse(at))
      )
        return json({ error: "Invalid event fields." }, 400);
      const { data, error } = await admin().rpc("apply_alert_webhook", {
        p_event_id: req.headers.get("svix-id"),
        p_email_id: id,
        p_type: event.type,
        p_occurred_at: at,
        p_outbox_id:
          typeof outbox === "string" && uuidPattern.test(outbox)
            ? outbox
            : null,
      });
      if (error)
        return json({ error: "Delivery event could not be recorded." }, 503);
      return json({ received: true, matched: data === true });
    }
    if (route !== "dispatch") return json({ error: "Not found." }, 404);
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer [a-f0-9]{64}$/.test(auth))
      return json({ error: "Unauthorised." }, 401);
    const db = admin();
    const permitted = await db.rpc("verify_alert_dispatch", {
      p_authorization: auth,
    });
    if (permitted.error || permitted.data !== true)
      return json({ error: "Unauthorised." }, 401);
    const raw = await bytes(req, 2048);
    let options;
    try {
      options = raw.length ? JSON.parse(new TextDecoder().decode(raw)) : {};
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const key = Deno.env.get("RESEND_API_KEY");
    if (options.dryRun === true)
      return json({
        configured: Boolean(key),
        webhookConfigured: Boolean(Deno.env.get("RESEND_WEBHOOK_SECRET")),
        dryRun: true,
      });
    // Private unsubmitted application documents expire independently of mail.
    const expired = await db.rpc("expire_application_uploads");
    if (!expired.error && expired.data?.length) {
      const paths = expired.data.map(
        (item: { storage_path: string }) => item.storage_path,
      );
      const removed = await db.storage
        .from("application-documents")
        .remove(paths);
      if (!removed.error)
        await db.from("document_cleanup").delete().in("storage_path", paths);
    }
    if (!key) return json({ error: "Sending is not configured." }, 503);
    const prepared = await db.rpc("prepare_job_alerts", { p_limit: 50 });
    if (prepared.error)
      return json({ error: "Outbox preparation unavailable." }, 503);
    const reminders = await db.rpc("queue_employer_reminders");
    if (reminders.error)
      return json({ error: "Hiring reminder preparation unavailable." }, 503);
    const claimed = await db.rpc("claim_job_alerts", { p_limit: 10 });
    if (claimed.error)
      return json({ error: "Delivery queue unavailable." }, 503);
    const items = claimed.data || [];
    let accepted = 0,
      settled = 0,
      providerPause = 0,
      paceMs = 200;
    async function process(item: (typeof items)[number]) {
      if (!isDeliverableRecipient(item.recipient)) {
        await db.rpc("settle_job_alert", {
          p_id: item.id,
          p_lease: item.lease_token,
          p_status: "blocked",
          p_error: "RESERVED_TEST_RECIPIENT",
        });
        return;
      }
      let body;
      try {
        body =
          item.provider_request ??
          (item.kind === "marketing"
            ? renderMarketingEmail(item.id, item.recipient, item.snapshot)
            : item.kind === "launch"
              ? renderLaunchEmail(item.id, item.recipient, item.snapshot)
              : item.kind === "account" || item.kind === "invitation"
                ? renderAccountEmail(item.id, item.recipient, item.snapshot)
                : renderAlert(
                    item.id,
                    item.recipient,
                    item.kind,
                    item.snapshot,
                  ));
      } catch {
        await db.rpc("settle_job_alert", {
          p_id: item.id,
          p_lease: item.lease_token,
          p_status: "blocked",
          p_error: "INVALID_SNAPSHOT",
        });
        return;
      }
      const frozen = await db.rpc("freeze_job_alert", {
        p_id: item.id,
        p_lease: item.lease_token,
        p_request: body,
      });
      if (frozen.error || !frozen.data) return;
      if (providerPause) {
        await db.rpc("settle_job_alert", {
          p_id: item.id,
          p_lease: item.lease_token,
          p_status: "queued",
          p_error: "PROVIDER_COOLDOWN",
          p_retry_seconds: providerPause,
        });
        return;
      }
      let status = "queued",
        provider: string | null = null,
        error = "PROVIDER_RETRY",
        retry = retrySeconds(null, item.attempts);
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `westmere-alert/${item.id}`,
            "User-Agent": "WestmereCareers/1.0",
          },
          body: JSON.stringify(frozen.data),
          signal: AbortSignal.timeout(5000),
        });
        retry = retrySeconds(r.headers.get("Retry-After"), item.attempts);
        const advertisedLimit = Number(r.headers.get("ratelimit-limit"));
        if (advertisedLimit > 0)
          paceMs = Math.max(200, Math.ceil(1000 / advertisedLimit));
        if (r.status === 429) providerPause = retry;
        else if (r.headers.get("ratelimit-remaining") === "0")
          providerPause = Math.max(
            1,
            Math.min(86400, Number(r.headers.get("ratelimit-reset")) || 1),
          );
        if (r.ok) {
          let result;
          try {
            result = await r.json();
          } catch {
            /* Acceptance without an ID is ambiguous. */
          }
          if (typeof result?.id === "string" && result.id.length <= 200) {
            status = "accepted";
            provider = result.id;
            error = "";
          } else {
            status = "ambiguous";
            error = "ACCEPTED_WITHOUT_ID";
          }
        } else if (
          r.status === 429 ||
          r.status >= 500 ||
          r.status === 408 ||
          r.status === 409
        ) {
          status = "queued";
          error = `RESEND_RETRY_${r.status}`;
        } else {
          status = "blocked";
          error = `RESEND_REJECTED_${r.status}`;
        }
      } catch {
        /* Retrying the exact frozen body with the same idempotency key is safe inside the bounded window. */
      }
      const result = await db.rpc("settle_job_alert", {
        p_id: item.id,
        p_lease: item.lease_token,
        p_status: status,
        p_provider_id: provider,
        p_error: error || null,
        p_retry_seconds: retry,
      });
      if (!result.error && result.data) {
        settled++;
        if (status === "accepted") accepted++;
      }
    }
    for (let i = 0; i < items.length; i++) {
      if (i && !providerPause) await new Promise((r) => setTimeout(r, paceMs));
      await process(items[i]);
    }
    await db.rpc("finish_alert_dispatch", { p_retry_seconds: providerPause });
    return json({
      prepared: prepared.data,
      claimed: items.length,
      settled,
      accepted,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error && e.message === "BODY_TOO_LARGE"
            ? "Request too large."
            : "Service temporarily unavailable.",
      },
      e instanceof Error && e.message === "BODY_TOO_LARGE" ? 413 : 503,
    );
  }
});
