import { useMemo, useState } from 'react';
import './App.css';

const GEMINI_MODEL = 'gemini-2.0-flash';
const UNKNOWN = 'Not published';

const starterCourses = [
  'Computer Science',
  'Software Engineering',
  'Data Science',
  'Electrical Engineering',
  'Business Administration',
];

function buildSuggestionPrompt(degree, country) {
  return `
You are an admissions research assistant for public sector universities.
The student wrote this degree interest: "${degree}".
Country context: "${country || 'not specified'}".

Suggest degree-related courses and program names the student should search for.
Return JSON only with this exact shape:
{
  "courses": [
    {
      "name": "Course or program name",
      "rationale": "Short reason this matches the student's degree interest",
      "keywords": ["keyword 1", "keyword 2", "keyword 3"]
    }
  ]
}

Rules:
- Return 6 to 10 useful course/program suggestions.
- Include common local naming variants if the country has them.
- Do not include markdown fences.
`;
}

function buildResearchPrompt({ country, degree, selectedCourses, maxResults }) {
  const courseText = selectedCourses.length ? selectedCourses.join(', ') : degree;

  return `
You are UPIME, a careful public university admissions data extractor.
Use current public web information where available, prioritizing official public university websites, official admissions portals, prospectuses, and government higher education lists.

Research country: "${country}".
Student degree interest: "${degree}".
Course/program keywords to search: "${courseText}".
Target result count: up to ${maxResults} rows.

Find public sector universities in the country that offer relevant courses. Extract the available course/admission data into normalized JSON only:
{
  "summary": {
    "country": "Country name",
    "degree": "Degree interest",
    "coverageNote": "Short explanation of how complete the scan is and any limits",
    "officialSourcePriority": "Short note about source quality"
  },
  "results": [
    {
      "university": "University name",
      "publicSectorStatus": "Public sector / Government / State / Unknown",
      "country": "Country",
      "course": "Exact course or program name",
      "degreeLevel": "Bachelor / Master / PhD / Diploma / Unknown",
      "mediumOfInstruction": "English / Urdu / Local language / Mixed / Not published",
      "admissionOpeningDate": "YYYY-MM-DD, month/year, status text, or Not published",
      "applicationFee": "Amount with currency or Not published",
      "universityFee": "Tuition/semester/year fee with currency or Not published",
      "deadlineOrIntake": "Deadline/intake text or Not published",
      "sourceUrl": "Most relevant official URL",
      "sourceName": "Official source name",
      "confidence": "High / Medium / Low",
      "notes": "Short note if data is missing, estimated, or needs verification"
    }
  ],
  "nextSearches": [
    "Useful official search query or source to check next"
  ]
}

Strict rules:
- Return JSON only, no markdown fences.
- Do not invent dates, fees, or medium of instruction. Use "${UNKNOWN}" when the official source does not publish a field.
- Prefer breadth across public sector universities, but do not duplicate the same university/course combination.
- Every row must have a sourceUrl. Prefer official pages; if not found, use the closest official admissions/prospectus page and lower confidence.
- If live search cannot access enough official data, say so in summary.coverageNote and still return the best verifiable rows.
`;
}

function stripCodeFence(text) {
  return text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseGeminiJson(text) {
  const clean = stripCodeFence(text);

  try {
    return JSON.parse(clean);
  } catch (error) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }

    throw error;
  }
}

async function callGemini({ apiKey, prompt, useSearch = false }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: useSearch ? 0.25 : 0.45,
      responseMimeType: 'application/json',
    },
  };

  if (useSearch) {
    payload.tools = [{ google_search: {} }];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini request failed with HTTP status ${response.status}.`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n');

  if (!text) {
    throw new Error('Gemini returned an empty response. Try a smaller scan.');
  }

  return parseGeminiJson(text);
}

function normalizeResults(results = []) {
  return results.map((item, index) => ({
    id: `${item.university || 'university'}-${item.course || 'course'}-${index}`,
    university: item.university || UNKNOWN,
    publicSectorStatus: item.publicSectorStatus || UNKNOWN,
    country: item.country || UNKNOWN,
    course: item.course || UNKNOWN,
    degreeLevel: item.degreeLevel || UNKNOWN,
    mediumOfInstruction: item.mediumOfInstruction || UNKNOWN,
    admissionOpeningDate: item.admissionOpeningDate || UNKNOWN,
    applicationFee: item.applicationFee || UNKNOWN,
    universityFee: item.universityFee || UNKNOWN,
    deadlineOrIntake: item.deadlineOrIntake || UNKNOWN,
    sourceUrl: item.sourceUrl || '',
    sourceName: item.sourceName || 'Official source',
    confidence: item.confidence || 'Medium',
    notes: item.notes || '',
  }));
}

function downloadCsv(rows) {
  const columns = [
    'university',
    'publicSectorStatus',
    'country',
    'course',
    'degreeLevel',
    'mediumOfInstruction',
    'admissionOpeningDate',
    'deadlineOrIntake',
    'applicationFee',
    'universityFee',
    'sourceUrl',
    'confidence',
    'notes',
  ];

  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'upime-public-university-courses.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [country, setCountry] = useState('Pakistan');
  const [degree, setDegree] = useState('Computer Science');
  const [maxResults, setMaxResults] = useState('25');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [nextSearches, setNextSearches] = useState([]);
  const [filter, setFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState('');

  const selectedSet = useMemo(() => new Set(selectedCourses), [selectedCourses]);

  const filteredResults = useMemo(() => {
    const query = filter.trim().toLowerCase();

    return results.filter((row) => {
      const matchesQuery =
        !query ||
        [
          row.university,
          row.course,
          row.degreeLevel,
          row.mediumOfInstruction,
          row.applicationFee,
          row.universityFee,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);

      const matchesConfidence =
        confidenceFilter === 'All' || row.confidence === confidenceFilter;

      return matchesQuery && matchesConfidence;
    });
  }, [confidenceFilter, filter, results]);

  const stats = useMemo(() => {
    const universities = new Set(results.map((row) => row.university)).size;
    const highConfidence = results.filter((row) => row.confidence === 'High').length;
    const missingFee = results.filter(
      (row) =>
        row.applicationFee === UNKNOWN ||
        row.universityFee === UNKNOWN ||
        row.applicationFee.toLowerCase().includes('not published') ||
        row.universityFee.toLowerCase().includes('not published'),
    ).length;

    return { universities, highConfidence, missingFee };
  }, [results]);

  const canSuggest = apiKey.trim() && degree.trim();
  const canResearch = apiKey.trim() && country.trim() && degree.trim();

  async function handleSuggest(event) {
    event.preventDefault();
    setError('');
    setLoading('suggest');

    try {
      const data = await callGemini({
        apiKey: apiKey.trim(),
        prompt: buildSuggestionPrompt(degree.trim(), country.trim()),
      });
      const courses = Array.isArray(data.courses) ? data.courses : [];
      setSuggestions(courses);
      setSelectedCourses(courses.slice(0, 4).map((course) => course.name));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading('');
    }
  }

  async function handleResearch(event) {
    event.preventDefault();
    setError('');
    setLoading('research');

    try {
      const prompt = buildResearchPrompt({
        country: country.trim(),
        degree: degree.trim(),
        selectedCourses,
        maxResults,
      });

      let data;
      try {
        data = await callGemini({
          apiKey: apiKey.trim(),
          prompt,
          useSearch: true,
        });
      } catch (searchError) {
        data = await callGemini({
          apiKey: apiKey.trim(),
          prompt: `${prompt}\n\nGoogle Search grounding was not available in this environment. Use your best public knowledge, clearly mark lower confidence, and include official source URLs for verification.`,
        });
      }

      setSummary(data.summary || null);
      setResults(normalizeResults(data.results));
      setNextSearches(Array.isArray(data.nextSearches) ? data.nextSearches : []);
      setLastRun(new Date().toLocaleString());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading('');
    }
  }

  function toggleCourse(courseName) {
    setSelectedCourses((current) =>
      current.includes(courseName)
        ? current.filter((name) => name !== courseName)
        : [...current, courseName],
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="top-nav" aria-label="UPIME navigation">
          <div className="brand-mark">
            <span className="brand-icon">U</span>
            <span>
              <strong>UPIME</strong>
              <small>University Program Intelligence</small>
            </span>
          </div>
          <a href="#results" className="nav-link">
            View data
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">AI-assisted public university scraper</span>
            <h1>Find public sector university courses from one degree idea.</h1>
            <p>
              Enter your Gemini API key, country, and degree. UPIME suggests related
              programs, scans official admissions sources, and presents course data in
              a clean table ready for comparison.
            </p>
            <div className="hero-actions">
              <a href="#search-panel" className="primary-link">
                Start scraping
              </a>
              <a href="#how-it-works" className="secondary-link">
                How it works
              </a>
            </div>
          </div>

          <div className="hero-card" aria-label="UPIME data preview">
            <div className="scan-line">
              <span />
            </div>
            <p className="card-label">Live extraction fields</p>
            <ul>
              <li>Medium of instruction</li>
              <li>Admission opening date</li>
              <li>Application fee</li>
              <li>University tuition fee</li>
              <li>Official source links</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="search-panel" className="workspace-grid">
        <form className="control-panel" onSubmit={handleResearch}>
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>Search setup</h2>
              <p>Your key is used only for this browser request and is not saved.</p>
            </div>
          </div>

          <label>
            Gemini API key
            <div className="key-input">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Paste your Gemini API key"
                autoComplete="off"
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <div className="field-row">
            <label>
              Country
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="e.g. Pakistan, Malaysia, Turkey"
              />
            </label>
            <label>
              Max rows
              <select
                value={maxResults}
                onChange={(event) => setMaxResults(event.target.value)}
              >
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="40">40</option>
                <option value="60">60</option>
              </select>
            </label>
          </div>

          <label>
            Your degree interest
            <input
              value={degree}
              onChange={(event) => setDegree(event.target.value)}
              placeholder="Write your degree, e.g. BS Computer Science"
              list="degree-starters"
            />
            <datalist id="degree-starters">
              {starterCourses.map((course) => (
                <option key={course} value={course} />
              ))}
            </datalist>
          </label>

          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={!canSuggest || loading === 'suggest'}
              onClick={handleSuggest}
            >
              {loading === 'suggest' ? 'Suggesting...' : 'Suggest related courses'}
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!canResearch || loading === 'research'}
            >
              {loading === 'research' ? 'Scraping...' : 'Scrape university data'}
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}
        </form>

        <aside className="suggestion-panel">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>Course suggestions</h2>
              <p>Select the related programs you want UPIME to include.</p>
            </div>
          </div>

          {suggestions.length === 0 ? (
            <div className="empty-state">
              <p>No AI suggestions yet.</p>
              <small>
                Add your degree and API key, then generate related course names.
              </small>
            </div>
          ) : (
            <div className="course-list">
              {suggestions.map((course) => (
                <button
                  type="button"
                  key={course.name}
                  className={selectedSet.has(course.name) ? 'course-chip active' : 'course-chip'}
                  onClick={() => toggleCourse(course.name)}
                >
                  <strong>{course.name}</strong>
                  <span>{course.rationale}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section id="how-it-works" className="info-strip">
        <article>
          <span>1</span>
          <h3>Suggest</h3>
          <p>Gemini expands your degree into matching course and program names.</p>
        </article>
        <article>
          <span>2</span>
          <h3>Scrape</h3>
          <p>UPIME asks Gemini to search official public university sources.</p>
        </article>
        <article>
          <span>3</span>
          <h3>Compare</h3>
          <p>Rows are normalized for medium, dates, fees, source, and confidence.</p>
        </article>
      </section>

      <section id="results" className="results-section">
        <div className="results-header">
          <div>
            <span className="eyebrow">Structured scraped data</span>
            <h2>Available public university courses</h2>
            {summary && (
              <p>
                {summary.coverageNote} {summary.officialSourcePriority}
              </p>
            )}
            {lastRun && <small>Last scan: {lastRun}</small>}
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={filteredResults.length === 0}
            onClick={() => downloadCsv(filteredResults)}
          >
            Export CSV
          </button>
        </div>

        <div className="stats-grid">
          <article>
            <strong>{results.length}</strong>
            <span>course rows</span>
          </article>
          <article>
            <strong>{stats.universities}</strong>
            <span>universities</span>
          </article>
          <article>
            <strong>{stats.highConfidence}</strong>
            <span>high confidence</span>
          </article>
          <article>
            <strong>{stats.missingFee}</strong>
            <span>need fee check</span>
          </article>
        </div>

        <div className="result-tools">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by university, course, fee, or medium"
          />
          <select
            value={confidenceFilter}
            onChange={(event) => setConfidenceFilter(event.target.value)}
            aria-label="Filter by confidence"
          >
            <option>All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>

        {filteredResults.length === 0 ? (
          <div className="empty-results">
            <h3>No scraped rows yet</h3>
            <p>
              Run a scrape to populate this table. Public admission dates and fees
              change frequently, so always open the source links before applying.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>University</th>
                  <th>Course</th>
                  <th>Medium</th>
                  <th>Admission date</th>
                  <th>Application fee</th>
                  <th>University fee</th>
                  <th>Source</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.university}</strong>
                      <small>{row.publicSectorStatus}</small>
                    </td>
                    <td>
                      {row.course}
                      <small>{row.degreeLevel}</small>
                    </td>
                    <td>{row.mediumOfInstruction}</td>
                    <td>
                      {row.admissionOpeningDate}
                      <small>{row.deadlineOrIntake}</small>
                    </td>
                    <td>{row.applicationFee}</td>
                    <td>{row.universityFee}</td>
                    <td>
                      {row.sourceUrl ? (
                        <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                          {row.sourceName || 'Open source'}
                        </a>
                      ) : (
                        UNKNOWN
                      )}
                      {row.notes && <small>{row.notes}</small>}
                    </td>
                    <td>
                      <span className={`confidence ${row.confidence.toLowerCase()}`}>
                        {row.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {nextSearches.length > 0 && (
          <div className="next-searches">
            <h3>Recommended follow-up searches</h3>
            <ul>
              {nextSearches.map((query) => (
                <li key={query}>{query}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
