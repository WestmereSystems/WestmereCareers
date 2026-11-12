import { beforeEach, describe, it, expect, vi } from "vitest";
import { demoJobs } from "../src/lib/jobs";

const mocks = vi.hoisted(() => ({ list: vi.fn(), one: vi.fn() }));
vi.mock("@/lib/jobs-server", () => ({
  getPublicJobs: mocks.list,
  getPublicJob: mocks.one,
}));
import StudioPage from "../src/app/studio/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Studio direct role navigation", () => {
  it("loads a selected role outside the default inventory page", async () => {
    const selected = demoJobs[demoJobs.length - 1];
    mocks.list.mockResolvedValue({
      jobs: demoJobs.slice(0, 2),
      source: "demo",
    });
    mocks.one.mockResolvedValue({ job: selected, source: "demo" });
    const page = await StudioPage({
      searchParams: Promise.resolve({ job: selected.id }),
    });
    expect(mocks.one).toHaveBeenCalledWith(selected.id);
    expect(page.key).toBe(selected.id);
    expect(page.props.initialJobId).toBe(selected.id);
    expect(page.props.jobs[0].id).toBe(selected.id);
    expect(page.props.initialTailor).toBe(true);
  });
  it("does not duplicate a selected role already in the first page", async () => {
    const selected = demoJobs[0];
    mocks.list.mockResolvedValue({
      jobs: demoJobs.slice(0, 2),
      source: "demo",
    });
    mocks.one.mockResolvedValue({ job: selected, source: "demo" });
    const page = await StudioPage({
      searchParams: Promise.resolve({ job: selected.id }),
    });
    expect(
      page.props.jobs.filter((role: { id: string }) => role.id === selected.id),
    ).toHaveLength(1);
  });
  it("shows a live failure without substituting demo roles", async () => {
    mocks.list.mockResolvedValue({
      jobs: demoJobs.slice(0, 2),
      source: "demo",
    });
    mocks.one.mockResolvedValue({
      job: null,
      source: "live",
      error: "This role is temporarily unavailable.",
    });
    const page = await StudioPage({
      searchParams: Promise.resolve({ job: "live-role" }),
    });
    expect(page.props.jobs).toEqual([]);
    expect(page.props.isDemoInventory).toBe(false);
    expect(page.props.initialNotice).toBe(
      "This role is temporarily unavailable.",
    );
    expect(page.props.initialTailor).toBe(true);
  });
  it("opens general improvement without an unnecessary single-role query", async () => {
    mocks.list.mockResolvedValue({
      jobs: demoJobs.slice(0, 2),
      source: "demo",
    });
    const page = await StudioPage({ searchParams: Promise.resolve({}) });
    expect(mocks.one).not.toHaveBeenCalled();
    expect(page.props.initialTailor).toBe(false);
    expect(page.key).toBe("general");
  });
});
