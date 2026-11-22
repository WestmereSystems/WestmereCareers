import { expect, it } from "vitest";
import {
  profileLinksSchema,
  safeProfileLinks,
} from "../src/lib/candidate-profile";
it("accepts optional HTTPS professional profile links", () => {
  expect(
    profileLinksSchema.parse({
      linkedin: "https://www.linkedin.com/in/alex",
      portfolio: "",
      github: "https://github.com/example",
    }),
  ).toHaveProperty("linkedin");
});
it("rejects script URLs, embedded credentials and unrelated profile properties", () => {
  for (const data of [
    { other: "javascript:alert(1)" },
    { portfolio: "https://private:secret@example.test" },
    { github: "http://example.test" },
    { admin: true },
  ])
    expect(profileLinksSchema.safeParse(data).success).toBe(false);
});

it("filters malformed stored JSON without discarding valid professional links", () => {
  expect(
    safeProfileLinks({
      linkedin: { bad: "object" },
      portfolio: "javascript:alert(1)",
      github: "https://github.com/example",
      other: "https://user:secret@example.test",
    }),
  ).toEqual({ github: "https://github.com/example" });
  expect(safeProfileLinks(["https://example.test"])).toEqual({});
});
