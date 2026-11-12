import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({ createClient: mock.client }));
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
    mock.client.mockResolvedValue({ from: () => builder });
    const result = await getPublicJobs();
    expect(result.source).toBe("live");
    expect(result.jobs).toEqual([]);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("database detail");
  });
  it("explicitly excludes future and expired jobs even for employer sessions", async () => {
    const builder = query([], 32);
    mock.client.mockResolvedValue({ from: () => builder });
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
    mock.client.mockResolvedValue({ from: () => builder });
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
  it("uses labelled paginated fixtures only while unconfigured", async () => {
    mock.client.mockResolvedValue(null);
    const result = await getPublicJobs({ page: 2, pageSize: 12 });
    expect(result.source).toBe("demo");
    expect(result.total).toBe(20);
    expect(result.jobs).toHaveLength(8);
  });
  it("resolves saved roles outside the first search page and reports stale IDs", async () => {
    mock.client.mockResolvedValue(null);
    const result = await getPublicJobsByIds([
      demoJobs[18].id,
      "closed-demo-role",
      demoJobs[1].id,
    ]);
    expect(result.jobs.map((job) => job.id)).toEqual([
      demoJobs[18].id,
      demoJobs[1].id,
    ]);
    expect(result.unavailableIds).toEqual(["closed-demo-role"]);
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
    mock.client.mockResolvedValue({ from: () => builder });
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
    mock.client.mockResolvedValue({ from: () => builder });
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
