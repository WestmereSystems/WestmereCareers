// These regressions exercise the public-launch behaviour; founding access has dedicated API/database coverage.
vi.mock("@/lib/server/launch", async () => import("./fixtures/open-launch"));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  rpc: vi.fn(),
  range: vi.fn(),
}));
vi.mock("@/lib/supabase/public", () => ({ publicClient: mocks.client }));
import { getCompanies } from "../src/lib/companies-server";
let calls: Array<[string, ...unknown[]]>;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "ilike", "order", "lte", "gt"])
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  builder.range = (...args: unknown[]) => {
    calls.push(["range", ...args]);
    return { overrideTypes: () => mocks.range() };
  };
  mocks.range.mockResolvedValue({
    data: [{ id: "company", name: "Example employer" }],
    count: 13,
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: ["Design & creative", "Technology"],
    error: null,
  });
  mocks.client.mockReturnValue({ from: () => builder, rpc: mocks.rpc });
});
describe("employer category discovery", () => {
  it("filters the employer, rather than only the embedded roles, and keeps pagination counts", async () => {
    const result = await getCompanies(2, "Example", "Technology");
    expect(calls.find(([method]) => method === "select")?.[1]).toContain(
      "jobs!inner(category)",
    );
    expect(calls).toContainEqual(["eq", "jobs.category", "Technology"]);
    expect(calls).toContainEqual(["eq", "jobs.status", "published"]);
    expect(calls).toContainEqual(["is", "removed_at", null]);
    expect(calls).toContainEqual([
      "lte",
      "jobs.published_at",
      expect.any(String),
    ]);
    expect(calls).toContainEqual(["gt", "jobs.expires_at", expect.any(String)]);
    expect(calls).toContainEqual(["range", 12, 23]);
    expect(result.total).toBe(13);
    expect(result.categories).toEqual(["Design & creative", "Technology"]);
  });
  it("does not hide employers without published roles when All categories is selected", async () => {
    await getCompanies();
    expect(calls.find(([method]) => method === "select")?.[1]).not.toContain(
      "!inner",
    );
    expect(
      calls.some(
        ([method, field]) => method === "eq" && field === "jobs.category",
      ),
    ).toBe(false);
  });
  it("escapes literal name searches and never replaces a live failure with demo employers", async () => {
    mocks.range.mockResolvedValue({
      data: null,
      count: 0,
      error: { message: "Unavailable" },
    });
    const result = await getCompanies(1, "100%_Co", "Technology");
    expect(calls).toContainEqual(["ilike", "name", "%100\\%\\_Co%"]);
    expect(result.source).toBe("live");
    expect(result.companies).toEqual([]);
    expect(result.error).toBeTruthy();
  });
  it("never falls back to fictional companies when the service is unconfigured", async () => {
    mocks.client.mockReturnValue(null);
    const all = await getCompanies();
    expect(all.companies).toEqual([]);
    expect(all.source).toBe("live");
    expect(all.categories).toEqual([]);
    expect(all.error).toBeTruthy();
  });
});
