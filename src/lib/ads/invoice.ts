import type Stripe from "stripe";
import { acquisitionValue } from "./contracts";

export type VerifiedCash = {
  amount: number;
  paidAt: number;
  refundedMinor: number;
  disputed: boolean;
};
export type FirstPayment = {
  invoiceId: string;
  paidAt: string;
  valueMinor: number | null;
  issue: string | null;
  refundedMinor: number;
  disputed: boolean;
};
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n);
const idOf = (o: string | { id: string } | null | undefined) =>
  typeof o === "string" ? o : o?.id;

/** Positive cash establishes lifetime eligibility even if its value needs review. */
export function evaluateInvoice(
  invoice: Stripe.Invoice,
  cash: VerifiedCash[],
  gstRates: Set<string>,
): FirstPayment | null {
  if (
    !invoice.livemode ||
    invoice.status !== "paid" ||
    invoice.amount_remaining !== 0 ||
    invoice.parent?.type !== "subscription_details"
  )
    return null;
  if (!integer(invoice.amount_paid) || invoice.amount_paid < 0)
    throw new Error("INVOICE_HISTORY_INCOMPLETE");
  const collected = cash.reduce((sum, p) => sum + p.amount, 0);
  if (!integer(collected)) throw new Error("INVALID_CASH_ALLOCATION");
  if (collected <= 0) {
    // A paid invoice with an unexplained positive amount is not evidence of a
    // first cash payment. Block the history decision instead of skipping it.
    if (invoice.amount_paid > 0 && invoice.total > 0)
      throw new Error("UNVERIFIED_INVOICE_PAYMENT");
    return null;
  }
  const paidAt = invoice.status_transitions.paid_at;
  if (
    !integer(paidAt) ||
    paidAt <= 0 ||
    cash.some(
      (p) =>
        !integer(p.paidAt) ||
        p.paidAt > paidAt ||
        !integer(p.amount) ||
        p.amount <= 0,
    )
  )
    throw new Error("PAYMENT_TIMESTAMP_INCONSISTENT");
  let issue: string | null = null;
  let valueMinor: number | null = null;
  if (invoice.currency !== "aud") issue = "UNSUPPORTED_CURRENCY";
  else if (
    invoice.lines.has_more ||
    !invoice.lines.data.length ||
    invoice.lines.data.some(
      (l) => l.parent?.type !== "subscription_item_details",
    )
  )
    issue = "MIXED_INVOICE_ALLOCATION";
  else if (
    invoice.starting_balance !== 0 ||
    invoice.pre_payment_credit_notes_amount !== 0 ||
    invoice.post_payment_credit_notes_amount !== 0 ||
    collected !== invoice.total ||
    collected !== invoice.amount_paid
  )
    issue = "CREDIT_OR_PARTIAL_ALLOCATION";
  else if (
    !Array.isArray(invoice.total_taxes) ||
    !integer(invoice.total_excluding_tax)
  )
    issue = "MISSING_RECORDED_TAX";
  else if (
    invoice.total_taxes.some(
      (t) =>
        !integer(t.amount) ||
        t.amount < 0 ||
        (t.amount > 0 && !gstRates.has(t.tax_rate_details?.tax_rate || "")),
    )
  )
    issue = "UNSUPPORTED_TAX_ALLOCATION";
  else {
    const gst = invoice.total_taxes.reduce((sum, t) => sum + t.amount, 0);
    if (invoice.total - invoice.total_excluding_tax !== gst)
      issue = "INCONSISTENT_RECORDED_TAX";
    else {
      try {
        valueMinor = acquisitionValue(collected, gst);
      } catch {
        issue = "INVALID_REVENUE_ALLOCATION";
      }
    }
  }
  return {
    invoiceId: invoice.id,
    paidAt: new Date(paidAt * 1000).toISOString(),
    valueMinor,
    issue,
    refundedMinor: cash.reduce((s, p) => s + p.refundedMinor, 0),
    disputed: cash.some((p) => p.disputed),
  };
}

/** All data is retrieved from the live API, independently of webhook arrival order. */
export async function verifyInvoiceCash(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<VerifiedCash[]> {
  const customer = idOf(invoice.customer);
  const payments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    status: "paid",
    limit: 100,
  });
  if (payments.has_more) throw new Error("PAYMENT_HISTORY_INCOMPLETE");
  const cash: VerifiedCash[] = [];
  for (const payment of payments.data) {
    if (
      !payment.livemode ||
      idOf(payment.invoice) !== invoice.id ||
      payment.currency !== invoice.currency ||
      payment.status !== "paid"
    )
      throw new Error("PAYMENT_INCONSISTENT");
    if (!payment.amount_paid) continue;
    let charge: Stripe.Charge;
    if (payment.payment.type === "payment_intent") {
      const ref = idOf(payment.payment.payment_intent);
      if (!ref) throw new Error("MISSING_PAYMENT_INTENT");
      const intent = await stripe.paymentIntents.retrieve(ref);
      if (
        !intent.livemode ||
        intent.status !== "succeeded" ||
        idOf(intent.customer) !== customer ||
        intent.currency !== invoice.currency ||
        intent.amount_received < payment.amount_paid
      )
        throw new Error("PAYMENT_NOT_SETTLED");
      const chargeId = idOf(intent.latest_charge);
      if (!chargeId) throw new Error("MISSING_SUCCESSFUL_CHARGE");
      charge = await stripe.charges.retrieve(chargeId);
    } else if (
      payment.payment.type === "charge" &&
      idOf(payment.payment.charge)
    ) {
      charge = await stripe.charges.retrieve(idOf(payment.payment.charge)!);
    } else throw new Error("UNSUPPORTED_PAYMENT_RECORD");
    if (
      !charge.livemode ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== "succeeded" ||
      idOf(charge.customer) !== customer ||
      charge.currency !== invoice.currency ||
      charge.amount_captured < payment.amount_paid
    )
      throw new Error("CHARGE_NOT_SETTLED");
    const at = payment.status_transitions.paid_at;
    if (!at) throw new Error("MISSING_PAYMENT_SUCCESS_TIME");
    cash.push({
      amount: payment.amount_paid,
      paidAt: at,
      refundedMinor: charge.amount_refunded,
      disputed: charge.disputed,
    });
  }
  return cash;
}

export async function scanCustomerHistory(
  stripe: Stripe,
  customers: string[],
  deadline = performance.now() + 60000,
): Promise<FirstPayment | null> {
  const found: FirstPayment[] = [];
  const gstRates = new Set<string>();
  for (const customer of [...new Set(customers)]) {
    let after: string | undefined;
    let pages = 0;
    for (;;) {
      if (performance.now() >= deadline || ++pages > 20)
        throw new Error("HISTORY_SCAN_DEFERRED");
      const page = await stripe.invoices.list({
        customer,
        limit: 100,
        starting_after: after,
      });
      for (const invoice of page.data) {
        if (
          invoice.status !== "paid" ||
          invoice.parent?.type !== "subscription_details"
        )
          continue;
        for (const tax of invoice.total_taxes || []) {
          const rateId = tax.tax_rate_details?.tax_rate;
          if (rateId && tax.amount > 0 && !gstRates.has(rateId)) {
            const rate = await stripe.taxRates.retrieve(rateId);
            if (rate.country === "AU" && rate.tax_type === "gst")
              gstRates.add(rate.id);
          }
        }
        const cash = await verifyInvoiceCash(stripe, invoice);
        const payment = evaluateInvoice(invoice, cash, gstRates);
        if (payment) found.push(payment);
      }
      if (!page.has_more) break;
      after = page.data.at(-1)?.id;
      if (!after) throw new Error("INVOICE_HISTORY_INCOMPLETE");
    }
  }
  return (
    found.sort(
      (a, b) =>
        a.paidAt.localeCompare(b.paidAt) ||
        a.invoiceId.localeCompare(b.invoiceId),
    )[0] || null
  );
}
