import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { adsConfig } from "../src/lib/ads/config";
import {
  acquisitionValue,
  clickIdentifiers,
  deniedGoogleConsent,
  googleConsent,
} from "../src/lib/ads/contracts";
import {
  contextPermits,
  hashEmployerEmail,
  type AdContext,
} from "../src/lib/ads/context";
import { initializeGoogleTag, queueRegistration } from "../src/lib/ads/browser";
import {
  evaluateInvoice,
  scanCustomerHistory,
  verifyInvoiceCash,
} from "../src/lib/ads/invoice";
import {
  importPayload,
  processingResult,
  submitImport,
} from "../src/lib/ads/data-manager";

const destination = {
  customerId: "1234567890",
  loginId: "1234567890",
  purchaseActionId: "987654321",
};
const production = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://westmere.test",
  GOOGLE_ADS_PRODUCTION_ORIGINS: "https://westmere.test",
  GOOGLE_ADS_CAPTURE_ENABLED: "true",
  GOOGLE_ADS_DELIVERY_ENABLED: "true",
  GOOGLE_ADS_TRACKING_START_AT: "2026-11-26T10:00:00+11:00",
  GOOGLE_ADS_CONSENT_POLICY_REFERENCE: "privacy-version-1",
  GOOGLE_ADS_TAG_ID: "AW-1234567890",
  GOOGLE_ADS_REGISTRATION_LABEL: "registration_label",
};
const at = 1795600000;
const invoice = (extra: Partial<Stripe.Invoice> = {}) =>
  ({
    id: "in_first",
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
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_first" },
    },
    lines: {
      has_more: false,
      data: [{ parent: { type: "subscription_item_details" } }],
    },
    status_transitions: { paid_at: at },
    total_taxes: [{ amount: 1000, tax_rate_details: { tax_rate: "txr_gst" } }],
    ...extra,
  }) as Stripe.Invoice;
const cash = [{ amount: 11000, paidAt: at, refundedMinor: 0, disputed: false }];
const rates = new Set(["txr_gst"]);
afterEach(() => vi.unstubAllEnvs());
describe("production and consent boundaries", () => {
  it("disables placeholder, development, preview, unapproved domains and incomplete configuration", () => {
    expect(adsConfig(production).tag).toBe(true);
    for (const change of [
      { NODE_ENV: "development" },
      { VERCEL_ENV: "preview" },
      { NEXT_PUBLIC_SITE_URL: "https://other.test" },
      { GOOGLE_ADS_TRACKING_START_AT: "" },
      { GOOGLE_ADS_CONSENT_POLICY_REFERENCE: "<POLICY>" },
      { GOOGLE_ADS_TAG_ID: "G-1234" },
      { GOOGLE_ADS_REGISTRATION_LABEL: "<LABEL>" },
      { GOOGLE_ADS_DELIVERY_ENABLED: "false" },
    ])
      expect(adsConfig({ ...production, ...change }).tag).toBe(false);
    expect(adsConfig(production).purchase).toBe(false);
  });
  it("maps consent independently and never grants analytics or personalisation", () => {
    expect(
      googleConsent({
        measurement: true,
        adUserData: false,
        enhanced: false,
        version: "v",
      }),
    ).toEqual({ ...deniedGoogleConsent, ad_storage: "granted" });
    expect(
      googleConsent({
        measurement: false,
        adUserData: true,
        enhanced: false,
        version: "v",
      }).ad_storage,
    ).toBe("denied");
  });
  it("validates identifiers and hashes normalized email exactly once", () => {
    expect(
      clickIdentifiers({
        gclid: "valid_-ID",
        wbraid: "<script>",
        email: "private@example.test",
      }),
    ).toEqual({ gclid: "valid_-ID" });
    expect(hashEmployerEmail(" First.Last@GMAIL.COM ")).toBe(
      hashEmployerEmail("firstlast@gmail.com"),
    );
    expect(hashEmployerEmail("employer@example.test")).toHaveLength(64);
  });
  it("rejects unknown, withdrawn, expired and retrospective permission", () => {
    const context = {
      measurement: true,
      ad_user_data: true,
      consent_version: "2026-11-26.1",
      granted_at: "2026-11-25T00:00:00Z",
      user_data_granted_at: "2026-11-25T00:00:00Z",
      expires_at: "2027-01-01T00:00:00Z",
      withdrawn_at: null,
    } as AdContext;
    const when = "2026-11-26T00:00:00Z",
      now = Date.parse(when);
    expect(contextPermits(context, when, now)).toBe(true);
    for (const change of [
      { measurement: false },
      { ad_user_data: false },
      { withdrawn_at: when },
      { expires_at: when },
      { user_data_granted_at: "2026-11-27T00:00:00Z" },
    ])
      expect(contextPermits({ ...context, ...change }, when, now)).toBe(false);
  });
});
describe("browser commands", () => {
  it("initializes defaults before configuration, has no automatic page-view conversion and clears scoped matching data", () => {
    const commands: unknown[][] = [];
    const tag = (...args: unknown[]) => {
      commands.push(args);
    };
    const consent = {
      measurement: true,
      adUserData: true,
      enhanced: true,
      version: "v",
    };
    initializeGoogleTag(
      tag,
      "AW-123",
      consent,
      "https://westmere.test/launch/register",
    );
    expect(commands[0]).toEqual(["consent", "default", deniedGoogleConsent]);
    expect(commands.at(-1)?.[2]).toMatchObject({
      send_page_view: false,
      allow_ad_personalization_signals: false,
    });
    const callback = vi.fn();
    queueRegistration(
      tag,
      {
        id: "internal",
        transactionId: "stable-id",
        sendTo: "AW-123/label",
        value: 0,
        currency: "AUD",
        emailHash: "a".repeat(64),
      },
      consent,
      "https://westmere.test/account",
      callback,
    );
    const conversion = commands.find((c) => c[0] === "event")!;
    expect(conversion[2]).toMatchObject({
      transaction_id: "stable-id",
      value: 0,
      currency: "AUD",
    });
    expect(callback).not.toHaveBeenCalled();
    expect(commands.at(-2)).toEqual(["set", "user_data", null]);
    expect(commands.at(-1)?.[2]).toMatchObject({
      allow_enhanced_conversions: false,
    });
  });
  it("does not dispatch without separate storage and data-sharing permission", () => {
    const tag = vi.fn();
    expect(
      queueRegistration(
        tag,
        {
          id: "e",
          transactionId: "e",
          sendTo: "AW-123/l",
          value: 0,
          currency: "AUD",
        },
        { measurement: true, adUserData: false, enhanced: false, version: "v" },
        "https://westmere.test",
        () => {},
      ),
    ).toBe(false);
    expect(tag).not.toHaveBeenCalled();
  });
});
describe("settled first-payment value", () => {
  it.each([
    [11000, 1000, 10000],
    [5500, 500, 5000],
    [110000, 10000, 100000],
    [10000, 0, 10000],
  ])(
    "uses collected minor units and recorded GST (%i/%i)",
    (gross, gst, value) => {
      const i = invoice({
        amount_paid: gross,
        total: gross,
        total_excluding_tax: gross - gst,
        total_taxes: gst
          ? [
              {
                amount: gst,
                tax_rate_details: { tax_rate: "txr_gst" },
              } as Stripe.Invoice.TotalTax,
            ]
          : [],
      });
      expect(
        evaluateInvoice(i, [{ ...cash[0], amount: gross }], rates)?.valueMinor,
      ).toBe(value);
      expect(acquisitionValue(gross, gst)).toBe(value);
    },
  );
  it("excludes trials, sandbox, pending and zero cash", () => {
    expect(
      evaluateInvoice(invoice({ livemode: false }), cash, rates),
    ).toBeNull();
    expect(
      evaluateInvoice(invoice({ status: "open" }), cash, rates),
    ).toBeNull();
    expect(
      evaluateInvoice(invoice({ total: 0, amount_paid: 0 }), [], rates),
    ).toBeNull();
  });
  it.each([
    [{ currency: "usd" }, "UNSUPPORTED_CURRENCY"],
    [{ total_excluding_tax: null }, "MISSING_RECORDED_TAX"],
    [{ starting_balance: -1000 }, "CREDIT_OR_PARTIAL_ALLOCATION"],
    [{ total_excluding_tax: 9999 }, "INCONSISTENT_RECORDED_TAX"],
  ])(
    "holds the original acquisition instead of inventing a fallback value",
    (changes, reason) => {
      const result = evaluateInvoice(
        invoice(changes as Partial<Stripe.Invoice>),
        cash,
        rates,
      )!;
      expect(result).toMatchObject({
        invoiceId: "in_first",
        valueMinor: null,
        issue: reason,
      });
    },
  );
  it("holds mixed purchases, unreconciled partial collection and unknown tax", () => {
    expect(
      evaluateInvoice(
        invoice({
          lines: {
            has_more: false,
            data: [{ parent: { type: "invoice_item_details" } }],
          } as Stripe.ApiList<Stripe.InvoiceLineItem>,
        }),
        cash,
        rates,
      )?.issue,
    ).toBe("MIXED_INVOICE_ALLOCATION");
    expect(
      evaluateInvoice(invoice(), [{ ...cash[0], amount: 5000 }], rates)
        ?.valueMinor,
    ).toBeNull();
    expect(evaluateInvoice(invoice(), cash, new Set())?.issue).toBe(
      "UNSUPPORTED_TAX_ALLOCATION",
    );
  });
  it("does not trust paid status without verified collection", () => {
    expect(() => evaluateInvoice(invoice(), [], rates)).toThrow(
      "UNVERIFIED_INVOICE_PAYMENT",
    );
  });
  it("requires a succeeded intent and a captured live charge, not an authorization", async () => {
    const fixture = {
      invoicePayments: {
        list: vi.fn().mockResolvedValue({
          has_more: false,
          data: [
            {
              livemode: true,
              invoice: "in_first",
              currency: "aud",
              status: "paid",
              amount_paid: 11000,
              payment: { type: "payment_intent", payment_intent: "pi_first" },
              status_transitions: { paid_at: at },
            },
          ],
        }),
      },
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({
          livemode: true,
          status: "requires_capture",
          customer: "cus_first",
          currency: "aud",
          amount_received: 11000,
          latest_charge: "ch_first",
        }),
      },
      charges: {
        retrieve: vi.fn().mockResolvedValue({
          livemode: true,
          paid: true,
          captured: true,
          status: "succeeded",
          customer: "cus_first",
          currency: "aud",
          amount_captured: 11000,
          amount_refunded: 0,
          disputed: false,
        }),
      },
    };
    await expect(
      verifyInvoiceCash(
        fixture as unknown as Stripe,
        invoice({ customer: "cus_first" }),
      ),
    ).rejects.toThrow("PAYMENT_NOT_SETTLED");
    fixture.paymentIntents.retrieve.mockResolvedValue({
      livemode: true,
      status: "succeeded",
      customer: "cus_first",
      currency: "aud",
      amount_received: 11000,
      latest_charge: "ch_first",
    });
    expect(
      await verifyInvoiceCash(
        fixture as unknown as Stripe,
        invoice({ customer: "cus_first" }),
      ),
    ).toEqual(cash);
  });
  it("selects earliest success across replacement customers and out-of-order invoice pages", async () => {
    const inv = invoice({
      customer: "cus_fixture",
      total_taxes: [],
      total_excluding_tax: 11000,
    });
    const stripe = {
      invoices: {
        list: vi
          .fn()
          .mockImplementation(async ({ customer }: { customer: string }) => ({
            has_more: false,
            data: [
              {
                ...inv,
                id: customer === "cus_old" ? "in_original" : "in_renewal",
                status_transitions: {
                  paid_at: customer === "cus_old" ? at : at + 1000,
                },
              },
            ],
          })),
      },
      invoicePayments: {
        list: vi
          .fn()
          .mockImplementation(
            async ({ invoice: ref }: { invoice: string }) => ({
              has_more: false,
              data: [
                {
                  livemode: true,
                  invoice: ref,
                  currency: "aud",
                  status: "paid",
                  amount_paid: 11000,
                  payment: { type: "charge", charge: "ch_fixture" },
                  status_transitions: {
                    paid_at: ref === "in_original" ? at : at + 1000,
                  },
                },
              ],
            }),
          ),
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
          amount_refunded: 11000,
          disputed: false,
        }),
      },
    };
    const first = await scanCustomerHistory(stripe as unknown as Stripe, [
      "cus_new",
      "cus_old",
    ]);
    expect(first?.invoiceId).toBe("in_original");
    expect(first?.refundedMinor).toBe(11000);
  });
});
describe("Data Manager processing", () => {
  it("converts cents only at the adapter and preserves immutable identities", () => {
    const body = importPayload(destination, {
      transactionId: "wm-stable-id",
      occurredAt: "2026-11-26T01:00:00Z",
      valueMinor: 10000,
      identifiers: { gclid: "fixture" },
    });
    expect(body.events[0]).toMatchObject({
      transactionId: "wm-stable-id",
      conversionValue: 100,
      currency: "AUD",
      eventTimestamp: "2026-11-26T01:00:00Z",
    });
    expect(body.destinations[0].productDestinationId).toBe("987654321");
  });
  it("never treats HTTP success or partial results as processed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ requestId: "request" }), { status: 200 }),
      );
    const body = importPayload(destination, {
      transactionId: "stable",
      occurredAt: "2026-11-26T01:00:00Z",
      valueMinor: 100,
      identifiers: { gbraid: "fixture" },
    });
    expect(await submitImport("fixture-token", body, fetcher)).toEqual({
      requestId: "request",
      warning: false,
    });
    expect(processingResult({ requestId: "request" }, destination).state).toBe(
      "submitted",
    );
    const dest = {
      operatingAccount: { accountId: destination.customerId },
      productDestinationId: destination.purchaseActionId,
    };
    expect(
      processingResult(
        {
          requestStatusPerDestination: [
            {
              destination: dest,
              requestStatus: "PARTIAL_SUCCESS",
              errorInfo: {
                errorCounts: [
                  { reason: "PROCESSING_ERROR_REASON_DENIED_CONSENT" },
                ],
              },
            },
          ],
        },
        destination,
      ).state,
    ).toBe("permanent_failure");
    expect(
      processingResult(
        {
          requestStatusPerDestination: [
            {
              destination: dest,
              requestStatus: "SUCCESS",
              eventsIngestionStatus: { recordCount: "1" },
            },
          ],
        },
        destination,
      ).state,
    ).toBe("processed");
  });
});
