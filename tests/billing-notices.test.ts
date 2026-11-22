import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { billingEventNotice } from "../src/lib/premium/billing-notices";

const event = (type: string, object: object, previous_attributes?: object) =>
  ({ type, data: { object, previous_attributes } }) as Stripe.Event;
describe("billing notice summaries", () => {
  it("notifies scheduled plan changes while ignoring schedule metadata edits", () => {
    expect(
      billingEventNotice(
        event("subscription_schedule.updated", {}, { phases: [] }),
      )?.title,
    ).toBe("Scheduled plan change updated");
    expect(
      billingEventNotice(
        event("subscription_schedule.updated", {}, { metadata: {} }),
      ),
    ).toBeNull();
    expect(
      billingEventNotice(event("subscription_schedule.released", {}))?.title,
    ).toBe("Scheduled plan changes removed");
    expect(billingEventNotice(event("payment_method.updated", {}))?.title).toBe(
      "Billing payment method updated",
    );
  });
  it("confirms payments without copying addresses or payment credentials", () => {
    const notice = billingEventNotice(
      event("invoice.paid", {
        currency: "aud",
        amount_paid: 2500,
        customer_email: "private@example.test",
        address: "private address",
      }),
    );
    expect(notice?.title).toBe("Payment received");
    expect(notice?.message).toContain("$25.00");
    expect(JSON.stringify(notice)).not.toContain("private");
  });
  it("does not announce an unpaid or subscription checkout as a completed one-time purchase", () => {
    expect(
      billingEventNotice(
        event("checkout.session.completed", {
          mode: "payment",
          payment_status: "unpaid",
        }),
      ),
    ).toBeNull();
    expect(
      billingEventNotice(
        event("checkout.session.completed", {
          mode: "subscription",
          payment_status: "paid",
        }),
      ),
    ).toBeNull();
    expect(
      billingEventNotice(
        event("checkout.session.completed", {
          mode: "payment",
          payment_status: "paid",
        }),
      )?.title,
    ).toBe("Purchase confirmed");
  });
  it("ignores metadata updates and captures changes to billing details or payment methods", () => {
    expect(
      billingEventNotice(event("customer.updated", {}, { metadata: {} })),
    ).toBeNull();
    expect(
      billingEventNotice(
        event("customer.updated", {}, { invoice_settings: {} }),
      )?.title,
    ).toBe("Billing details updated");
    expect(
      billingEventNotice(
        event("customer.subscription.updated", {}, { metadata: {} }),
      ),
    ).toBeNull();
    expect(
      billingEventNotice(
        event(
          "customer.subscription.updated",
          {},
          { default_payment_method: null },
        ),
      )?.title,
    ).toContain("payment method");
  });
});
