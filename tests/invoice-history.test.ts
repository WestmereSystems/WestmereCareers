import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  mapping: vi.fn(),
  eq: vi.fn(),
  personal: vi.fn(),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }),
  stripeClient: () => ({ invoices: { list: mocks.list } }),
}));
vi.mock("@/lib/premium/billing", () => ({
  customerFor: mocks.personal,
}));
import { invoiceHistory } from "../src/lib/premium/invoices";
const scope = {
  user: { id: "owner" },
  business: { kind: "employer" },
} as Parameters<typeof invoiceHistory>[0];
const streams = Object.fromEntries(
  ["cus_current", "cus_historical"].map((customer, source) => [
    customer,
    Array.from({ length: 12 }, (_, i) => ({
      id: `in_${source}${String(i).padStart(2, "0")}`,
      created: 100 - Math.floor(i / 2),
      livemode: false,
      number: `Invoice ${source}-${i}`,
      status: "paid",
      total: 100,
      currency: "aud",
      hosted_invoice_url: null,
      invoice_pdf: null,
      private_metadata: "not returned",
    })),
  ]),
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.personal.mockResolvedValue(null);
  mocks.eq.mockResolvedValue({
    data: [
      { stripe_customer_id: "cus_current" },
      { stripe_customer_id: "cus_historical" },
    ],
    error: null,
  });
  mocks.list.mockImplementation(async ({ customer, starting_after, limit }) => {
    const stream = streams[customer];
    const start = starting_after
      ? stream.findIndex((i) => i.id === starting_after) + 1
      : 0;
    return {
      data: stream.slice(start, start + limit),
      has_more: stream.length > start + limit,
    };
  });
});
it("paginates all invoices billed to this owner across current and historical businesses", async () => {
  let cursor: string | null = null;
  const ids: string[] = [];
  const sizes: number[] = [];
  do {
    const result = await invoiceHistory(scope, cursor);
    ids.push(...result.invoices.map((i) => i.id));
    sizes.push(result.invoices.length);
    cursor = result.nextCursor;
  } while (cursor);
  expect(sizes).toEqual([10, 10, 4]);
  expect(new Set(ids).size).toBe(24);
  expect(mocks.eq).toHaveBeenCalledWith("billing_user_id", "owner");
  expect(
    mocks.list.mock.calls.every(
      ([p]) => p.customer === "cus_current" || p.customer === "cus_historical",
    ),
  ).toBe(true);
  expect(JSON.stringify(await invoiceHistory(scope, null))).not.toContain(
    "private_metadata",
  );
});
it("cannot use another account's customer in a pagination cursor", async () => {
  const cursor = Buffer.from(
    JSON.stringify({ cus_invited: "in_private" }),
  ).toString("base64url");
  await expect(invoiceHistory(scope, cursor)).rejects.toMatchObject({
    code: "INVALID_CURSOR",
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("does not show pagination at exactly ten invoices", async () => {
  mocks.list.mockResolvedValue({
    data: streams.cus_current.slice(0, 5),
    has_more: false,
  });
  const result = await invoiceHistory(scope, null);
  expect(result.invoices).toHaveLength(10);
  expect(result.nextCursor).toBeNull();
});
it("fails closed on unreadable ownership or malformed cursors", async () => {
  mocks.eq.mockResolvedValue({ error: { code: "503" } });
  await expect(invoiceHistory(scope, null)).rejects.toMatchObject({
    code: "BILLING_UNAVAILABLE",
  });
  await expect(invoiceHistory(scope, "not-json")).rejects.toMatchObject({
    code: "INVALID_CURSOR",
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
