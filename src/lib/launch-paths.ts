/** Shared workspaces and APIs stay in place; the temporary public site lives in /launch. */
export function launchPath(path: string, marketplaceOpen = false) {
  if (marketplaceOpen) return path;
  const match = path.match(/^([^?#]*)(.*)$/s)!;
  const routes: Record<string, string> = {
    "/": "/launch",
    "/employers": "/launch/employers",
    "/employers/preview": "/launch/preview",
    "/employers/sign-in": "/launch/sign-in",
    "/careers-plus": "/launch/careers-plus",
    "/account": "/launch/account",
  };
  return (routes[match[1]] || match[1]) + match[2];
}

export function routeQuery(
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  return query.size ? `?${query}` : "";
}
