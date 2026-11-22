import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.session }));
import { GET, POST } from "../src/app/api/assistant/chats/route";
import {
  GET as load,
  PATCH,
  DELETE,
} from "../src/app/api/assistant/chats/[id]/route";
import { ApiError } from "../src/lib/server/http";
const id = "60000000-0000-4000-8000-000000000001";
const user = { id: "owner" };
const body = {
  id,
  title: "My next step",
  snapshot: { entries: [], cv: "", filename: "", description: "" },
};
const context = { params: Promise.resolve({ id }) };
let calls: Array<[string, ...unknown[]]>;
function request(
  method: string,
  value?: unknown,
  origin = "https://westmere.test",
) {
  return new Request(`https://westmere.test/api/assistant/chats/${id}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  calls = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "insert", "update", "delete"])
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  for (const method of ["single", "maybeSingle", "limit"])
    builder[method] = () => mocks.query();
  builder.then = (resolve: (value: unknown) => void) =>
    mocks.query().then(resolve);
  mocks.query.mockResolvedValue({
    data: {
      id,
      title: body.title,
      updated_at: "2026-11-18T00:00:00Z",
      snapshot: body.snapshot,
    },
    error: null,
  });
  mocks.session.mockResolvedValue({
    supabase: { from: () => builder },
    user,
    isPremium: true,
    business: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("saved conversation API", () => {
  it("rejects unsigned and cross-origin changes before touching data", async () => {
    expect(
      (await POST(request("POST", body, "https://other.test"))).status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.session.mockRejectedValue(new ApiError(401, "Sign in"));
    expect((await GET()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("scopes list, load, update and deletion to the verified account", async () => {
    expect((await GET()).status).toBe(200);
    expect((await load(request("GET"), context)).status).toBe(200);
    expect(
      (
        await PATCH(
          request("PATCH", { title: body.title, snapshot: body.snapshot }),
          context,
        )
      ).status,
    ).toBe(200);
    expect((await DELETE(request("DELETE"), context)).status).toBe(200);
    expect(
      calls.filter(
        ([name, field, value]) =>
          name === "eq" && field === "user_id" && value === user.id,
      ),
    ).toHaveLength(4);
    expect(calls).toContainEqual(["eq", "id", id]);
  });
  it("denies saves without Careers+ but allows reading and deleting old chats", async () => {
    const session = await mocks.session();
    mocks.session.mockResolvedValue({ ...session, isPremium: false });
    expect((await POST(request("POST", body))).status).toBe(403);
    expect((await PATCH(request("PATCH", body), context)).status).toBe(403);
    expect((await load(request("GET"), context)).status).toBe(200);
    expect((await DELETE(request("DELETE"), context)).status).toBe(200);
  });
  it("creates with server ownership, refuses supplied identity, and reports the database chat cap", async () => {
    mocks.query.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request("POST", body))).status).toBe(201);
    expect(calls).toContainEqual(["insert", { ...body, user_id: user.id }]);
    expect(
      (await POST(request("POST", { ...body, user_id: "another-person" })))
        .status,
    ).toBe(400);
    mocks.query
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "P0001" } });
    const limited = await POST(request("POST", body));
    expect(limited.status).toBe(409);
    expect((await limited.json()).code).toBe("CHAT_LIMIT");
  });
  it("retries the same chat ID through an owned update, including at the ten-chat cap", async () => {
    expect((await POST(request("POST", body))).status).toBe(201);
    expect(calls.some(([method]) => method === "insert")).toBe(false);
    expect(calls).toContainEqual([
      "update",
      { title: body.title, snapshot: body.snapshot },
    ]);
    expect(calls).toContainEqual(["eq", "user_id", user.id]);
  });
  it("hides provider/database details and handles deleted or invalid conversation IDs", async () => {
    mocks.query.mockResolvedValue({
      data: null,
      error: { message: "PRIVATE SNAPSHOT AND TOKEN" },
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
    mocks.query.mockResolvedValue({ data: null, error: null });
    expect((await load(request("GET"), context)).status).toBe(404);
    expect(
      (
        await load(request("GET"), {
          params: Promise.resolve({ id: "invalid" }),
        })
      ).status,
    ).toBe(400);
  });
});

it("blocks saving on a non-Enterprise business account, while preserving access to its own stored data", async () => {
  const session = await mocks.session();
  mocks.session.mockResolvedValue({
    ...session,
    isPremium: false,
    business: { kind: "employer" },
  });
  const response = await POST(request("POST", body));
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe("ENTERPRISE_OR_PERSONAL_REQUIRED");
  expect(mocks.query).not.toHaveBeenCalled();
  expect((await GET()).status).toBe(200);
});
