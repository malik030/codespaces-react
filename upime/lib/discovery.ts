import type { UniversitySource } from "./types";
import { fetchWithTimeout } from "./http";

type WikidataBinding = {
  universityLabel?: { value: string };
  website?: { value: string };
};

type HipoUniversity = {
  name: string;
  country: string;
  web_pages?: string[];
};

const FALLBACK_PUBLIC_UNIVERSITY_HINTS = [
  "public",
  "national",
  "state",
  "government",
  "federal",
  "university of",
  "institute of",
];

export async function discoverPublicUniversities(
  country: string,
): Promise<{ universities: UniversitySource[]; warnings: string[] }> {
  const warnings: string[] = [];
  const discovered = new Map<string, UniversitySource>();

  const [wikidataResult, hipoResult] = await Promise.allSettled([
    discoverFromWikidata(country),
    discoverFromHipo(country),
  ]);

  if (wikidataResult.status === "fulfilled") {
    for (const university of wikidataResult.value) {
      discovered.set(normalizeKey(university.name), university);
    }
  } else {
    warnings.push(
      "Wikidata discovery failed, so the app used fallback university indexes where available.",
    );
  }

  if (hipoResult.status === "fulfilled") {
    for (const university of hipoResult.value) {
      const key = normalizeKey(university.name);
      if (!discovered.has(key)) {
        discovered.set(key, university);
      }
    }
  } else {
    warnings.push(
      "The university domains fallback API was unavailable during this scan.",
    );
  }

  const universities = [...discovered.values()]
    .filter((university) => university.name.length > 2)
    .sort((a, b) => scoreUniversity(b.name) - scoreUniversity(a.name));

  if (universities.length === 0) {
    warnings.push(
      "No universities were discovered for this country from the configured public sources.",
    );
  } else {
    warnings.push(
      "Public-sector classification differs by country. Results are discovered from public university indexes and should be verified against official sources before applying.",
    );
  }

  return { universities, warnings };
}

async function discoverFromWikidata(
  country: string,
): Promise<UniversitySource[]> {
  const sanitizedCountry = country.replaceAll('"', '\\"').trim();
  const query = `
SELECT DISTINCT ?university ?universityLabel ?website WHERE {
  ?country rdfs:label "${sanitizedCountry}"@en.
  ?university wdt:P17 ?country.
  ?university wdt:P31/wdt:P279* wd:Q3918.
  OPTIONAL { ?university wdt:P856 ?website. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 120
`;

  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const response = await fetchWithTimeout(url.toString(), {}, 18000);
  if (!response.ok) {
    throw new Error(`Wikidata responded with ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: { bindings?: WikidataBinding[] };
  };

  return (data.results?.bindings ?? [])
    .map((binding) => ({
      name: binding.universityLabel?.value?.trim() ?? "",
      country,
      website: normalizeWebsite(binding.website?.value),
      source: "wikidata" as const,
      publicSectorSignal:
        "Wikidata university entity in the requested country; official status must be checked on the source site.",
    }))
    .filter((university) => university.name);
}

async function discoverFromHipo(country: string): Promise<UniversitySource[]> {
  const url = new URL("https://universities.hipolabs.com/search");
  url.searchParams.set("country", country.trim());

  const response = await fetchWithTimeout(url.toString(), {}, 14000);
  if (!response.ok) {
    throw new Error(`Hipo Labs responded with ${response.status}`);
  }

  const data = (await response.json()) as HipoUniversity[];
  return data.map((university) => ({
    name: university.name,
    country: university.country || country,
    website: normalizeWebsite(university.web_pages?.[0]),
    source: "hipolabs" as const,
    publicSectorSignal:
      "University domains index fallback; public/private status is not supplied by this API.",
  }));
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeWebsite(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return undefined;
    }
  }
}

function scoreUniversity(name: string) {
  const lower = name.toLowerCase();
  return FALLBACK_PUBLIC_UNIVERSITY_HINTS.reduce(
    (score, hint) => score + (lower.includes(hint) ? 1 : 0),
    0,
  );
}
