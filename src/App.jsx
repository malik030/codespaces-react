import { useMemo, useState } from 'react';
import './App.css';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const starterSuggestions = [
  {
    name: 'Computer Science',
    why: 'Software, AI, data, and systems programs commonly map to this degree.',
    level: 'Undergraduate / Graduate',
    keywords: ['computer science', 'software engineering', 'artificial intelligence'],
  },
  {
    name: 'Business Administration',
    why: 'Useful for management, finance, marketing, and entrepreneurship tracks.',
    level: 'Undergraduate / Graduate',
    keywords: ['business administration', 'management sciences', 'commerce'],
  },
  {
    name: 'Civil Engineering',
    why: 'Public universities usually publish detailed fee and admission pages for engineering programs.',
    level: 'Undergraduate',
    keywords: ['civil engineering', 'structural engineering', 'construction'],
  },
];

const emptyResearch = {
  summary: '',
  generatedAt: '',
  country: '',
  courseFocus: '',
  universities: [],
  caveats: [],
};

function cleanJsonText(text) {
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function parseGeminiJson(text) {
  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch (directError) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw directError;
  }
}

function geminiTextFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('\n').trim();
}

function sourceLinksFromResponse(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const links = chunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({
      title: web.title || web.uri,
      uri: web.uri,
    }))
    .filter((source) => source.uri);

  return [...new Map(links.map((source) => [source.uri, source])).values()];
}

async function callGemini({ apiKey, model, prompt, withSearch = false }) {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  };

  if (withSearch) {
    payload.tools = [{ google_search: {} }];
  }

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || 'Gemini request failed. Check your API key and model name.';
    throw new Error(message);
  }

  const text = geminiTextFromResponse(data);

  if (!text) {
    throw new Error('Gemini returned an empty response. Try again with a more specific country or degree.');
  }

  return {
    json: parseGeminiJson(text),
    rawText: text,
    sources: sourceLinksFromResponse(data),
  };
}

function buildSuggestionPrompt({ degree, country }) {
  return `
You are Upime, an education planning assistant. A student entered this degree interest:
"${degree}"
Country context: "${country || 'not specified'}"

Suggest degree-related courses/program searches that public sector universities may offer.

Return JSON only with this exact shape:
{
  "relatedCourses": [
    {
      "name": "Program or course title",
      "why": "One short reason this matches the student's degree interest",
      "level": "Undergraduate, Graduate, Postgraduate, or Mixed",
      "keywords": ["keyword 1", "keyword 2", "keyword 3"]
    }
  ]
}

Rules:
- Return 6 to 9 highly relevant suggestions.
- Keep every field concise.
- Do not include markdown, comments, or text outside JSON.
`;
}

function buildResearchPrompt({ country, degree, courseFocus }) {
  return `
You are Upime's public university admissions data scraper and verifier.

Task:
Find public sector universities in "${country}" that offer courses/programs related to "${courseFocus || degree}".
Prioritize official university websites, admissions offices, prospectuses, fee structures, and public notices.

Return JSON only with this exact shape:
{
  "summary": "Short summary of what was found and how complete it appears.",
  "generatedAt": "Current date in ISO format if known, otherwise today's date as text",
  "country": "${country}",
  "courseFocus": "${courseFocus || degree}",
  "universities": [
    {
      "university": "Official university name",
      "city": "City or campus if available",
      "publicSectorStatus": "Public sector / government / public university evidence",
      "courseName": "Exact course/program name",
      "degreeLevel": "BS/BSc/BA/MS/MSc/PhD/Diploma/etc.",
      "mediumOfInstruction": "English/Local language/Mixed/Not published",
      "admissionOpeningDate": "Date or period, or Not published",
      "applicationFee": "Amount and currency, or Not published",
      "universityFee": "Tuition/semester/annual fee amount and currency, or Not published",
      "officialUrl": "Most relevant official URL",
      "sourceNote": "Short note about where the data came from",
      "confidence": "High/Medium/Low"
    }
  ],
  "caveats": [
    "Important verification caveat"
  ]
}

Strict rules:
- Include only public sector universities.
- Use official sources where possible. If a fee/date is not published, write "Not published" instead of guessing.
- Prefer current or most recent admissions cycles.
- Return as many relevant rows as can be confidently found, up to 30.
- Do not include markdown, comments, citations outside fields, or text outside JSON.
`;
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [degree, setDegree] = useState('');
  const [courseFocus, setCourseFocus] = useState('');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [suggestions, setSuggestions] = useState(starterSuggestions);
  const [research, setResearch] = useState(emptyResearch);
  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const selectedFocus = courseFocus || suggestions[0]?.name || degree;

  const stats = useMemo(() => {
    const rows = research.universities || [];
    const publicCount = rows.filter((row) =>
      row.publicSectorStatus?.toLowerCase().includes('public'),
    ).length;
    const withFees = rows.filter((row) => {
      const fees = `${row.applicationFee || ''} ${row.universityFee || ''}`.toLowerCase();
      return fees && !fees.includes('not published');
    }).length;

    return [
      { label: 'Universities found', value: rows.length },
      { label: 'Public verified rows', value: publicCount },
      { label: 'Rows with fee data', value: withFees },
    ];
  }, [research.universities]);

  async function handleSuggestCourses(event) {
    event.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('Enter your Gemini API key first. Upime uses it only for this browser session.');
      return;
    }

    if (!degree.trim()) {
      setError('Write your degree or study interest so Gemini can suggest related courses.');
      return;
    }

    setStatus('suggesting');

    try {
      const result = await callGemini({
        apiKey: apiKey.trim(),
        model: model.trim() || 'gemini-2.0-flash',
        prompt: buildSuggestionPrompt({ degree: degree.trim(), country: country.trim() }),
      });

      const relatedCourses = result.json.relatedCourses || [];

      if (!relatedCourses.length) {
        throw new Error('No course suggestions were returned. Try a broader degree name.');
      }

      setSuggestions(relatedCourses);
      setCourseFocus(relatedCourses[0].name);
      setStatus('idle');
    } catch (suggestionError) {
      setError(suggestionError.message);
      setStatus('idle');
    }
  }

  async function handleResearch() {
    setError('');

    if (!apiKey.trim()) {
      setError('Enter your Gemini API key first. It is required to research public university data.');
      return;
    }

    if (!country.trim()) {
      setError('Enter a country so Upime can look for public sector universities there.');
      return;
    }

    if (!degree.trim() && !selectedFocus) {
      setError('Write your degree or select a suggested course before scraping data.');
      return;
    }

    setStatus('researching');

    try {
      const result = await callGemini({
        apiKey: apiKey.trim(),
        model: model.trim() || 'gemini-2.0-flash',
        prompt: buildResearchPrompt({
          country: country.trim(),
          degree: degree.trim(),
          courseFocus: selectedFocus,
        }),
        withSearch: true,
      });

      setResearch({
        ...emptyResearch,
        ...result.json,
        universities: result.json.universities || [],
        caveats: result.json.caveats || [],
      });
      setSources(result.sources);
      setStatus('idle');
    } catch (researchError) {
      setError(researchError.message);
      setStatus('idle');
    }
  }

  function exportCsv() {
    const rows = research.universities || [];

    if (!rows.length) {
      setError('Run the scraper first, then export the results.');
      return;
    }

    const headers = [
      'University',
      'City',
      'Public sector status',
      'Course',
      'Degree level',
      'Medium of instruction',
      'Admission opening date',
      'Application fee',
      'University fee',
      'Official URL',
      'Confidence',
    ];

    const csvRows = rows.map((row) =>
      [
        row.university,
        row.city,
        row.publicSectorStatus,
        row.courseName,
        row.degreeLevel,
        row.mediumOfInstruction,
        row.admissionOpeningDate,
        row.applicationFee,
        row.universityFee,
        row.officialUrl,
        row.confidence,
      ]
        .map((value) => `"${String(value || '').replaceAll('"', '""')}"`)
        .join(','),
    );

    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `upime-${country || 'universities'}-${selectedFocus || 'courses'}.csv`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-');
    link.click();
    URL.revokeObjectURL(url);
  }

  const isBusy = status === 'suggesting' || status === 'researching';

  return (
    <main className="app-shell">
      <section className="hero-section">
        <nav className="topbar" aria-label="Primary navigation">
          <div className="brand-mark">
            <span className="brand-icon">U</span>
            <span>Upime</span>
          </div>
          <a href="#results" className="nav-link">
            View results
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Public university course intelligence</p>
            <h1>Scrape public sector university courses with Gemini-guided research.</h1>
            <p className="hero-text">
              Enter your degree, choose a country, provide your own Gemini API key, and Upime
              suggests related courses before researching public university admissions, fees,
              medium of instruction, and official source links.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#scraper">
                Start scraping
              </a>
              <a className="secondary-link" href="#workflow">
                See workflow
              </a>
            </div>
          </div>

          <div className="hero-card" aria-label="Upime highlights">
            <div>
              <span className="card-kicker">Next-level checks</span>
              <h2>Official-source focused</h2>
            </div>
            <ul>
              <li>Course suggestions from your degree query</li>
              <li>Public sector university filtering</li>
              <li>Medium, admission dates, application fees, and tuition fees</li>
              <li>Confidence notes and exportable CSV results</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div>
          <p className="eyebrow">Plan</p>
          <h2 id="workflow-title">How Upime works</h2>
        </div>
        <div className="workflow-grid">
          {[
            ['1', 'Add your key', 'Your Gemini API key stays in this page state and is never saved.'],
            ['2', 'Suggest courses', 'Gemini maps your degree interest to searchable programs.'],
            ['3', 'Scrape public data', 'Grounded research looks for public university admission pages.'],
            ['4', 'Review and export', 'Results are shown in clean cards, a table, and CSV download.'],
          ].map(([number, title, text]) => (
            <article className="workflow-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="scraper-panel" id="scraper">
        <form className="control-card" onSubmit={handleSuggestCourses}>
          <div className="section-heading">
            <p className="eyebrow">Search setup</p>
            <h2>Tell Upime what you want to study</h2>
            <p>
              For best results, use a country name and a clear degree interest such as
              "software engineering", "MBBS", "civil engineering", or "public health".
            </p>
          </div>

          <label>
            Gemini API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste your Gemini API key"
              autoComplete="off"
            />
          </label>

          <div className="form-grid">
            <label>
              Country
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Pakistan"
              />
            </label>

            <label>
              Gemini model
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gemini-2.0-flash"
              />
            </label>
          </div>

          <label>
            Your degree or interest
            <input
              value={degree}
              onChange={(event) => setDegree(event.target.value)}
              placeholder="Example: computer science, nursing, agriculture"
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={isBusy}>
              {status === 'suggesting' ? 'Suggesting courses...' : 'Suggest related courses'}
            </button>
            <button className="ghost-button" type="button" onClick={handleResearch} disabled={isBusy}>
              {status === 'researching' ? 'Scraping university data...' : 'Scrape public universities'}
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
        </form>

        <aside className="suggestions-card" aria-labelledby="suggestions-title">
          <div className="section-heading compact">
            <p className="eyebrow">Gemini suggestions</p>
            <h2 id="suggestions-title">Choose a course focus</h2>
          </div>

          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <button
                className={`suggestion-item ${courseFocus === suggestion.name ? 'active' : ''}`}
                key={suggestion.name}
                type="button"
                onClick={() => setCourseFocus(suggestion.name)}
              >
                <span>{suggestion.name}</span>
                <small>{suggestion.level}</small>
                <p>{suggestion.why}</p>
              </button>
            ))}
          </div>

          <label className="manual-focus">
            Or edit course focus manually
            <input
              value={courseFocus}
              onChange={(event) => setCourseFocus(event.target.value)}
              placeholder="Example: BS Artificial Intelligence"
            />
          </label>
        </aside>
      </section>

      <section className="results-section" id="results" aria-labelledby="results-title">
        <div className="results-header">
          <div>
            <p className="eyebrow">Scraped output</p>
            <h2 id="results-title">Public university course data</h2>
            <p>{research.summary || 'Run the scraper to populate verified university rows.'}</p>
          </div>
          <button className="ghost-button" type="button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>

        <div className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        {research.universities.length ? (
          <>
            <div className="mobile-result-list">
              {research.universities.map((row, index) => (
                <article className="result-card" key={`${row.university}-${row.courseName}-${index}`}>
                  <div>
                    <h3>{row.university}</h3>
                    <span className={`confidence ${row.confidence?.toLowerCase() || 'unknown'}`}>
                      {row.confidence || 'Unknown'} confidence
                    </span>
                  </div>
                  <dl>
                    <dt>Course</dt>
                    <dd>{row.courseName || 'Not published'}</dd>
                    <dt>Medium</dt>
                    <dd>{row.mediumOfInstruction || 'Not published'}</dd>
                    <dt>Admission opening</dt>
                    <dd>{row.admissionOpeningDate || 'Not published'}</dd>
                    <dt>Application fee</dt>
                    <dd>{row.applicationFee || 'Not published'}</dd>
                    <dt>University fee</dt>
                    <dd>{row.universityFee || 'Not published'}</dd>
                  </dl>
                  {row.officialUrl && (
                    <a href={row.officialUrl} target="_blank" rel="noreferrer">
                      Open official source
                    </a>
                  )}
                </article>
              ))}
            </div>

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
                    <th>Source</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {research.universities.map((row, index) => (
                    <tr key={`${row.university}-${row.courseName}-${index}`}>
                      <td>
                        <strong>{row.university}</strong>
                        <span>{row.city || row.publicSectorStatus}</span>
                      </td>
                      <td>
                        {row.courseName || 'Not published'}
                        <span>{row.degreeLevel || row.sourceNote}</span>
                      </td>
                      <td>{row.mediumOfInstruction || 'Not published'}</td>
                      <td>{row.admissionOpeningDate || 'Not published'}</td>
                      <td>{row.applicationFee || 'Not published'}</td>
                      <td>{row.universityFee || 'Not published'}</td>
                      <td>
                        {row.officialUrl ? (
                          <a href={row.officialUrl} target="_blank" rel="noreferrer">
                            Official page
                          </a>
                        ) : (
                          'Not published'
                        )}
                      </td>
                      <td>
                        <span className={`confidence ${row.confidence?.toLowerCase() || 'unknown'}`}>
                          {row.confidence || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span>UP</span>
            <h3>No scraped data yet</h3>
            <p>
              Generate course suggestions, choose your focus, then scrape public sector university
              information for the selected country.
            </p>
          </div>
        )}

        {(research.caveats.length > 0 || sources.length > 0) && (
          <div className="verification-panel">
            {research.caveats.length > 0 && (
              <div>
                <h3>Verification caveats</h3>
                <ul>
                  {research.caveats.map((caveat) => (
                    <li key={caveat}>{caveat}</li>
                  ))}
                </ul>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                <h3>Grounding sources</h3>
                <ul>
                  {sources.slice(0, 10).map((source) => (
                    <li key={source.uri}>
                      <a href={source.uri} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
