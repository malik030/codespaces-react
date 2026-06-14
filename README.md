# UPIME

UPIME is a React/Vite web application for students who want to discover public sector university programs by starting with one degree idea.

The app uses the user's Gemini API key in the browser to:

1. Suggest related course and program names for the degree.
2. Research public sector university admission sources for a selected country.
3. Normalize scraped/admissions data into a readable comparison table.
4. Export filtered results to CSV.

## Data fields

UPIME asks Gemini to prioritize official public university websites, official admission portals, prospectuses, and government higher education sources. Each row includes:

- University name and public sector status
- Course/program name and degree level
- Medium of instruction
- Admission opening date and intake/deadline
- Application fee
- University/tuition fee
- Official source link
- Confidence and verification notes

Admissions dates and fees change often. Always verify important fields from the linked official source before applying.

## Gemini API key

The app asks the user to paste a Gemini API key. The key is only kept in React state for the current browser session and is not saved to local storage or committed into the project.

## Available scripts

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm start
```

Run tests:

```bash
npm test -- --run
```

Build for production:

```bash
npm run build
```

## Tech stack

- React 18
- Vite
- Vitest
- Gemini REST API
