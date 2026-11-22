/** Stripe Portal can schedule cancel_at without setting cancel_at_period_end. */
export function subscriptionTiming(
  subscription: { cancel_at_period_end?: boolean; cancel_at?: number | null },
  item: { current_period_start: number; current_period_end: number },
) {
  const cancelAt =
    typeof subscription.cancel_at === "number" &&
    Number.isFinite(subscription.cancel_at) &&
    subscription.cancel_at > 0
      ? subscription.cancel_at
      : null;
  return {
    start: new Date(item.current_period_start * 1000).toISOString(),
    end: new Date(
      Math.min(item.current_period_end, cancelAt ?? Infinity) * 1000,
    ).toISOString(),
    cancelScheduled: Boolean(
      subscription.cancel_at_period_end || cancelAt !== null,
    ),
  };
}
