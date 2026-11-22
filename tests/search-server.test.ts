// These regressions exercise the public-launch behaviour; founding access has dedicated API/database coverage.
vi.mock("@/lib/server/launch", async () => import("./fixtures/open-launch"));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("../src/lib/supabase/public", () => ({ publicClient: mock.client }));
import {
  getPublicJob,
  getPublicJobs,
  getPublicJobsByIds,
  parseJobQuery,
} from "../src/lib/jobs-server";
import { demoJobs } from "../src/lib/jobs";

function query(data: unknown[] = [], count = 0, error: unknown = null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    textSearch: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn(),
  };
  for (const method of [
    "select",
    "eq",
    "lte",
    "or",
    "textSearch",
    "in",
    "gte",
    "order",
  ] as const)
    builder[method].mockReturnValue(builder);
  builder.range.mockResolvedValue({ data, error, count });
  builder.maybeSingle.mockResolvedValue({ data: data[0] ?? null, error });
  const result = Promise.resolve({ data, error, count });
  return Object.assign(builder, { then: result.then.bind(result) });
}

beforeEach(() => vi.resetAllMocks());
describe("public search boundaries", () => {
  it("ignores the retired sample switch and never resolves fictional detail IDs", async () => {
    const builder = query([]);
    const from = vi.fn(() => builder);
    mock.client.mockReturnValue({ from });
    const result = await getPublicJobs({ samples: true });
    expect(result.source).toBe("live");
    expect(result.total).toBe(0);
    expect(from).toHaveBeenCalledWith("jobs");
    const detail = await getPublicJob(demoJobs[0].id);
    expect(detail).toEqual({ source: "live", job: null });
  });

  it("allowlists filter values and clamps user-supplied pages and lengths", () => {
    const filters = parseJobQuery(
      new URLSearchParams({
        q: "a".repeat(1000),
        workMode: "Remote,administrator",
        employmentType: "Contract,Executive",
        sort: "private-cvs",
        page: "999999",
        minSalary: "999999999",
      }),
    );
    expect(filters.keyword).toHaveLength(120);
    expect(filters.workMode).toEqual(["Remote"]);
    expect(filters.employmentType).toEqual(["Contract"]);
    expect(filters.sort).toBe("relevance");
    expect(filters.page).toBe(5000);
    expect(filters.minSalary).toBe(1000000);
  });
  it("never turns a live database failure into fictional vacancies", async () => {
    const builder = query([], 0, { message: "internal database detail" });
    mock.client.mockReturnValue({ from: () => builder });
    const result = await getPublicJobs();
    expect(result.source).toBe("live");
    expect(result.jobs).toEqual([]);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("database detail");
  });
  it("explicitly excludes future and expired jobs even for employer sessions", async () => {
    const builder = query([], 32);
    mock.client.mockReturnValue({ from: () => builder });
    const result = await getPublicJobs({
      keyword: "designer",
      workMode: ["Hybrid"],
      page: 2,
      pageSize: 12,
    });
    expect(builder.eq).toHaveBeenCalledWith("status", "published");
    expect(builder.lte).toHaveBeenCalledWith(
      "published_at",
      expect.any(String),
    );
    expect(builder.or).toHaveBeenCalledWith(
      expect.stringContaining("expires_at.gt."),
    );
    expect(builder.textSearch).toHaveBeenCalledWith(
      "search_vector",
      "designer",
      { type: "websearch", config: "english" },
    );
    expect(builder.range).toHaveBeenCalledWith(12, 23);
    expect(result.total).toBe(32);
  });
  it("loads a single public role by ID and rejects malformed live identifiers", async () => {
    const builder = query();
    mock.client.mockReturnValue({ from: () => builder });
    expect(await getPublicJob("demo-fake")).toEqual({
      job: null,
      source: "live",
    });
    expect(builder.select).not.toHaveBeenCalled();
    await getPublicJob("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(builder.eq).toHaveBeenCalledWith(
      "id",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(builder.lte).toHaveBeenCalledWith(
      "published_at",
      expect.any(String),
    );
  });
  it("fails closed with an empty inventory when unconfigured", async () => {
    mock.client.mockReturnValue(null);
    const result = await getPublicJobs({ page: 2, pageSize: 12 });
    expect(result.source).toBe("live");
    expect(result.jobs).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.error).toBeTruthy();
  });
  it("does not resurrect fictional saved roles after an outage", async () => {
    mock.client.mockReturnValue(null);
    const ids = [demoJobs[18].id, "closed-demo-role", demoJobs[1].id];
    const result = await getPublicJobsByIds(ids);
    expect(result.jobs).toEqual([]);
    expect(result.unavailableIds).toEqual(ids);
    expect(result.source).toBe("live");
  });

  it("validates live saved IDs and applies public publication checks", async () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const builder = query([
      {
        id,
        title: "A public role",
        company: "Example",
        published_at: "2026-11-12T00:00:00Z",
      },
    ]);
    mock.client.mockReturnValue({ from: () => builder });
    const result = await getPublicJobsByIds(["not-a-uuid", id]);
    expect(builder.in).toHaveBeenCalledWith("id", [id]);
    expect(builder.eq).toHaveBeenCalledWith("status", "published");
    expect(builder.lte).toHaveBeenCalledWith(
      "published_at",
      expect.any(String),
    );
    expect(result.unavailableIds).toEqual(["not-a-uuid"]);
    expect(result.jobs[0].id).toBe(id);
  });
  it("keeps city/state filters consistent and allows Australia-wide remote roles", async () => {
    const builder = query();
    mock.client.mockReturnValue({ from: () => builder });
    await getPublicJobs({ location: "Melbourne, NSW" });
    expect(builder.or).toHaveBeenCalledWith(
      "and(city.ilike.%melbourne%,state.eq.NSW),and(work_mode.eq.Remote,city.eq.Anywhere in Australia)",
    );
    await getPublicJobs({ location: "VIC" });
    expect(builder.or).toHaveBeenCalledWith(
      "state.eq.VIC,and(work_mode.eq.Remote,city.eq.Anywhere in Australia)",
    );
  });
});

it("requests a count on the radius RPC itself, keeps cross-state matches and paginates from that count", async () => {
  const builder = query(
    [
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title: "Canberra role",
        city: "Canberra",
        state: "ACT",
      },
    ],
    25,
  );
  const rpc = vi.fn().mockReturnValue(builder);
  const from = vi.fn();
  mock.client.mockReturnValue({ rpc, from });
  const result = await getPublicJobs({
    location: "Queanbeyan, NSW",
    distance: 250,
    page: 2,
    pageSize: 12,
  });
  expect(rpc).toHaveBeenCalledWith(
    "jobs_within_distance",
    { p_lat: -35.35493, p_lon: 149.232, p_km: 250 },
    { count: "exact" },
  );
  expect(from).not.toHaveBeenCalled();
  expect(builder.or).not.toHaveBeenCalledWith(
    expect.stringContaining("state.eq.NSW"),
  );
  expect(result.total).toBe(25);
  expect(result.jobs[0].city).toBe("Canberra");
  expect(builder.range).toHaveBeenCalledWith(12, 23);
});
