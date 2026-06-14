import { useMemo, useState } from 'react';
import './App.css';

const GEMINI_MODEL = 'gemini-2.0-flash';

const INITIAL_FORM = {
  apiKey: '',
  country: '',
  degree: '',
  intake: '',
  notes: '',
};

const EMPTY_STATUS = {
  type: 'idle',
  message: '',
};

function buildGeminiUrl(apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey.trim(),
  )}`;
}

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('\n') || ''
  );
}

function stripJsonFence(value) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonFromGemini(text) {
  const cleanedText = stripJsonFence(text);

  try {
    return JSON.parse(cleanedText);
  } catch (error) {
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleanedText.slice(firstBrace, lastBrace + 1));
    }

    throw error;
  }
}

async function callGemini(apiKey, prompt, { useSearch = false } = {}) {
  const baseBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
    },
  };

  const body = useSearch
    ? {
        ...baseBody,
        tools: [{ google_search: {} }],
      }
    : baseBody;

  const response = await fetch(buildGeminiUrl(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      'Gemini API request failed. Check the API key, billing status, and model access.';
    throw new Error(message);
  }

  const text = extractGeminiText(data);

  if (!text) {
    throw new Error('Gemini returned an empty response. Try a more specific country or degree.');
  }

  return {
    data,
    json: parseJsonFromGemini(text),
  };
}

function buildCourseSuggestionPrompt({ degree, country, notes }) {
  return `
You are UPIME, an education discovery assistant.
The user will provide a degree interest and a country. Suggest related public university course/program names that should be searched.

Degree interest: ${degree}
Country: ${country}
Extra user notes: ${notes || 'None'}

Return ONLY valid JSON with this exact shape:
{
  "courses": [
    {
      "name": "course or program name",
      "whyRelevant": "short reason this course matches the degree interest",
      "keywords": ["keyword", "keyword"]
    }
  ],
  "note": "short guidance for the user"
}

Rules:
- Suggest 6 to 10 courses.
- Prefer names that public sector universities commonly publish in admissions pages.
- Do not include private institutions.
- Keep all strings concise.
`;
}

function buildScrapePrompt({ country, degree, intake, notes, selectedCourses }) {
  return `
You are UPIME, a public-sector university data extraction assistant.
Use public web information and official university/admission pages where available.

Country: ${country}
Original degree interest: ${degree}
Course/program areas to search: ${selectedCourses.join(', ')}
Preferred intake/session: ${intake || 'Any current or next available intake'}
Extra user notes: ${notes || 'None'}

Find public sector universities in the specified country that offer these course/program areas.
For each available public university course/program, extract:
- university name
- country
- public/private sector status
- course/program name
- degree level
- medium of instruction
- admission opening date or status
- application fee
- university/tuition fee
- source URL
- confidence
- short notes

Return ONLY valid JSON with this exact shape:
{
  "searchedAt": "ISO date",
  "coverageNotes": "short explanation of coverage, uncertainty, and whether official pages were found",
  "results": [
    {
      "university": "name",
      "country": "country",
      "sector": "Public",
      "course": "program name",
      "degreeLevel": "BS/MS/PhD/Other",
      "mediumOfInstruction": "English/Local language/Mixed/Not published",
      "admissionOpeningDate": "date, month, status, or Not published",
      "applicationFee": "amount with currency or Not published",
      "tuitionFee": "amount with currency or Not published",
      "sourceUrl": "https://...",
      "confidence": "High/Medium/Low",
      "notes": "short evidence note"
    }
  ]
}

Rules:
- Include public sector universities only.
- Prefer official university, admission portal, prospectus, or regulator pages.
- If a field is unavailable, write "Not published" instead of guessing.
- Include source URLs for every row.
- Deduplicate the same university/course combination.
- Sort by university name, then course.
- Return at least 12 rows when public data is available.
`;
}

function normalizeCourses(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((course, index) => ({
      id: `${course?.name || 'course'}-${index}`,
      name: String(course?.name || '').trim(),
      whyRelevant: String(course?.whyRelevant || '').trim(),
      keywords: Array.isArray(course?.keywords) ? course.keywords.filter(Boolean) : [],
    }))
    .filter((course) => course.name);
}

function normalizeResults(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      const sourceUrl = String(row?.sourceUrl || '').trim();

      return {
        university: String(row?.university || 'Not published').trim(),
        country: String(row?.country || 'Not published').trim(),
        sector: String(row?.sector || 'Public').trim(),
        course: String(row?.course || 'Not published').trim(),
        degreeLevel: String(row?.degreeLevel || 'Not published').trim(),
        mediumOfInstruction: String(row?.mediumOfInstruction || 'Not published').trim(),
        admissionOpeningDate: String(row?.admissionOpeningDate || 'Not published').trim(),
        applicationFee: String(row?.applicationFee || 'Not published').trim(),
        tuitionFee: String(row?.tuitionFee || 'Not published').trim(),
        sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '',
        confidence: String(row?.confidence || 'Low').trim(),
        notes: String(row?.notes || '').trim(),
      };
    })
    .filter(
      (row) =>
        row.sector.toLowerCase().includes('public') &&
        (row.university !== 'Not published' || row.course !== 'Not published'),
    );
}

function toCsv(rows) {
  const headers = [
    'University',
    'Country',
    'Sector',
    'Course',
    'Degree level',
    'Medium of instruction',
    'Admission opening date',
    'Application fee',
    'University fee',
    'Source URL',
    'Confidence',
    'Notes',
  ];

  const csvRows = rows.map((row) =>
    [
      row.university,
      row.country,
      row.sector,
      row.course,
      row.degreeLevel,
      row.mediumOfInstruction,
      row.admissionOpeningDate,
      row.applicationFee,
      row.tuitionFee,
      row.sourceUrl,
      row.confidence,
      row.notes,
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(','),
  );

  return [headers.join(','), ...csvRows].join('\n');
}

function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'upime-public-university-courses.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCourseNames, setSelectedCourseNames] = useState([]);
  const [results, setResults] = useState([]);
  const [coverageNotes, setCoverageNotes] = useState('');
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  const selectedCourses = useMemo(() => {
    if (selectedCourseNames.length > 0) {
      return selectedCourseNames;
    }

    return suggestions.map((course) => course.name);
  }, [selectedCourseNames, suggestions]);

  const canSuggest = form.apiKey.trim() && form.country.trim() && form.degree.trim();
  const canScrape = canSuggest && selectedCourses.length > 0 && !isScraping;

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleCourse(courseName) {
    setSelectedCourseNames((current) => {
      if (current.includes(courseName)) {
        return current.filter((name) => name !== courseName);
      }

      return [...current, courseName];
    });
  }

  async function handleSuggestCourses(event) {
    event.preventDefault();

    if (!canSuggest) {
      setStatus({
        type: 'error',
        message: 'Enter your Gemini API key, country, and degree before asking for course ideas.',
      });
      return;
    }

    setIsSuggesting(true);
    setStatus({
      type: 'working',
      message: 'Asking Gemini to suggest related courses...',
    });
    setResults([]);
    setCoverageNotes('');

    try {
      const response = await callGemini(form.apiKey, buildCourseSuggestionPrompt(form));
      const normalizedCourses = normalizeCourses(response.json?.courses);

      if (normalizedCourses.length === 0) {
        throw new Error('Gemini did not return any course suggestions. Try a broader degree name.');
      }

      setSuggestions(normalizedCourses);
      setSelectedCourseNames(normalizedCourses.slice(0, 6).map((course) => course.name));
      setStatus({
        type: 'success',
        message: response.json?.note || 'Course suggestions are ready. Review them before scraping.',
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message,
      });
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleScrapeCourses() {
    if (!canScrape) {
      setStatus({
        type: 'error',
        message: 'Select at least one suggested course before scraping university data.',
      });
      return;
    }

    setIsScraping(true);
    setStatus({
      type: 'working',
      message: 'Searching public university sources with Gemini. This can take a moment...',
    });

    try {
      let response;

      try {
        response = await callGemini(
          form.apiKey,
          buildScrapePrompt({ ...form, selectedCourses }),
          { useSearch: true },
        );
      } catch (searchError) {
        response = await callGemini(form.apiKey, buildScrapePrompt({ ...form, selectedCourses }));
      }

      const normalizedResults = normalizeResults(response.json?.results);

      if (normalizedResults.length === 0) {
        throw new Error('No public university course rows were returned. Try a broader course set.');
      }

      setResults(normalizedResults);
      setCoverageNotes(response.json?.coverageNotes || 'Results were generated from public sources.');
      setStatus({
        type: 'success',
        message: `Found ${normalizedResults.length} public university course rows.`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message,
      });
    } finally {
      setIsScraping(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <nav className="topbar" aria-label="Main navigation">
          <div className="brand-mark" aria-label="UPIME home">
            <span className="brand-dot" />
            UPIME
          </div>
          <a href="#results" className="nav-link">
            View results
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">AI university program intelligence</p>
            <h1>Discover public sector university courses from one degree idea.</h1>
            <p className="hero-text">
              Enter your Gemini API key, country, and degree. UPIME suggests related programs,
              searches public university sources, and organizes fees, admissions, language, and
              source links into a readable table.
            </p>
            <div className="hero-actions">
              <a href="#search" className="button primary">
                Start searching
              </a>
              <a
                className="button secondary"
                href="https://ai.google.dev/gemini-api/docs/api-key"
                target="_blank"
                rel="noreferrer"
              >
                Get Gemini key
              </a>
            </div>
          </div>

          <aside className="workflow-card" aria-label="UPIME workflow">
            <span className="card-label">How it works</span>
            <ol>
              <li>Suggest degree-related public university courses.</li>
              <li>Select the programs that match your goal.</li>
              <li>Scrape structured public university data with sources.</li>
            </ol>
          </aside>
        </div>
      </section>

      <section id="search" className="panel search-panel">
        <div className="section-heading">
          <p className="eyebrow">Step 1</p>
          <h2>Tell UPIME what you want to study</h2>
          <p>
            Your API key is used only in this browser session. For production use, place Gemini
            calls behind your own backend so keys are never exposed to visitors.
          </p>
        </div>

        <form className="search-form" onSubmit={handleSuggestCourses}>
          <label>
            Gemini API key
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => updateField('apiKey', event.target.value)}
              placeholder="Paste your Gemini API key"
              autoComplete="off"
            />
          </label>

          <label>
            Country
            <input
              value={form.country}
              onChange={(event) => updateField('country', event.target.value)}
              placeholder="Example: Pakistan"
            />
          </label>

          <label>
            Degree or field
            <input
              value={form.degree}
              onChange={(event) => updateField('degree', event.target.value)}
              placeholder="Example: Computer Science"
            />
          </label>

          <label>
            Intake/session (optional)
            <input
              value={form.intake}
              onChange={(event) => updateField('intake', event.target.value)}
              placeholder="Example: Fall 2026"
            />
          </label>

          <label className="wide-field">
            Extra instructions (optional)
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="Example: undergraduate only, engineering universities, English medium preferred"
              rows="4"
            />
          </label>

          <button className="button primary form-button" type="submit" disabled={!canSuggest || isSuggesting}>
            {isSuggesting ? 'Suggesting courses...' : 'Suggest related courses'}
          </button>
        </form>

        {status.message && (
          <div className={`status status-${status.type}`} role="status">
            {status.message}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Step 2</p>
          <h2>Review Gemini course suggestions</h2>
          <p>Select the suggested course areas that UPIME should search across public universities.</p>
        </div>

        {suggestions.length === 0 ? (
          <div className="empty-state">
            <strong>No suggestions yet.</strong>
            <span>Enter your details above and ask Gemini for course ideas.</span>
          </div>
        ) : (
          <>
            <div className="suggestion-grid">
              {suggestions.map((course) => (
                <button
                  className={`suggestion-card ${
                    selectedCourseNames.includes(course.name) ? 'is-selected' : ''
                  }`}
                  key={course.id}
                  type="button"
                  onClick={() => toggleCourse(course.name)}
                >
                  <span className="check-indicator" aria-hidden="true">
                    {selectedCourseNames.includes(course.name) ? 'On' : '+'}
                  </span>
                  <strong>{course.name}</strong>
                  <span>{course.whyRelevant}</span>
                  {course.keywords.length > 0 && (
                    <small>{course.keywords.slice(0, 4).join(' / ')}</small>
                  )}
                </button>
              ))}
            </div>

            <div className="scrape-actions">
              <button className="button primary" type="button" onClick={handleScrapeCourses} disabled={!canScrape}>
                {isScraping ? 'Scraping public data...' : 'Scrape public university courses'}
              </button>
              <span>{selectedCourses.length} course areas selected</span>
            </div>
          </>
        )}
      </section>

      <section id="results" className="panel results-panel">
        <div className="section-heading results-heading">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2>Scraped public university data</h2>
            <p>
              Results include official source links where Gemini found them. Verify critical fees
              and deadlines on the linked university pages before applying.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => downloadCsv(results)}
            disabled={results.length === 0}
          >
            Export CSV
          </button>
        </div>

        {coverageNotes && <div className="coverage-note">{coverageNotes}</div>}

        {results.length === 0 ? (
          <div className="empty-state large">
            <strong>No scraped data yet.</strong>
            <span>After course suggestions are ready, start scraping to fill this table.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>University</th>
                  <th>Course</th>
                  <th>Medium</th>
                  <th>Admissions</th>
                  <th>Application fee</th>
                  <th>University fee</th>
                  <th>Source</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr key={`${row.university}-${row.course}-${index}`}>
                    <td>
                      <strong>{row.university}</strong>
                      <span>{row.country}</span>
                    </td>
                    <td>
                      <strong>{row.course}</strong>
                      <span>{row.degreeLevel}</span>
                    </td>
                    <td>{row.mediumOfInstruction}</td>
                    <td>{row.admissionOpeningDate}</td>
                    <td>{row.applicationFee}</td>
                    <td>{row.tuitionFee}</td>
                    <td>
                      {row.sourceUrl ? (
                        <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                          Open source
                        </a>
                      ) : (
                        'Not published'
                      )}
                    </td>
                    <td>
                      <span className={`confidence confidence-${row.confidence.toLowerCase()}`}>
                        {row.confidence}
                      </span>
                      {row.notes && <small>{row.notes}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
