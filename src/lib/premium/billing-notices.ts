import type Stripe from "stripe";

/** Only bounded, non-sensitive summaries enter the account notification stream. */
export function billingEventNotice(event: Stripe.Event) {
  const object = event.data.object;
  const previous = event.data.previous_attributes || {};
  switch (event.type) {
    case "invoice.paid": {
      const invoice = object as Stripe.Invoice;
      const amount = new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: invoice.currency,
      }).format(invoice.amount_paid / 100);
      return {
        title: "Payment received",
        message: `Your payment of ${amount} was confirmed. Your receipt and subscription details are available in Billing.`,
      };
    }
    case "invoice.payment_failed":
      return {
        title: "Payment needs attention",
        message:
          "Your invoice payment was unsuccessful. Review the invoice and payment method in Billing.",
      };
    case "charge.refunded":
      return {
        title: "Refund recorded",
        message:
          "A refund has been recorded for your payment. Review its amount and status in Billing. A refund does not itself cancel a subscription.",
      };
    case "customer.updated":
      if (
        ![
          "invoice_settings",
          "default_source",
          "address",
          "name",
          "email",
          "tax_exempt",
        ].some((key) => key in previous)
      )
        return null;
      return {
        title: "Billing details updated",
        message:
          "Your billing details or default payment method changed. Review the current details in Manage billing.",
      };
    case "customer.subscription.updated":
      if (
        !("default_payment_method" in previous) &&
        !("default_source" in previous)
      )
        return null;
      return {
        title: "Subscription payment method updated",
        message:
          "The payment method for your subscription changed. Review it in Manage billing.",
      };
    case "payment_method.attached":
    case "payment_method.detached":
    case "payment_method.updated":
    case "payment_method.automatically_updated":
      return {
        title: "Billing payment method updated",
        message:
          "A payment method was added to or removed from your billing account. Review your payment methods in Manage billing.",
      };
    case "subscription_schedule.created":
      return {
        title: "Subscription schedule created",
        message:
          "A billing schedule was created for your subscription. Review the planned dates and plan details in Billing.",
      };
    case "subscription_schedule.updated":
      if (
        !["phases", "current_phase", "end_behavior", "status"].some(
          (key) => key in previous,
        )
      )
        return null;
      return {
        title: "Scheduled plan change updated",
        message:
          "Your subscription’s scheduled plan or billing dates changed. Review the upcoming change in Billing.",
      };
    case "subscription_schedule.released":
      return {
        title: "Scheduled plan changes removed",
        message:
          "Your subscription was released from its billing schedule. Review your current plan and renewal details in Billing.",
      };
    case "subscription_schedule.canceled":
    case "subscription_schedule.aborted":
      return {
        title: "Subscription schedule stopped",
        message:
          "Your subscription’s billing schedule stopped. Review your subscription status and any outstanding invoice in Billing.",
      };
    case "subscription_schedule.completed":
      return {
        title: "Subscription schedule completed",
        message:
          "Your subscription’s billing schedule has completed. Review your current plan and access end date in Billing.",
      };
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const checkout = object as Stripe.Checkout.Session;
      if (checkout.mode !== "payment" || checkout.payment_status !== "paid")
        return null;
      return {
        title: "Purchase confirmed",
        message: "Your purchase was confirmed. Review your receipt in Billing.",
      };
    }
    default:
      return null;
  }
}
