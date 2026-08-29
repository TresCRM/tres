import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/packages/widget/src'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['ts', 'js'],
  setupFiles: ['dotenv/config'],
  setupFilesAfterEnv: ['<rootDir>/apps/api/src/tests/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  collectCoverageFrom: [
    'apps/api/src/**/*.{ts,js}',
    '!apps/api/src/**/__tests__/**',
    '!apps/api/src/**/docs/**',
    "apps/api/src/**/*.{ts,tsx}",
    "!apps/api/src/routes/tests/**",
    "!apps/api/src/docs/**",
    "!apps/api/src/**/types/**",
    "!**/*.d.ts",
    "!**/index.ts",
    "!**/app.ts",
    // Process entrypoint: wires app.ts + listeners, exercised end-to-end, not by unit tests.
    "!apps/api/src/server.ts",
    // One-shot operational code (CLI helpers, DB migrations, static seed content).
    // Not application logic; including it only skews the denominator.
    "!apps/api/src/scripts/**",
    "!apps/api/src/seeds/**",
    "!apps/api/src/migrations/**",
    "!apps/api/src/utils/migrations/**",
    // Seed CLIs that happen to live under utils/ (each ends in run().catch(process.exit)).
    // Note: utils/sla-assign.ts is real logic and stays in the denominator.
    "!apps/api/src/utils/seed.ts",
    "!apps/api/src/utils/seed-demo.ts",
    "!apps/api/src/utils/seed-survey-template.ts",
    // The embeddable widget runs on customer pages; keep it measured.
    "packages/widget/src/**/*.ts",
    "!packages/widget/src/**/*.test.ts"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "apps/api/src/docs/",
    "apps/api/src/events/", 
  ],
  // Ratchet: set just under what CI actually measures, so coverage can only go
  // up. Headroom is deliberately under ~1% — new code is expected to arrive
  // with its own tests rather than spend the slack left by existing tests.
  // Measure against a CI-like environment (no .env) before raising these:
  // several modules are gated on optional credentials and report higher
  // coverage on a machine that has them.
  coverageThreshold: {
    global: { branches: 46, functions: 70, lines: 72, statements: 69 }
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
export default config;
