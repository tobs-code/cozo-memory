import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.spec.ts",
    "**/*.test.ts",
    "**/*.spec.ts",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        useESM: false,
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  // uuid v13+ is ESM-only, we need to transform it
  transformIgnorePatterns: [
    "node_modules/(?!(uuid)/)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  // Increase timeout for tests that may involve model loading
  testTimeout: 30000,
  // Collect coverage from core modules
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/test-*.ts",
    "!src/benchmark*.ts",
    "!src/eval-suite.ts",
    "!src/cli*.ts",
    "!src/tui*.ts",
  ],
  coverageReporters: ["text", "lcov", "clover"],
  // Verbose output
  verbose: true,
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
};

export default config;