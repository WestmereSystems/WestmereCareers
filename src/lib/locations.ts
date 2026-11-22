import directory from "@/content/australian-locations.json";
export type Place = {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
};
const normalise = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const australianPlaces: Place[] = directory.map((row) => ({
  city: String(row[0]),
  state: String(row[1]),
  latitude: Number(row[2]),
  longitude: Number(row[3]),
}));
const byName = new Map<string, Place[]>();
for (const place of australianPlaces) {
  const key = normalise(place.city);
  const previous = byName.get(key) || [];
  previous.push(place);
  byName.set(key, previous);
}
/** Ambiguous town names require a state; suggestions always include it. */
export function findPlace(value: string, state?: string): Place | null {
  let key = normalise(value);
  const suffix = / (act|nsw|nt|qld|sa|tas|vic|wa)$/.exec(key);
  const region = state?.toUpperCase() || suffix?.[1].toUpperCase();
  if (suffix) key = key.slice(0, -suffix[0].length);
  const matches = (byName.get(key) || []).filter(
    (p) => !region || p.state === region,
  );
  return matches.length === 1 || (region && matches.length) ? matches[0] : null;
}
export function distanceKm(
  a: Pick<Place, "latitude" | "longitude">,
  b: Pick<Place, "latitude" | "longitude">,
) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians,
    dLon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
