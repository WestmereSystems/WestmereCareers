import { describe, expect, it } from "vitest";
import { isDeliverableRecipient } from "../supabase/functions/_shared/recipient";
describe("production email recipient boundary", () => {
  it.each([
    "candidate@synthetic.invalid",
    "user@demo.test",
    "user@localhost",
    "user@a.example",
    "user@example.com",
    "user@sub.example.org",
    "bad@real.com\r\nBcc: victim@real.com",
  ])("blocks %s before provider delivery", (address) => {
    expect(isDeliverableRecipient(address)).toBe(false);
  });
  it.each([
    "hello@westmere.com.au",
    "real@examplecompany.com.au",
    "Support@Orderward.app",
  ])(
    "allows normal syntax for %s without claiming consent or deliverability",
    (address) => {
      expect(isDeliverableRecipient(address)).toBe(true);
    },
  );
});
