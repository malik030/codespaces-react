"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ScrapeResponse, ScrapedCourse } from "../lib/types";

type FormState = {
  apiKey: string;
  degree: string;
  country: string;
  maxUniversities: string;
};

const initialForm: FormState = {
  apiKey: "",
  degree: "",
  country: "",
  maxUniversities: "12",
};

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [response, setResponse] = useState<ScrapeResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [confidence, setConfidence] = useState("all");

  const filteredResults = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (response?.results ?? []).filter((course) => {
      const matchesConfidence =
        confidence === "all" || course.confidence === confidence;
      const matchesQuery =
        !lowerQuery ||
        [
          course.universityName,
          course.courseName,
          course.mediumOfInstruction,
          course.applicationFee,
          course.universityFee,
          course.admissionOpeningDate,
        ]
          .join(" ")
          .toLowerCase()
          .includes(lowerQuery);

      return matchesConfidence && matchesQuery;
    });
  }, [confidence, query, response]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResponse(null);
    setIsLoading(true);

    try {
      const apiResponse = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: form.apiKey,
          degree: form.degree,
          country: form.country,
          maxUniversities: Number(form.maxUniversities),
        }),
      });
      const data = (await apiResponse.json()) as
        | ScrapeResponse
        | { error?: string };

      if (!apiResponse.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "The scan could not be completed.",
        );
      }

      setResponse(data as ScrapeResponse);
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Something went wrong while scanning.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function exportCsv() {
    if (!response?.results.length) {
      return;
    }

    const headers: Array<keyof ScrapedCourse> = [
      "universityName",
      "courseName",
      "degreeLevel",
      "matchedSuggestion",
      "mediumOfInstruction",
      "admissionOpeningDate",
      "applicationFee",
      "universityFee",
      "sourceUrl",
      "confidence",
      "notes",
    ];

    const csv = [
      headers.join(","),
      ...response.results.map((course) =>
        headers.map((header) => csvEscape(course[header] ?? "")).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `upime-${response.country}-${response.degree}.csv`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <section className="hero">
        <nav className="nav" aria-label="Main navigation">
          <div className="brand">
            <span className="brand-mark">U</span>
            <span>Upime</span>
          </div>
          <a href="#scanner">Start scan</a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">AI assisted admissions research</p>
            <h1>Find public university courses that match your degree plan.</h1>
            <p className="hero-text">
              Enter your Gemini API key, country, and degree interest. Upime
              suggests related programs, scans official public university pages,
              and organizes admissions, fee, and instruction details in one
              place.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#scanner">
                Build my course list
              </a>
              <a className="button ghost" href="#how-it-works">
                See the plan
              </a>
            </div>
          </div>

          <div className="hero-card">
            <div>
              <span className="metric-label">Workflow</span>
              <strong>Suggest, scrape, structure</strong>
            </div>
            <div className="mini-list">
              <span>Gemini course mapping</span>
              <span>Public university discovery</span>
              <span>Readable fees and deadlines</span>
            </div>
          </div>
        </div>
      </section>

      <section className="plan" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">Product plan</p>
          <h2>How Upime handles your request</h2>
        </div>
        <div className="steps">
          <article>
            <span>01</span>
            <h3>Understand the degree</h3>
            <p>
              Gemini turns your degree text into related program names and
              keywords universities commonly publish.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Discover universities</h3>
            <p>
              The server queries public university indexes for the selected
              country and keeps source signals visible.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Scrape official pages</h3>
            <p>
              Admissions, program, tuition, prospectus, and fee links are
              scanned from official sites.
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>Show clean results</h3>
            <p>
              Courses, language, admission dates, application fees, university
              fees, sources, and confidence are shown in a searchable table.
            </p>
          </article>
        </div>
      </section>

      <section className="scanner" id="scanner">
        <div className="scanner-panel">
          <div className="section-heading">
            <p className="eyebrow">Scanner</p>
            <h2>Tell Upime what to search</h2>
            <p>
              Your Gemini API key is sent only with this scan request. It is not
              saved in the browser storage, repository, or environment files.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="scan-form">
            <label>
              Gemini API key
              <input
                type="password"
                required
                value={form.apiKey}
                onChange={(event) => updateField("apiKey", event.target.value)}
                placeholder="Paste your Gemini API key"
                autoComplete="off"
              />
            </label>

            <label>
              Degree interest
              <input
                required
                value={form.degree}
                onChange={(event) => updateField("degree", event.target.value)}
                placeholder="Example: BS Computer Science"
              />
            </label>

            <label>
              Country
              <input
                required
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                placeholder="Example: Pakistan"
              />
            </label>

            <label>
              Universities to scan
              <select
                value={form.maxUniversities}
                onChange={(event) =>
                  updateField("maxUniversities", event.target.value)
                }
              >
                <option value="8">Quick scan: 8</option>
                <option value="12">Balanced scan: 12</option>
                <option value="20">Deep scan: 20</option>
                <option value="40">All discoverable: up to 40</option>
              </select>
            </label>

            <button className="button primary" disabled={isLoading}>
              {isLoading ? "Scanning public sources..." : "Scrape courses"}
            </button>
          </form>
        </div>

        <aside className="tips">
          <h3>Tips for better results</h3>
          <ul>
            <li>Use a specific degree, such as BS Software Engineering.</li>
            <li>Choose the country name in English.</li>
            <li>Verify final fees and deadlines on the official source link.</li>
          </ul>
        </aside>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      {isLoading ? (
        <section className="loading-card" aria-live="polite">
          <div className="spinner" />
          <div>
            <h2>Scanning official university pages</h2>
            <p>
              This can take a little while because Upime checks discovery
              sources, crawls public pages, and asks Gemini to extract clean
              records.
            </p>
          </div>
        </section>
      ) : null}

      {response ? (
        <section className="results">
          <div className="results-header">
            <div>
              <p className="eyebrow">Results</p>
              <h2>
                {response.results.length} course records for {response.degree}
              </h2>
              <p>
                Scanned {response.universitiesScanned} of{" "}
                {response.universitiesDiscovered} discovered universities in{" "}
                {response.country}.
              </p>
            </div>
            <button
              className="button secondary"
              onClick={exportCsv}
              disabled={!response.results.length}
            >
              Export CSV
            </button>
          </div>

          <div className="suggestions">
            <h3>Gemini suggested related courses</h3>
            <div className="chips">
              {response.suggestions.map((suggestion) => (
                <span key={suggestion.title}>{suggestion.title}</span>
              ))}
            </div>
          </div>

          {response.warnings.length ? (
            <div className="alert">
              <strong>Important notes</strong>
              <ul>
                {response.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search university, course, fee, language..."
            />
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
            >
              <option value="all">All confidence levels</option>
              <option value="high">High confidence</option>
              <option value="medium">Medium confidence</option>
              <option value="low">Low confidence</option>
            </select>
          </div>

          {filteredResults.length ? (
            <>
              <div className="card-grid">
                {filteredResults.slice(0, 6).map((course) => (
                  <CourseCard course={course} key={course.id} />
                ))}
              </div>
              <ResultsTable courses={filteredResults} />
            </>
          ) : (
            <div className="empty-state">
              <h3>No rows match the current filter.</h3>
              <p>Try clearing search text or changing the confidence filter.</p>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function CourseCard({ course }: { course: ScrapedCourse }) {
  return (
    <article className="course-card">
      <div className="course-card-top">
        <span className={`confidence ${course.confidence}`}>
          {course.confidence}
        </span>
        <span>{course.degreeLevel}</span>
      </div>
      <h3>{course.courseName}</h3>
      <p>{course.universityName}</p>
      <dl>
        <div>
          <dt>Medium</dt>
          <dd>{course.mediumOfInstruction}</dd>
        </div>
        <div>
          <dt>Admission opens</dt>
          <dd>{course.admissionOpeningDate}</dd>
        </div>
        <div>
          <dt>Application fee</dt>
          <dd>{course.applicationFee}</dd>
        </div>
        <div>
          <dt>University fee</dt>
          <dd>{course.universityFee}</dd>
        </div>
      </dl>
      {course.sourceUrl ? (
        <a href={course.sourceUrl} target="_blank" rel="noreferrer">
          View source
        </a>
      ) : null}
    </article>
  );
}

function ResultsTable({ courses }: { courses: ScrapedCourse[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>University</th>
            <th>Course</th>
            <th>Medium</th>
            <th>Admission opening</th>
            <th>Application fee</th>
            <th>University fee</th>
            <th>Confidence</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td>{course.universityName}</td>
              <td>
                <strong>{course.courseName}</strong>
                <span>{course.notes}</span>
              </td>
              <td>{course.mediumOfInstruction}</td>
              <td>{course.admissionOpeningDate}</td>
              <td>{course.applicationFee}</td>
              <td>{course.universityFee}</td>
              <td>
                <span className={`confidence ${course.confidence}`}>
                  {course.confidence}
                </span>
              </td>
              <td>
                {course.sourceUrl ? (
                  <a href={course.sourceUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  "Not available"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function csvEscape(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
