import { beforeEach, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import type { User } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({
    rpc: m.rpc,
    storage: { from: () => ({ download: m.download }) },
  }),
}));
import { accountArchive } from "../src/lib/server/account-export";
const id = "93000000-0000-4000-8000-000000000001",
  fileId = "94000000-0000-4000-8000-000000000001",
  user = {
    id,
    email: "own@example.test",
    created_at: "2026-11-22T10:00:00Z",
    app_metadata: { secret: "must never be exported" },
  } as unknown as User;
const sections = () => ({
  profile: [{ full_name: "Own profile" }],
  cvs: [
    {
      id: fileId,
      filename: "../../my-private-cv.txt",
      storage_path: `${id}/own.txt`,
      bytes: 4,
    },
  ],
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? sections()
          : {},
  }));
  m.download.mockResolvedValue({ error: null, data: new Blob(["test"]) });
});
it("creates a valid private ZIP containing structured account information and exact original bytes", async () => {
  const zip = unzipSync(await accountArchive(user));
  const data = JSON.parse(strFromU8(zip["account.json"]));
  expect(data.account.id).toBe(id);
  expect(data.data.profile[0].full_name).toBe("Own profile");
  expect(strFromU8(zip[data.files[0].archive])).toBe("test");
  expect(data.files[0].archive).not.toContain("../");
  expect(strFromU8(zip["account.json"])).not.toContain("storage_path");
  expect(strFromU8(zip["account.json"])).not.toContain(
    "must never be exported",
  );
  expect(zip["README.txt"]).toBeTruthy();
  expect(m.rpc).toHaveBeenCalledWith("account_export_control", {
    p_user: id,
    p_action: "complete",
    p_token: fileId,
  });
});
it("does not return a partial ZIP when an original document cannot be downloaded", async () => {
  m.download.mockResolvedValue({
    data: null,
    error: { message: "Unavailable" },
  });
  await expect(accountArchive(user)).rejects.toMatchObject({ status: 503 });
  expect(m.rpc).toHaveBeenCalledWith("account_export_control", {
    p_user: id,
    p_action: "fail",
    p_token: fileId,
  });
  expect(m.rpc).not.toHaveBeenCalledWith(
    "account_export_control",
    expect.objectContaining({ p_action: "complete" }),
  );
});
it("refuses unsafe storage paths before performing a download", async () => {
  const data = sections();
  data.cvs[0].storage_path = "../other-user/file.txt";
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  await expect(accountArchive(user)).rejects.toMatchObject({ status: 503 });
  expect(m.download).not.toHaveBeenCalled();
});
it("routes larger archives to the complete-copy request rather than silently truncating", async () => {
  const data = {
    cvs: Array.from({ length: 7 }, (_, i) => ({
      id: `94000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      filename: "cv.pdf",
      storage_path: `${id}/${i}.pdf`,
      bytes: 10485760,
    })),
  };
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  await expect(accountArchive(user)).rejects.toMatchObject({
    status: 413,
    code: "EXPORT_REVIEW_REQUIRED",
  });
  expect(m.download).not.toHaveBeenCalled();
});
it("does not begin an export when its per-account lease is rate limited", async () => {
  m.rpc.mockResolvedValue({ error: { code: "P0001" }, data: null });
  await expect(accountArchive(user)).rejects.toMatchObject({ status: 429 });
  expect(m.download).not.toHaveBeenCalled();
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("deduplicates an original referenced by both an upload and an application document", async () => {
  const data = {
    cvs: [],
    applicationUploads: sections().cvs,
    applicationDocuments: sections().cvs,
  };
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  const zip = unzipSync(await accountArchive(user));
  expect(Object.keys(zip).filter((k) => k.startsWith("files/"))).toHaveLength(
    1,
  );
  expect(m.download).toHaveBeenCalledTimes(1);
});

it("refuses another account's storage prefix even when the path is syntactically valid", async () => {
  const data = sections();
  data.cvs[0].storage_path = "95000000-0000-4000-8000-000000000001/private.txt";
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  await expect(accountArchive(user)).rejects.toMatchObject({ status: 503 });
  expect(m.download).not.toHaveBeenCalled();
});

it("includes an owned business's current branding assets without leaking source storage paths", async () => {
  const org = "96000000-0000-4000-8000-000000000001";
  const data = {
    ownedBusinesses: [{ id: org, avatar_path: `${org}/avatar/logo.webp` }],
    cvs: [],
  };
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  const zip = unzipSync(await accountArchive(user));
  const json = JSON.parse(strFromU8(zip["account.json"]));
  expect(json.files[0].category).toBe("businessBranding");
  expect(strFromU8(zip[json.files[0].archive])).toBe("test");
  expect(json.data.ownedBusinesses[0]).not.toHaveProperty("avatar_path");
});

it("preserves user-provided answer keys while removing only internal file metadata paths", async () => {
  const data = {
    ...sections(),
    applications: [
      {
        answers: {
          storage_path: "An answer supplied by this user",
          avatar_path: "Another answer",
        },
      },
    ],
  };
  m.rpc.mockImplementation(async (name, args) => ({
    error: null,
    data:
      name === "account_export_control" && args.p_action === "begin"
        ? fileId
        : name === "account_information_export"
          ? data
          : {},
  }));
  const zip = unzipSync(await accountArchive(user));
  const json = JSON.parse(strFromU8(zip["account.json"]));
  expect(json.data.applications[0].answers.storage_path).toBe(
    "An answer supplied by this user",
  );
  expect(json.data.cvs[0]).not.toHaveProperty("storage_path");
});
