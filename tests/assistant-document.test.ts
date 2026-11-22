// These regressions exercise the public-launch behaviour; founding access has dedicated API/database coverage.
vi.mock("@/lib/server/launch", async () => import("./fixtures/open-launch"));
import { readFile } from "node:fs/promises";
import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: m.session }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: m.rpc }),
}));
import { POST } from "../src/app/api/assistant/document/route";
const origin = "https://westmere.test";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  m.session.mockResolvedValue({ user: null, business: null });
  m.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "reserve_assistant_upload"
        ? "20000000-0000-4000-8000-000000000001"
        : null,
    error: null,
  }));
});
function request(file: File) {
  const f = new FormData();
  f.set("file", file);
  return new Request(origin + "/api/assistant/document", {
    method: "POST",
    headers: { origin },
    body: f,
  });
}
describe("temporary assistant CV extraction", () => {
  it("extracts a synthetic PDF without saving a CV or invoking AI", async () => {
    const fixture = await readFile(
      new URL("./fixtures/synthetic-cv.pdf", import.meta.url),
    );
    const r = await POST(
      request(
        new File([fixture], "synthetic-cv.pdf", { type: "application/pdf" }),
      ),
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.text).toContain("SYNTHETIC CV");
    expect(m.rpc).toHaveBeenCalledWith(
      "release_assistant_upload",
      expect.objectContaining({ p_token: expect.any(String) }),
    );
  }, 20000);
  it.each(["employer", "agency"])(
    "lets a free %s attach temporary text for its Assistant requests",
    async (kind) => {
      m.session.mockResolvedValue({
        user: { id: "business" },
        business: { kind },
      });
      const r = await POST(
        request(
          new File(
            ["Synthetic office support experience. ".repeat(5)],
            "cv.txt",
          ),
        ),
      );
      expect(r.status).toBe(200);
      expect((await r.json()).text).toContain("Synthetic office support");
      expect(m.rpc).toHaveBeenCalledWith(
        "release_assistant_upload",
        expect.any(Object),
      );
    },
  );
  it("rejects unreadable content and always releases the processing lease", async () => {
    const r = await POST(request(new File(["not a PDF"], "cv.pdf")));
    expect(r.status).toBe(400);
    expect(m.rpc).toHaveBeenCalledWith(
      "release_assistant_upload",
      expect.any(Object),
    );
  });
});
