import "server-only";
import { z } from "zod";
import { type billingScope } from "./business-billing";
import { customerFor } from "./billing";
import { premiumAdmin, stripeClient } from "./providers";
import { PremiumError } from "./http";
import { billingModeFor } from "./billing-mode";
type Scope = Awaited<ReturnType<typeof billingScope>>;
const cursorSchema = z.record(
  z.string().regex(/^cus_[a-zA-Z0-9]+$/),
  z.string().regex(/^in_[a-zA-Z0-9]+$/),
);
export async function invoiceHistory(scope: Scope, token: string | null) {
  let cursors: Record<string, string> = {};
  if (token) {
    try {
      if (token.length > 20000) throw new Error();
      cursors = cursorSchema.parse(
        JSON.parse(Buffer.from(token, "base64url").toString("utf8")),
      );
    } catch {
      throw new PremiumError(
        "INVALID_CURSOR",
        "Reload invoice history and try again.",
      );
    }
  }
  let customers: string[];
  const modes: Record<string, "test" | "live"> = {};
  if (scope.business) {
    const { data, error } = await premiumAdmin()
      .from("organisation_billing_accounts")
      .select("stripe_customer_id,livemode")
      .eq("billing_user_id", scope.user.id);
    if (error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Invoice history could not be loaded.",
        503,
      );
    const history = await premiumAdmin()
      .from("billing_customer_history")
      .select("stripe_customer_id,livemode")
      .eq("user_id", scope.user.id);
    if (history.error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Invoice history could not be loaded.",
        503,
      );
    const personal = await customerFor(scope.user);
    const rows = [
      ...(data || []),
      ...(history.data || []),
      ...(personal
        ? [
            {
              stripe_customer_id: personal,
              livemode: billingModeFor(scope.user, "individual") === "live",
            },
          ]
        : []),
    ].filter((row) => Boolean(row.livemode) === (scope.mode === "live"));
    for (const row of rows)
      modes[row.stripe_customer_id] = row.livemode ? "live" : "test";
    customers = [
      ...new Set<string>(rows.map((row) => row.stripe_customer_id)),
    ].sort();
  } else {
    const customer = await customerFor(scope.user);
    customers = customer ? [customer] : [];
    if (customer) modes[customer] = scope.mode;
  }
  if (Object.keys(cursors).some((customer) => !customers.includes(customer)))
    throw new PremiumError(
      "INVALID_CURSOR",
      "Reload invoice history and try again.",
    );
  const batches = await Promise.all(
    customers.map(async (customer) => {
      const mode = modes[customer] || "test";
      const batch = await stripeClient(mode).invoices.list({
        customer,
        limit: 11,
        ...(cursors[customer] ? { starting_after: cursors[customer] } : {}),
      });
      if (batch.data.some((invoice) => invoice.livemode !== (mode === "live")))
        throw new PremiumError(
          "BILLING_REVIEW_REQUIRED",
          "This billing account needs review.",
          409,
        );
      return batch.data.map((invoice, index) => ({ invoice, customer, index }));
    }),
  );
  // Keep Stripe's order within each customer's same-second invoices so every
  // consumed cursor is a prefix of that customer's stream.
  const sorted = batches
    .flat()
    .sort(
      (a, b) =>
        b.invoice.created - a.invoice.created ||
        a.customer.localeCompare(b.customer) ||
        a.index - b.index,
    );
  const page = sorted.slice(0, 10);
  const next = { ...cursors };
  for (const item of page) next[item.customer] = item.invoice.id;
  return {
    invoices: page.map(({ invoice: i }) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      total: i.total,
      currency: i.currency,
      date: i.created,
      url: i.hosted_invoice_url,
      pdf: i.invoice_pdf,
    })),
    nextCursor:
      sorted.length > 10
        ? Buffer.from(JSON.stringify(next)).toString("base64url")
        : null,
  };
}
