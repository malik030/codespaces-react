import * as cheerio from "cheerio";
import type { CourseSuggestion, ScrapedCourse, UniversitySource } from "./types";
import { fetchWithTimeout } from "./http";

type ScrapeOutcome = {
  text: string;
  urls: string[];
  warnings: string[];
};

const LINK_HINTS = [
  "admission",
  "apply",
  "program",
  "programme",
  "degree",
  "undergraduate",
  "graduate",
  "postgraduate",
  "fee",
  "tuition",
  "prospectus",
  "department",
  "faculty",
  "medium",
  "instruction",
];

export async function scrapeUniversityPages(
  university: UniversitySource,
  degree: string,
  suggestions: CourseSuggestion[],
): Promise<ScrapeOutcome> {
  const warnings: string[] = [];
  if (!university.website) {
    return {
      text: "",
      urls: [],
      warnings: [`${university.name} has no official website in the index.`],
    };
  }

  const homepage = await fetchHtml(university.website);
  if (!homepage.html) {
    return {
      text: "",
      urls: [university.website],
      warnings: [
        `${university.name} could not be fetched from ${university.website}.`,
      ],
    };
  }

  const linkCandidates = discoverRelevantLinks(
    homepage.html,
    homepage.finalUrl,
    degree,
    suggestions,
  );
  const selectedLinks = [homepage.finalUrl, ...linkCandidates].slice(0, 9);
  const pages = await Promise.all(
    selectedLinks.map(async (url) => ({
      url,
      html: url === homepage.finalUrl ? homepage.html : (await fetchHtml(url)).html,
    })),
  );

  const texts = pages
    .filter((page) => page.html)
    .map((page) => `SOURCE: ${page.url}\n${htmlToText(page.html ?? "")}`);

  if (texts.length === 0) {
    warnings.push(`${university.name} did not return readable public HTML.`);
  }

  return {
    text: texts.join("\n\n").slice(0, 42000),
    urls: pages.filter((page) => page.html).map((page) => page.url),
    warnings,
  };
}

export function buildHeuristicCourses(params: {
  university: UniversitySource;
  degree: string;
  suggestions: CourseSuggestion[];
  scrapedText: string;
  sourceUrls: string[];
}): ScrapedCourse[] {
  const { university, degree, suggestions, scrapedText, sourceUrls } = params;
  const detectedNames = detectCourseNames(scrapedText, degree, suggestions);
  const fields = detectSharedFields(scrapedText);
  const names =
    detectedNames.length > 0
      ? detectedNames
      : suggestions.slice(0, 3).map((suggestion) => suggestion.title);

  return names.slice(0, 6).map((courseName, index) => ({
    id: `${slug(university.name)}-${slug(courseName)}-${index}`,
    universityName: university.name,
    country: university.country,
    website: university.website,
    courseName,
    degreeLevel: inferDegreeLevel(courseName),
    matchedSuggestion: matchSuggestion(courseName, suggestions) || degree,
    mediumOfInstruction: fields.mediumOfInstruction,
    admissionOpeningDate: fields.admissionOpeningDate,
    applicationFee: fields.applicationFee,
    universityFee: fields.universityFee,
    sourceUrl: sourceUrls[0] || university.website || "",
    confidence: detectedNames.length > 0 ? "medium" : "low",
    notes:
      detectedNames.length > 0
        ? "Detected from public page text; verify the official source before applying."
        : "No exact matching course table was found on scanned pages; shown as a suggested search target.",
  }));
}

function discoverRelevantLinks(
  html: string,
  baseUrl: string,
  degree: string,
  suggestions: CourseSuggestion[],
) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const keywords = [
    ...LINK_HINTS,
    ...degree.toLowerCase().split(/\s+/).filter(Boolean),
    ...suggestions.flatMap((suggestion) => suggestion.keywords),
  ].map((item) => item.toLowerCase());

  const links: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const label = `${$(element).text()} ${href}`.toLowerCase();
    if (!href || !keywords.some((keyword) => label.includes(keyword))) {
      return;
    }

    const normalized = normalizeLink(href, baseUrl);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    links.push(normalized);
  });

  return links.slice(0, 16);
}

async function fetchHtml(url: string): Promise<{ html?: string; finalUrl: string }> {
  try {
    const response = await fetchWithTimeout(url, {}, 15000);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return { finalUrl: response.url || url };
    }

    return { html: await response.text(), finalUrl: response.url || url };
  } catch {
    return { finalUrl: url };
  }
}

function htmlToText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer").remove();

  return $("body")
    .text()
    .replace(/\s+/g, " ")
    .replace(/\s+([:,.])/g, "$1")
    .trim();
}

function normalizeLink(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function detectCourseNames(
  text: string,
  degree: string,
  suggestions: CourseSuggestion[],
) {
  const keywords = [
    degree,
    ...suggestions.map((suggestion) => suggestion.title),
    ...suggestions.flatMap((suggestion) => suggestion.keywords),
  ]
    .flatMap((item) => item.toLowerCase().split(/\s+/))
    .filter((item) => item.length > 3);

  const seen = new Set<string>();
  return text
    .split(/(?<=[.;])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 140)
    .filter((line) => /bachelor|master|phd|doctor|bs\b|bsc|ba\b|ms\b|msc|program|programme|degree|course/i.test(line))
    .filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)))
    .map((line) => line.replace(/\s+/g, " "))
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function detectSharedFields(text: string) {
  return {
    mediumOfInstruction:
      findNearby(text, /(medium|language) of instruction/i, /(English|Urdu|Arabic|French|German|Spanish|Chinese|Hindi|Bengali|Malay|Turkish)/i) ||
      "Not found on scanned public pages",
    admissionOpeningDate:
      findNearby(text, /(admission|apply|application).{0,40}(open|start|deadline|date)/i, /(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i) ||
      "Not found on scanned public pages",
    applicationFee:
      findNearby(text, /(application|admission|processing|registration).{0,20}fee/i, /(Rs\.?|PKR|USD|\$|EUR|GBP|AED|SAR|INR|BDT|Tk\.?)\s?[\d,]+/i) ||
      "Not found on scanned public pages",
    universityFee:
      findNearby(text, /(tuition|semester|annual|university|program).{0,20}fee/i, /(Rs\.?|PKR|USD|\$|EUR|GBP|AED|SAR|INR|BDT|Tk\.?)\s?[\d,]+/i) ||
      "Not found on scanned public pages",
  };
}

function findNearby(text: string, anchor: RegExp, value: RegExp) {
  const match = anchor.exec(text);
  if (!match?.index) {
    return undefined;
  }

  const window = text.slice(match.index, match.index + 280);
  return value.exec(window)?.[0];
}

function inferDegreeLevel(courseName: string) {
  if (/phd|doctor/i.test(courseName)) {
    return "PhD";
  }
  if (/master|ms\b|msc|m\.sc|graduate/i.test(courseName)) {
    return "Master";
  }
  if (/bachelor|bs\b|bsc|b\.sc|ba\b|undergraduate/i.test(courseName)) {
    return "Bachelor";
  }
  return "Unknown";
}

function matchSuggestion(courseName: string, suggestions: CourseSuggestion[]) {
  const lower = courseName.toLowerCase();
  return suggestions.find((suggestion) =>
    suggestion.keywords.some((keyword) => lower.includes(keyword.toLowerCase())),
  )?.title;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
