# Upime

Upime is a Vite + React web application for researching public sector university
courses. A student enters a country, degree interest, and their own Gemini API
key. The app asks Gemini to suggest related courses first, then uses a grounded
research prompt to return structured public-university course data.

## What it does

- Accepts a Gemini API key from the user in the browser.
- Suggests degree-related course/program options before scraping.
- Researches public sector universities for the selected country and course.
- Displays medium of instruction, admission opening date, application fee,
  university/tuition fee, official source URL, source notes, and confidence.
- Shows results as mobile-friendly cards and a desktop table.
- Exports scraped rows to CSV.
- Uses a green, black, and white responsive interface.

## Privacy note

The Gemini API key is kept only in React state for the current browser session.
It is not stored in local storage, cookies, or this repository.

## Data accuracy note

University websites change frequently and some admissions or fee pages may not
publish all fields. Upime asks Gemini to use official sources where possible and
to mark unavailable values as `Not published`, but users should verify critical
admission and fee details on the linked official university pages before applying.

## Run locally

```bash
npm install
npm start
```

Open <http://localhost:3000/>.

## Test and build

```bash
npm test -- --run
npm run build
```

## Using the app

1. Paste your Gemini API key.
2. Enter the country to search.
3. Enter your degree or study interest.
4. Click **Suggest related courses**.
5. Pick or manually edit the course focus.
6. Click **Scrape public universities**.
7. Review caveats, source links, and confidence before exporting CSV.

## Gemini model

The default model is `gemini-2.0-flash`. You can edit the model field in the UI
if your Gemini account supports another model.
