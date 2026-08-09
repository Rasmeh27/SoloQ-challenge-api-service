/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '\\.spec\\.ts$',
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/scripts/**',
    '!src/**/dto/**',
  ],
  coverageDirectory: 'coverage',
  // The domain and its policies carry the challenge rules: they are held to a higher bar
  // than wiring code, which is covered by the e2e suite instead.
  coverageThreshold: {
    global: { statements: 60, branches: 55, functions: 60, lines: 60 },
    './src/modules/challenge/domain/': {
      statements: 90,
      branches: 90,
      functions: 85,
      lines: 90,
    },
    './src/modules/matches/domain/': { statements: 95, branches: 90, functions: 95, lines: 95 },
    './src/modules/leaderboard/domain/': {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    './src/modules/synchronization/domain/': {
      statements: 90,
      branches: 80,
      functions: 90,
      lines: 90,
    },
    './src/modules/participants/domain/': {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
    './src/modules/riot/infrastructure/mappers/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
  clearMocks: true,
};
