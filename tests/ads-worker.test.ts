import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: mocks.admin,
  stripeClient: mocks.stripe,
}));
import { runMeasurementWorker } from "../src/lib/ads/worker";
import { GET } from "../src/app/api/ads/reconcile/route";

type Row = Record<string, unknown>;
type Reply = { data: Row[] | Row | null; error: null };
let tables: Record<string, Row[]>;
let leaseHeld = false;
let stripe: ReturnType<typeof stripeFixture>;
let sent: unknown[];
let failFirstUpload = false;
let processing = "SUCCESS";
let currentEmployerEligible = true;
const employer = "91000000-0000-4000-8000-000000000001",
  owner = "91000000-0000-4000-8000-000000000002",
  context = "91000000-0000-4000-8000-000000000003";
const paid = Math.floor(Date.now() / 1000) - 60;
class Query implements PromiseLike<Reply> {
  private filters: Array<(row: Row) => boolean> = [];
  private values: Row | Row[] | undefined;
  private operation = "read";
  private one = false;
  private maximum = Infinity;
  private conflict: string | undefined;
  private ignore = false;
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((r) => r[key] === value);
    return this;
  }
  gt(key: string, value: string) {
    this.filters.push((r) => String(r[key]) > value);
    return this;
  }
  lt(key: string, value: string) {
    this.filters.push((r) => String(r[key]) < value);
    return this;
  }
  lte(key: string, value: string) {
    this.filters.push((r) => String(r[key]) <= value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[key]));
    return this;
  }
  not(key: string, _op: string, value: unknown) {
    this.filters.push((r) => r[key] !== value && r[key] !== undefined);
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.maximum = n;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  update(values: Row) {
    this.operation = "update";
    this.values = values;
    return this;
  }
  insert(values: Row | Row[]) {
    this.operation = "insert";
    this.values = values;
    return this;
  }
  upsert(
    values: Row,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.operation = "upsert";
    this.values = values;
    this.conflict = options?.onConflict;
    this.ignore = options?.ignoreDuplicates ?? false;
    return this;
  }
  private async execute(): Promise<Reply> {
    const rows = (tables[this.table] ??= []);
    let selected = rows
      .filter((r) => this.filters.every((f) => f(r)))
      .slice(0, this.maximum);
    if (this.operation === "update")
      selected.forEach((r) => Object.assign(r, this.values));
    if (this.operation === "insert" || this.operation === "upsert")
      for (const value of Array.isArray(this.values)
        ? this.values
        : [this.values!]) {
        const existing = this.conflict
          ? rows.find((r) => r[this.conflict!] === value[this.conflict!])
          : undefined;
        if (existing) {
          if (!this.ignore) Object.assign(existing, value);
          selected = [existing];
        } else {
          rows.push({ ...value });
          selected = [rows.at(-1)!];
        }
      }
    return { data: this.one ? selected[0] || null : selected, error: null };
  }
  then<TResult1 = Reply, TResult2 = never>(
    onfulfilled?: ((value: Reply) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
function stripeFixture() {
  return {
    invoices: {
      list: vi.fn().mockResolvedValue({
        has_more: false,
        data: [
          {
            id: "in_fixture",
            livemode: true,
            status: "paid",
            amount_remaining: 0,
            amount_paid: 11000,
            total: 11000,
            total_excluding_tax: 10000,
            currency: "aud",
            starting_balance: 0,
            pre_payment_credit_notes_amount: 0,
            post_payment_credit_notes_amount: 0,
            customer: "cus_fixture",
            parent: {
              type: "subscription_details",
              subscription_details: { subscription: "sub_fixture" },
            },
            lines: {
              has_more: false,
              data: [{ parent: { type: "subscription_item_details" } }],
            },
            status_transitions: { paid_at: paid },
            total_taxes: [
              { amount: 1000, tax_rate_details: { tax_rate: "txr_fixture" } },
            ],
          },
        ],
      }),
    },
    invoicePayments: {
      list: vi.fn().mockResolvedValue({
        has_more: false,
        data: [
          {
            livemode: true,
            invoice: "in_fixture",
            currency: "aud",
            status: "paid",
            amount_paid: 11000,
            payment: { type: "payment_intent", payment_intent: "pi_fixture" },
            status_transitions: { paid_at: paid },
          },
        ],
      }),
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        livemode: true,
        status: "succeeded",
        customer: "cus_fixture",
        currency: "aud",
        amount_received: 11000,
        latest_charge: "ch_fixture",
      }),
    },
    charges: {
      retrieve: vi.fn().mockResolvedValue({
        livemode: true,
        paid: true,
        captured: true,
        status: "succeeded",
        customer: "cus_fixture",
        currency: "aud",
        amount_captured: 11000,
        amount_refunded: 0,
        disputed: false,
      }),
    },
    taxRates: {
      retrieve: vi.fn().mockResolvedValue({
        id: "txr_fixture",
        country: "AU",
        tax_type: "gst",
      }),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  sent = [];
  leaseHeld = false;
  failFirstUpload = false;
  processing = "SUCCESS";
  currentEmployerEligible = true;
  const settings = {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://westmere.test",
    GOOGLE_ADS_PRODUCTION_ORIGINS: "https://westmere.test",
    GOOGLE_ADS_CAPTURE_ENABLED: "true",
    GOOGLE_ADS_DELIVERY_ENABLED: "true",
    GOOGLE_ADS_TRACKING_START_AT: new Date(Date.now() - 86400000).toISOString(),
    GOOGLE_ADS_CONSENT_POLICY_REFERENCE: "fixture-policy",
    GOOGLE_ADS_TAG_ID: "AW-1234567890",
    GOOGLE_ADS_REGISTRATION_LABEL: "fixture_label",
    GOOGLE_ADS_PURCHASE_ROUTE: "server_import",
    GOOGLE_ADS_CONVERSION_CUSTOMER_ID: "1234567890",
    GOOGLE_ADS_PURCHASE_IMPORT_ACTION_ID: "987654321",
    GOOGLE_DATA_MANAGER_CLIENT_ID: "fixture-client",
    GOOGLE_DATA_MANAGER_CLIENT_SECRET: "fixture-secret",
    GOOGLE_DATA_MANAGER_REFRESH_TOKEN: "fixture-refresh",
    GOOGLE_ADS_ENHANCED_CONVERSIONS_ENABLED: "false",
  };
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  tables = {
    ads_employers: [
      { id: employer, owner_user_id: owner, scan_token: "fixture-lease" },
    ],
    organisation_billing_accounts: [
      {
        stripe_customer_id: "cus_fixture",
        organisation_id: "org_fixture",
        billing_user_id: owner,
        livemode: true,
        organisations: { is_test: false },
      },
    ],
    billing_customer_history: [],
    ads_contexts: [
      {
        id: context,
        owner_user_id: owner,
        measurement: true,
        ad_user_data: true,
        enhanced: false,
        consent_version: "2026-11-26.1",
        granted_at: new Date(Date.now() - 7200000).toISOString(),
        user_data_granted_at: new Date(Date.now() - 7200000).toISOString(),
        withdrawn_at: null,
        identifiers: { gclid: "fixture_click" },
        identifiers_at: new Date(Date.now() - 7200000).toISOString(),
        email_hash: null,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
    ads_conversion_events: [],
    ads_delivery_attempts: [],
    ads_payment_reviews: [],
  };
  mocks.admin.mockReturnValue({
    from: (table: string) => new Query(table),
    rpc: vi.fn().mockImplementation(async (name: string, args: Row = {}) => {
      if (name === "ads_worker_lock") {
        if (args.p_release) {
          leaseHeld = false;
          return { data: true, error: null };
        }
        if (leaseHeld) return { data: false, error: null };
        leaseHeld = true;
        return { data: true, error: null };
      }
      if (name === "ads_claim_employers")
        return { data: tables.ads_employers, error: null };
      if (name === "ads_delivery_eligible")
        return { data: currentEmployerEligible, error: null };
      if (name === "ads_complete_history" && args.p_first) {
        const first = args.p_first as Row;
        if (!tables.ads_conversion_events.length)
          tables.ads_conversion_events.push({
            id: "91000000-0000-4000-8000-000000000004",
            employer_id: employer,
            kind: "purchase",
            transaction_id: "wm-fixture-stable",
            invoice_id: first.invoiceId,
            occurred_at: first.paidAt,
            value_minor: first.valueMinor,
            context_id: context,
            status: first.valueMinor ? "queued" : "review",
            next_attempt_at: new Date(0).toISOString(),
            attempts: 0,
            delivery_payload: null,
            review_code: null,
          });
      }
      return { data: null, error: null };
    }),
  });
  stripe = stripeFixture();
  mocks.stripe.mockReturnValue(stripe);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes("oauth2"))
        return Response.json({ access_token: "fixture-access-token" });
      if (url.includes("events:ingest")) {
        sent.push(JSON.parse(options?.body as string));
        if (failFirstUpload) {
          failFirstUpload = false;
          throw new TypeError("simulated timeout");
        }
        return Response.json({ requestId: "fixture-request" });
      }
      if (url.includes("requestStatus"))
        return Response.json({
          requestStatusPerDestination: [
            {
              destination: {
                operatingAccount: { accountId: "1234567890" },
                productDestinationId: "987654321",
              },
              requestStatus: processing,
              eventsIngestionStatus: { recordCount: "1" },
            },
          ],
        });
      throw new Error("Unexpected external call");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const readyAgain = () =>
  tables.ads_conversion_events.forEach((e) => {
    e.next_attempt_at = new Date(0).toISOString();
  });
describe("asynchronous purchase delivery without a browser", () => {
  it("captures a verified first payment, submits exact AUD revenue, then independently checks processing", async () => {
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("submitted");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      events: [
        {
          transactionId: "wm-fixture-stable",
          conversionValue: 100,
          currency: "AUD",
          eventTimestamp: new Date(paid * 1000).toISOString(),
          adIdentifiers: { gclid: "fixture_click" },
        },
      ],
    });
    readyAgain();
    currentEmployerEligible = false;
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("processed");
    await runMeasurementWorker();
    expect(sent).toHaveLength(1);
  });
  it("does not acknowledge an HTTP 200 while Google still processes the event", async () => {
    await runMeasurementWorker();
    processing = "PROCESSING";
    readyAgain();
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("submitted");
  });
  it("retries a timeout with exactly the same persisted payload and ID", async () => {
    failFirstUpload = true;
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("retry");
    readyAgain();
    await runMeasurementWorker();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(tables.ads_conversion_events).toHaveLength(1);
  });
  it("captures business eligibility even when destination configuration is missing", async () => {
    vi.stubEnv("GOOGLE_DATA_MANAGER_REFRESH_TOKEN", "");
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("configuration_hold");
    expect(sent).toHaveLength(0);
  });
  it("suppresses denied, withdrawn or unavailable matching permission without promoting a renewal", async () => {
    tables.ads_contexts[0].withdrawn_at = new Date().toISOString();
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("suppressed");
    expect(sent).toHaveLength(0);
  });
  it("retains the acquisition but sends nothing after current employer eligibility is withdrawn", async () => {
    currentEmployerEligible = false;
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0]).toMatchObject({
      invoice_id: "in_fixture",
      transaction_id: "wm-fixture-stable",
      status: "suppressed",
      error_code: "CURRENT_EMPLOYER_INELIGIBLE",
    });
    expect(sent).toHaveLength(0);
    expect(stripe.invoices.list).toHaveBeenCalled();
  });
  it("quarantines refunds against the same acquisition instead of sending negative revenue", async () => {
    stripe.charges.retrieve.mockResolvedValue({
      ...(await stripe.charges.retrieve()),
      amount_refunded: 11000,
    });
    await runMeasurementWorker();
    expect(tables.ads_conversion_events[0].status).toBe("review");
    expect(tables.ads_payment_reviews[0].reason).toBe("REFUND_REVIEW_REQUIRED");
    expect(sent).toHaveLength(0);
  });
  it("does not execute in preview or allow an unauthenticated scheduled request", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await runMeasurementWorker()).toMatchObject({ disabled: true });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(
      (await GET(new Request("https://westmere.test/api/ads/reconcile")))
        .status,
    ).toBe(401);
  });
});
