import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === "tab") continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  }
  query.set("tab", "alerts");
  redirect(`/account?${query.toString()}`);
}
