import { billingScope } from "@/lib/premium/business-billing";
import { invoiceHistory } from "@/lib/premium/invoices";
import { premiumError } from "@/lib/premium/http";
import { apiError, ApiError, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const scope = await billingScope(params.get("organisation"));
    return json(await invoiceHistory(scope, params.get("cursor")));
  } catch (error) {
    return error instanceof ApiError ? apiError(error) : premiumError(error);
  }
}
