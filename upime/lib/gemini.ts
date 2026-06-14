import type { CourseSuggestion, ScrapedCourse, UniversitySource } from "./types";
import { fetchWithTimeout } from "./http";

const GEMINI_MODEL = "gemini-2.0-flash";

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ExtractedCourse = Omit<
  ScrapedCourse,
  "id" | "universityName" | "country" | "website"
>;

export async function suggestCoursesWithGemini(
  apiKey: string,
  degree: string,
  country: string,
): Promise<CourseSuggestion[]> {
  const prompt = `
You are an academic admissions research assistant.
The user has written this degree interest: "${degree}".
Country context: "${country}".

Return 6 to 8 closely related university course/program search suggestions.
Use plain English titles that a university admissions website is likely to use.
Return only valid JSON with this exact shape:
[
  {
    "title": "Course or program title",
    "reason": "Short reason this matches the user's degree",
    "keywords": ["keyword", "keyword"]
  }
]
`;

  const text = await generateGeminiText(apiKey, prompt);
  const parsed = parseJson<CourseSuggestion[]>(text);

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed
      .filter((item) => item.title && Array.isArray(item.keywords))
      .slice(0, 8)
      .map((item) => ({
        title: item.title,
        reason: item.reason || `Related to ${degree}`,
        keywords: item.keywords.slice(0, 8),
      }));
  }

  return fallbackSuggestions(degree);
}

export async function extractCoursesWithGemini(params: {
  apiKey: string;
  university: UniversitySource;
  degree: string;
  suggestions: CourseSuggestion[];
  scrapedText: string;
  sourceUrls: string[];
}): Promise<ExtractedCourse[]> {
  const { apiKey, university, degree, suggestions, scrapedText, sourceUrls } =
    params;
  const suggestionTitles = suggestions.map((item) => item.title).join(", ");
  const sourceList = sourceUrls.join("\n");

  const prompt = `
You extract admissions data from official university website text.

University: ${university.name}
Country: ${university.country}
User degree interest: ${degree}
Related course suggestions: ${suggestionTitles}
Source URLs:
${sourceList}

Rules:
- Extract courses/programs that match the user degree or related suggestions.
- Prefer exact official page text. Do not invent dates or fees.
- If a field is not present, write "Not found on scanned public pages".
- Medium of instruction means language of teaching, such as English, Urdu, Arabic, etc.
- Fees may appear as admission, application, processing, tuition, semester, annual, or program fee.
- Keep each note short and useful.
- Return only valid JSON, no markdown.

JSON shape:
[
  {
    "courseName": "Program title",
    "degreeLevel": "Bachelor/Master/PhD/Diploma/Unknown",
    "matchedSuggestion": "Suggestion title or user degree",
    "mediumOfInstruction": "Language or not found",
    "admissionOpeningDate": "Date/window or not found",
    "applicationFee": "Amount or not found",
    "universityFee": "Amount/tuition or not found",
    "sourceUrl": "Best matching source URL",
    "confidence": "high|medium|low",
    "notes": "Short evidence note"
  }
]

Official website text:
"""${scrapedText.slice(0, 22000)}"""
`;

  const text = await generateGeminiText(apiKey, prompt, 0.1);
  const parsed = parseJson<ExtractedCourse[]>(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item) => item.courseName)
    .slice(0, 12)
    .map((item) => ({
      courseName: item.courseName,
      degreeLevel: item.degreeLevel || "Unknown",
      matchedSuggestion: item.matchedSuggestion || degree,
      mediumOfInstruction:
        item.mediumOfInstruction || "Not found on scanned public pages",
      admissionOpeningDate:
        item.admissionOpeningDate || "Not found on scanned public pages",
      applicationFee: item.applicationFee || "Not found on scanned public pages",
      universityFee: item.universityFee || "Not found on scanned public pages",
      sourceUrl: item.sourceUrl || sourceUrls[0] || university.website || "",
      confidence: normalizeConfidence(item.confidence),
      notes: item.notes || "Extracted from scanned public website text.",
    }));
}

async function generateGeminiText(
  apiKey: string,
  prompt: string,
  temperature = 0.25,
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      }),
    },
    25000,
  );

  const data = (await response.json()) as GeminiApiResponse;

  if (!response.ok || data.error?.message) {
    throw new Error(
      data.error?.message || `Gemini API responded with ${response.status}`,
    );
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

function parseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    const firstArray = withoutFence.indexOf("[");
    const lastArray = withoutFence.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
      try {
        return JSON.parse(withoutFence.slice(firstArray, lastArray + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function fallbackSuggestions(degree: string): CourseSuggestion[] {
  return [
    {
      title: degree,
      reason: "Direct match for the degree entered by the user.",
      keywords: degree.split(/\s+/).filter(Boolean),
    },
    {
      title: `${degree} undergraduate programs`,
      reason: "Common wording on admissions pages.",
      keywords: [degree, "undergraduate", "programs", "admission"],
    },
    {
      title: `${degree} graduate programs`,
      reason: "Covers masters and postgraduate listings.",
      keywords: [degree, "graduate", "masters", "postgraduate"],
    },
  ];
}

function normalizeConfidence(value: ScrapedCourse["confidence"]) {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "low";
}
