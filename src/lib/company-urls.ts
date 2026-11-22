/** Full immutable IDs prevent collisions between businesses with the same name. */
export function companyPath(name: string, id: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100)
      .replace(/-+$/, "") || "company";
  return `/companies/${slug}-${id}`;
}
export function companyIdFromPath(value: string): string {
  return (
    value.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    )?.[1] ||
    (value.includes("-demo-")
      ? value.slice(value.indexOf("-demo-") + 1)
      : value)
  );
}
