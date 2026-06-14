export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 12000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent":
          "UpimeCourseResearchBot/1.0 (+https://example.local; educational research)",
        accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}
