import occupationTitles from "@/content/occupation-titles.json";
import { australianPlaces } from "./locations";
const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/c\+\+/g, "c plus plus")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titles = [
  ...new Set([
    "Senior Product Designer",
    "Software Engineer",
    "Frontend Engineer",
    "Customer Success Manager",
    "Registered Nurse",
    "Marketing Coordinator",
    "Data Analyst",
    "Accountant",
    "Project Manager",
    "Administration Officer",
    "Electrician",
    "Retail Assistant",
    "Early Childhood Educator",
    "Product Designer",
    "Software Engineer",
    "Frontend Engineer",
    "Customer Service Representative",
    "Project Coordinator",
    "Marketing Coordinator",
    "Accountant",
    "Receptionist",
    "Warehouse Assistant",
    "Sales Representative",
    "Early Childhood Educator",
    "Graphic Designer",
  ]),
];
const locations = [
  "Melbourne, VIC",
  "Sydney, NSW",
  "Brisbane, QLD",
  "Perth, WA",
  "Adelaide, SA",
  "Canberra, ACT",
  "Hobart, TAS",
  "Darwin, NT",
  "Geelong, VIC",
  "Newcastle, NSW",
  "Gold Coast, QLD",
  "Wollongong, NSW",
  "Ballarat, VIC",
  "Bendigo, VIC",
  "Cairns, QLD",
  "Anywhere in Australia",
];

const editDistance = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    previous = row;
  }
  return previous[b.length];
};

function suggest(values: string[], value: string): string[] {
  const query = normalise(value);
  if (!query) return values.slice(0, 6);
  const tokens = query.split(" ");
  return values
    .map((value, index) => {
      const normal = normalise(value);
      const words = normal.split(" ");
      const fuzzy = tokens.every((token) =>
        words.some(
          (word) =>
            word.startsWith(token) ||
            (token.length >= 4 &&
              editDistance(token, word) <= (token.length >= 7 ? 2 : 1)),
        ),
      );
      return {
        value,
        index,
        score:
          normal === query
            ? 0
            : normal.startsWith(query)
              ? 1
              : normal.includes(query)
                ? 2
                : fuzzy
                  ? 3
                  : 99,
      };
    })
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 6)
    .map((item) => item.value);
}

const jobDirectory = [...new Set([...titles, ...occupationTitles])];
export const jobSuggestions = (query: string) => suggest(jobDirectory, query);
const locationDirectory = [
  ...new Set([
    ...locations,
    ...australianPlaces.map((p) => `${p.city}, ${p.state}`),
  ]),
];
export const locationSuggestions = (query: string) =>
  suggest(locationDirectory, query);
