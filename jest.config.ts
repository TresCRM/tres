import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src'],
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
    "!**/app.ts"           
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "apps/api/src/docs/",
    "apps/api/src/events/", 
  ],
  coverageThreshold: {
    global: { branches: 45, functions: 73, lines: 76, statements: 72 }
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
export default config;
