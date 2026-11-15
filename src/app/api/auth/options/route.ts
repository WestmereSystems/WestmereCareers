import { authOptions } from "@/lib/server/auth-options";
import { json } from "@/lib/server/http";
export async function GET() {
  return json(await authOptions());
}
