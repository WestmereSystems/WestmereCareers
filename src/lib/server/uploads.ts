import "server-only";
import { premiumAdmin } from "@/lib/premium/providers";
import { ApiError } from "./http";
export async function beginUpload(userId: string) {
  const admin = premiumAdmin();
  const { data, error } = await admin.rpc("reserve_document_upload", {
    p_user: userId,
  });
  if (error || typeof data !== "string")
    throw new ApiError(
      error?.code === "P0001" ? 429 : 503,
      error?.code === "P0001"
        ? "An upload is already processing, or the daily upload limit was reached. Please wait before trying again."
        : "Uploads are temporarily unavailable.",
    );
  return async () => {
    await admin.rpc("release_document_upload", {
      p_user: userId,
      p_lease: data,
    });
  };
}
