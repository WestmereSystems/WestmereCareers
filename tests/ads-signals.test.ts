import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  capture: true,
  rpc: vi.fn(),
  abort: vi.fn(),
}));
vi.mock("@/lib/ads/config", () => ({
  adsConfig: () => ({ capture: mocks.capture }),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: mocks.rpc }),
}));
import { prioritiseAdsCustomer } from "../src/lib/ads/signals";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.capture = true;
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({ error: null });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("prioritises only a trusted customer hint with a bounded request", async () => {
  await prioritiseAdsCustomer("cus_fixture");
  expect(mocks.rpc).toHaveBeenCalledWith("ads_prioritise_customer", {
    p_customer: "cus_fixture",
  });
  expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it("does not interrupt the verified billing flow or log provider details when tracking fails", async () => {
  mocks.abort.mockRejectedValue(
    new Error("sensitive fixture provider message"),
  );
  await expect(prioritiseAdsCustomer("cus_fixture")).resolves.toBeUndefined();
  expect(console.warn).toHaveBeenCalledWith("ADS_RECONCILIATION_SIGNAL_FAILED");
});
it("does no optional database work while capture is off", async () => {
  mocks.capture = false;
  await prioritiseAdsCustomer("cus_fixture");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
