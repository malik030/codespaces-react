import { NextResponse } from "next/server";
import { discoverPublicUniversities } from "../../../lib/discovery";
import { extractCoursesWithGemini, suggestCoursesWithGemini } from "../../../lib/gemini";
import { buildHeuristicCourses, scrapeUniversityPages } from "../../../lib/scraper";
import type { ScrapeRequest, ScrapeResponse, ScrapedCourse } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_UNIVERSITIES_PER_SCAN = 40;

export async function POST(request: Request) {
  let payload: Partial<ScrapeRequest>;

  try {
    payload = (await request.json()) as Partial<ScrapeRequest>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const apiKey = payload.apiKey?.trim();
  const degree = payload.degree?.trim();
  const country = payload.country?.trim();
  const maxUniversities = clampMax(payload.maxUniversities);

  if (!apiKey || !degree || !country) {
    return NextResponse.json(
      {
        error:
          "Gemini API key, degree interest, and country are all required.",
      },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  let suggestions;
  try {
    suggestions = await suggestCoursesWithGemini(apiKey, degree, country);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Gemini course suggestion failed: ${error.message}`
            : "Gemini course suggestion failed.",
      },
      { status: 502 },
    );
  }

  const discovery = await discoverPublicUniversities(country);
  warnings.push(...discovery.warnings);

  const selectedUniversities = discovery.universities.slice(0, maxUniversities);
  if (discovery.universities.length > selectedUniversities.length) {
    warnings.push(
      `Showing the first ${selectedUniversities.length} discoverable universities from ${discovery.universities.length}. Increase the scan limit to cover more.`,
    );
  }

  const results: ScrapedCourse[] = [];

  for (const [universityIndex, university] of selectedUniversities.entries()) {
    const scrape = await scrapeUniversityPages(university, degree, suggestions);
    warnings.push(...scrape.warnings);

    if (!scrape.text) {
      continue;
    }

    try {
      const extracted = await extractCoursesWithGemini({
        apiKey,
        university,
        degree,
        suggestions,
        scrapedText: scrape.text,
        sourceUrls: scrape.urls,
      });

      if (extracted.length > 0) {
        results.push(
          ...extracted.map((course, courseIndex) => ({
            id: `${slug(university.name)}-${universityIndex}-${courseIndex}`,
            universityName: university.name,
            country: university.country,
            website: university.website,
            ...course,
          })),
        );
        continue;
      }
    } catch (error) {
      warnings.push(
        `${university.name}: Gemini extraction failed, so heuristic extraction was used. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
      );
    }

    results.push(
      ...buildHeuristicCourses({
        university,
        degree,
        suggestions,
        scrapedText: scrape.text,
        sourceUrls: scrape.urls,
      }),
    );
  }

  const response: ScrapeResponse = {
    degree,
    country,
    generatedAt: new Date().toISOString(),
    suggestions,
    universitiesScanned: selectedUniversities.length,
    universitiesDiscovered: discovery.universities.length,
    sources: selectedUniversities,
    results,
    warnings: unique(warnings),
  };

  return NextResponse.json(response);
}

function clampMax(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 12;
  }
  return Math.min(Math.max(Math.floor(numeric), 1), MAX_UNIVERSITIES_PER_SCAN);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
