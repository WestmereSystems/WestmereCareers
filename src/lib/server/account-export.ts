import "server-only";
import type { User } from "@supabase/supabase-js";
import { zipSync, strToU8, type Zippable } from "fflate";
import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import { checkPrivacyRpc } from "./account-privacy";
import { ApiError } from "./http";

const file = z.object({
  id: z.uuid(),
  filename: z.string().min(1).max(500),
  storage_path: z
    .string()
    .min(1)
    .max(2000)
    .refine(
      (p) =>
        !p.startsWith("/") &&
        !p.includes("\\") &&
        !p.split("/").some((s) => s === "." || s === "..") &&
        !/[\x00-\x1f]/.test(p),
    ),
  bytes: z.number().int().min(0).max(10485760),
});
type File = z.infer<typeof file> & {
  bucket: string;
  category: string;
  archive: string;
};
const maxBytes = 64 * 1024 * 1024;
const large = () =>
  new ApiError(
    413,
    "Request a complete information copy in Settings for this larger account. No partial archive was returned.",
    "EXPORT_REVIEW_REQUIRED",
  );
export async function accountArchive(user: User) {
  const db = premiumAdmin();
  const acquired = await db.rpc("account_export_control", {
    p_user: user.id,
    p_action: "begin",
  });
  checkPrivacyRpc(acquired.error);
  const token = acquired.data;
  if (typeof token !== "string")
    throw new ApiError(503, "Your download could not be prepared.");
  try {
    const result = await db.rpc("account_information_export", {
      p_user: user.id,
    });
    checkPrivacyRpc(result.error);
    if (
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    )
      throw new ApiError(503, "Your information could not be read.");
    const sections = result.data as Record<string, Record<string, unknown>[]>;
    const files: File[] = [];
    const paths = new Set<string>();
    const ownedIds = (sections.ownedBusinesses || []).map((row) =>
      z.uuid().parse(row.id),
    );
    for (const [category, bucket] of [
      ["cvs", "candidate-documents"],
      ["applicationUploads", "application-documents"],
      ["applicationDocuments", "application-documents"],
      ["listingDocuments", "employer-assets"],
    ]) {
      for (const row of sections[category] || []) {
        const f = file.parse(row),
          identity = `${bucket}/${f.storage_path}`;
        if (
          category === "listingDocuments"
            ? !ownedIds.some((id) => f.storage_path.startsWith(`${id}/`))
            : !f.storage_path.startsWith(`${user.id}/`)
        )
          throw new ApiError(
            503,
            "An account document needs an ownership review before export. Request a complete information copy in Settings.",
          );
        if (paths.has(identity)) continue;
        paths.add(identity);
        const name =
          f.filename
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .replace(/^\.+/, "")
            .slice(0, 120) || "document";
        files.push({
          ...f,
          bucket,
          category,
          archive: `files/${category}/${f.id}-${name}`,
        });
      }
    }
    for (const business of sections.ownedBusinesses || []) {
      for (const kind of ["avatar", "banner"]) {
        const path = business[`${kind}_path`];
        if (!path) continue;
        const f = file.parse({
          id: business.id,
          filename: `${kind}.webp`,
          storage_path: path,
          bytes: 0,
        });
        if (!f.storage_path.startsWith(`${f.id}/`))
          throw new ApiError(
            503,
            "A business image needs an ownership review before export.",
          );
        const identity = `employer-assets/${f.storage_path}`;
        if (paths.has(identity)) continue;
        paths.add(identity);
        files.push({
          ...f,
          bucket: "employer-assets",
          category: "businessBranding",
          archive: `files/businessBranding/${f.id}-${kind}.webp`,
        });
      }
    }
    if (files.length > 250 || files.reduce((n, f) => n + f.bytes, 0) > maxBytes)
      throw large();
    const archive: Zippable = {};
    const deadline = performance.now() + 220000;
    let bytes = 0,
      next = 0,
      failure: unknown;
    // Bound concurrent storage requests and wait for every worker before returning a result.
    await Promise.all(
      Array.from({ length: Math.min(4, files.length) }, async () => {
        while (!failure) {
          const f = files[next++];
          if (!f) break;
          try {
            if (performance.now() > deadline)
              throw new ApiError(
                503,
                "Your download took too long. Request a complete information copy in Settings.",
              );
            const r = await db.storage.from(f.bucket).download(f.storage_path);
            if (r.error || !r.data)
              throw new ApiError(
                503,
                "An account document is unavailable. No partial archive was returned; request a complete information copy in Settings.",
              );
            bytes += r.data.size;
            if (r.data.size > 10485760 || bytes > maxBytes) throw large();
            archive[f.archive] = [
              new Uint8Array(await r.data.arrayBuffer()),
              { level: 0 },
            ];
          } catch (error) {
            failure = error;
          }
        }
      }),
    );
    if (failure) throw failure;
    // Source bucket paths are not capabilities and are not needed in the downloaded account data.
    const clean = JSON.parse(
      JSON.stringify(sections, (key, value) =>
        ["storage_path", "avatar_path", "banner_path"].includes(key)
          ? undefined
          : value,
      ),
    );
    archive["account.json"] = strToU8(
      JSON.stringify(
        {
          version: 1,
          generatedAt: new Date().toISOString(),
          account: {
            id: user.id,
            email: user.email,
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at,
          },
          data: clean,
          files: files.map((f) => ({
            id: f.id,
            category: f.category,
            filename: f.filename,
            archive: f.archive,
          })),
        },
        null,
        2,
      ),
    );
    archive["README.txt"] = strToU8(
      "Westmere Careers account information\n\naccount.json contains account-linked profile, settings, saved activity, your applications and chats, verification submissions, billing references and privacy requests. It includes owned business profiles and listings where applicable. The files folder contains your current CV/application uploads and eligible listing documents.\n\nThis is a private copy: keep it secure. It excludes passwords, authentication/session tokens, unsubscribe tokens, other candidates' hiring files, restricted staff/security records and provider-held records. Device-only browser preferences, deleted/expired files and protected backups are not included. Shared business records are included only within the account's current ownership scope. Request a complete information copy in Settings for additional information requiring privacy review. An export does not delete records or cancel subscriptions.\n",
    );
    const zip = zipSync(archive, { level: 6 });
    const done = await db.rpc("account_export_control", {
      p_user: user.id,
      p_action: "complete",
      p_token: token,
    });
    checkPrivacyRpc(done.error);
    return zip;
  } catch (error) {
    await db.rpc("account_export_control", {
      p_user: user.id,
      p_action: "fail",
      p_token: token,
    });
    if (error instanceof z.ZodError)
      throw new ApiError(
        503,
        "An account document needs review before export. Request a complete information copy in Settings.",
      );
    throw error;
  }
}
