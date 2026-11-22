import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.session }));
import { GET } from "../src/app/api/employers/verification/route";
beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: () => query,
    eq: mocks.eq,
    order: () => query,
    range: mocks.range,
  };
  mocks.eq.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], count: 11, error: null });
  mocks.session.mockResolvedValue({
    user: { id: "owner" },
    supabase: {
      from: () => query,
      rpc: async () => ({
        data: {
          limit: 3,
          used: 3,
          owned: 2,
          pending: 1,
          remaining: 0,
          canSubmit: false,
        },
        error: null,
      }),
    },
  });
});
it("lists all validated memberships independently of requests, five per page", async () => {
  const r = await GET(
    new Request(
      "https://westmere.test/api/employers/verification?page=2&businessPage=3",
    ),
  );
  expect(r.status).toBe(200);
  expect(mocks.range.mock.calls).toEqual([
    [5, 9],
    [10, 14],
  ]);
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  expect(mocks.eq).toHaveBeenCalledWith("organisations.is_verified", true);
  expect(await r.json()).toMatchObject({
    total: 11,
    businessTotal: 11,
    page: 2,
    businessPage: 3,
    capacity: { limit: 3, used: 3, canSubmit: false },
  });
});
it("rejects malformed pages before querying private records", async () => {
  expect(
    (
      await GET(
        new Request("https://westmere.test/api/employers/verification?page=-1"),
      )
    ).status,
  ).toBe(400);
  expect(mocks.range).not.toHaveBeenCalled();
});
