module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts"],

  coverageThreshold: {
    global: {
      branches:   50,
      functions:  60,
      lines:      60,
      statements: 60,
    },
  },

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        diagnostics: {
          warnOnly: false,
          ignoreCodes: [],
        },
      },
    ],
  },
};
