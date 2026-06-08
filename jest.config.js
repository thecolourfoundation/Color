module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts"],

  // Raised from 60/70/70/70 — security-sensitive code needs higher coverage.
  // sandbox/, tools/, and consciousness/ are the highest-risk areas.
  coverageThreshold: {
    global: {
      branches:   80,
      functions:  85,
      lines:      85,
      statements: 85,
    },
    // Per-directory overrides: critical security paths get stricter thresholds
    "./src/sandbox/": {
      branches:   90,
      functions:  95,
      lines:      95,
      statements: 95,
    },
    "./src/tools/": {
      branches:   90,
      functions:  95,
      lines:      95,
      statements: 95,
    },
  },

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        // FIX #6 reinforcement: ts-jest will surface type errors during tests.
        // This catches type errors even if someone runs jest directly
        // without going through `npm test` (which runs typecheck first).
        diagnostics: {
          warnOnly: false,       // type errors = test failure, not just a warning
          ignoreCodes: [],       // suppress nothing
        },
      },
    ],
  },
};
