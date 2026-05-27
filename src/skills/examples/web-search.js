/**
 * Colors Example Skill: web-search
 *
 * Demonstrates the Colors skill contract.
 * Skills receive input via stdin as JSON and write output to stdout as JSON.
 * They must exit cleanly — no hanging processes.
 *
 * Manifest (register this in your colors config):
 * {
 *   name: "web-search",
 *   version: "1.0.0",
 *   entrypoint: "/path/to/web-search.js",
 *   expectedHash: "<sha256 of this file>",
 *   requiresNetwork: true,     <-- must be explicitly granted per session
 *   requiredEnvVars: [],
 *   timeout: 15000
 * }
 *
 * Usage after registering:
 *   The agent will call this when it needs to search the web.
 *   You will be asked to grant network access for the session.
 */

// Skills must work as plain Node.js (no TypeScript compilation step)
// This is intentional — skills should be auditable at a glance.

let inputData = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { inputData += chunk; });

process.stdin.on("end", async () => {
  let executionId = "unknown";

  try {
    const { input, networkGranted, executionId: id } = JSON.parse(inputData);
    executionId = id;

    if (!networkGranted) {
      writeResult(executionId, { error: "Network access not granted" });
      return;
    }

    const query = input?.query;
    if (!query || typeof query !== "string") {
      writeResult(executionId, { error: "query is required" });
      return;
    }

    // Use DuckDuckGo Lite — no API key, no tracking, simple HTML
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "colors-agent/0.1" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      writeResult(executionId, { error: `HTTP ${response.status}` });
      return;
    }

    const html = await response.text();

    // Extract result links and snippets from DuckDuckGo Lite HTML
    const results = extractResults(html).slice(0, 5);

    writeResult(executionId, { results, query, networkCallsMade: 1 });
  } catch (err) {
    writeResult(executionId, { error: err.message });
  }
});

function extractResults(html) {
  const results = [];
  // DuckDuckGo Lite uses simple table structure
  const linkRegex = /class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)</g;
  const snippetRegex = /class="result-snippet"[^>]*>([^<]+)</g;

  const links = [...html.matchAll(linkRegex)];
  const snippets = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < Math.min(links.length, 5); i++) {
    results.push({
      url: links[i][1],
      title: links[i][2].trim(),
      snippet: snippets[i]?.[1]?.trim() || "",
    });
  }

  return results;
}

function writeResult(executionId, output) {
  process.stdout.write(JSON.stringify({ executionId, output, networkCallsMade: output.networkCallsMade || 0 }));
  process.exit(0);
}
