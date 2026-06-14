# Upime

Upime is a web application for researching public-sector university courses by
country and degree interest. It uses a user-provided Gemini API key to suggest
related course names, scans public university sources, and displays course,
medium of instruction, admission date, application fee, and university fee data
in a clean green, black, and white interface.

## Features

- User enters their own Gemini API key at scan time.
- Gemini suggests degree-related programs and keywords.
- Server-side discovery uses Wikidata and the Hipo university domains API.
- Server-side scraper scans official university pages and relevant admissions,
  fee, program, prospectus, and department links.
- Gemini extracts structured records from the scraped public text.
- Heuristic fallback records are shown when public pages are incomplete.
- Search, confidence filtering, result cards, a full data table, and CSV export.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build and checks

```bash
npm run typecheck
npm run lint
npm run build
```

## How to use

1. Get a Gemini API key from Google AI Studio.
2. Paste the key into the Upime form.
3. Enter a degree interest, for example `BS Computer Science`.
4. Enter a country name in English, for example `Pakistan`.
5. Choose how many universities to scan.
6. Review the extracted results and open the source links before applying.

## Important limitations

Public university data is not standardized globally. Some countries do not mark
public/private status in machine-readable indexes, and many university websites
publish fees or admission dates as PDFs, images, or dynamic pages. Upime keeps
source links, confidence levels, warnings, and "Not found on scanned public
pages" values visible so users can verify official pages.

For production use, consider adding:

- A country-specific verified public-sector university registry.
- PDF parsing for prospectuses and fee challans.
- Background jobs for large country-wide scans.
- Cached scrape history and duplicate detection.
- Robots.txt policy checks and rate limiting per domain.

## Gemini key handling

The API key is provided by the user in the browser form and sent only for the
current `/api/scrape` request. The app does not store it in local storage,
cookies, environment files, logs, or a database.
