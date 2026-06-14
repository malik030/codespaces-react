# UPIME

UPIME is a web-based public university course discovery app. A student enters a
country, degree interest, and their own Gemini API key. The app then:

1. suggests degree-related course/program areas with Gemini;
2. lets the student choose the course areas to search;
3. asks Gemini to gather structured public-sector university course data; and
4. displays medium of instruction, admission opening date, application fee,
   tuition/university fee, confidence, and source links in a readable table.

The interface uses a green, black, and white theme and is designed as a guided
three-step workflow.

## Gemini API key

The app asks the user to paste a Gemini API key in the browser. The key is used
only for the current browser session and is not stored by this app.

For production deployments, route Gemini requests through a backend service so
visitor API keys are not exposed in browser network requests.

## Scraping and data quality

UPIME uses Gemini's public web/search capabilities where available and asks for
official university, admissions, prospectus, or regulator sources. Public
university websites differ widely, so missing dates or fees are shown as
`Not published` instead of being guessed.

Students should verify critical deadlines, fees, and eligibility requirements on
the linked official source before applying.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in development mode.

Open [http://localhost:3000/](http://localhost:3000/) in a browser to view it.
The page reloads automatically when you make changes.

### `npm test`

Launches the Vitest test runner.

### `npm run build`

Builds the app for production.
