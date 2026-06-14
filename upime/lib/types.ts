export type CourseSuggestion = {
  title: string;
  reason: string;
  keywords: string[];
};

export type UniversitySource = {
  name: string;
  country: string;
  website?: string;
  source: "wikidata" | "hipolabs" | "manual-fallback";
  publicSectorSignal: string;
};

export type ScrapedCourse = {
  id: string;
  universityName: string;
  country: string;
  website?: string;
  courseName: string;
  degreeLevel: string;
  matchedSuggestion: string;
  mediumOfInstruction: string;
  admissionOpeningDate: string;
  applicationFee: string;
  universityFee: string;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type ScrapeRequest = {
  apiKey: string;
  degree: string;
  country: string;
  maxUniversities?: number;
};

export type ScrapeResponse = {
  degree: string;
  country: string;
  generatedAt: string;
  suggestions: CourseSuggestion[];
  universitiesScanned: number;
  universitiesDiscovered: number;
  sources: UniversitySource[];
  results: ScrapedCourse[];
  warnings: string[];
};
