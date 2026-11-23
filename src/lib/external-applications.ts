/** Shared by the editor, API and outbound link. Never fetch an employer URL on the server. */
export function externalApplicationTarget(value: unknown): URL | null {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    !value.startsWith("https://") ||
    /[\s\\\u0000-\u001f\u007f]/u.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.startsWith("[") ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(host) ||
      host === "westmere.com.au" ||
      host.endsWith(".westmere.com.au") ||
      host === "westmere-careers.vercel.app"
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
