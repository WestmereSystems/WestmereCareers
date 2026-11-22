import "server-only";
import { ApiError } from "./http";
export function checkRpc(
  error: { code?: string } | null,
  fallback = "Your changes could not be saved. Please try again.",
) {
  if (!error) return;
  if (error.code === "42501")
    throw new ApiError(
      403,
      "You do not have access to this action. Check your account and business permissions.",
    );
  if (error.code === "40001")
    throw new ApiError(
      409,
      "This item has changed. Refresh it before making a decision.",
    );
  if (error.code === "23514") throw new ApiError(409, "This change exceeds the current plan allowance or conflicts with existing applications. Review plan coverage, quota usage and the vacancy before retrying.");
  if (error.code === "23505")
    throw new ApiError(
      409,
      "A request for these details already exists. Review your current requests.",
    );
  if (error.code === "22023")
    throw new ApiError(
      400,
      "Check the supplied details, consent and required evidence checks.",
    );
  if (error.code === "P0001")
    throw new ApiError(
      429,
      "This action is currently limited or unavailable. Check delivery settings and try again later.",
    );
  throw new ApiError(503, fallback);
}
