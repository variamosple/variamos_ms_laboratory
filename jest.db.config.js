// Integration tests against PostgreSQL: docker compose -f compose.test.yml up -d --wait
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.db.test.ts"],
  setupFiles: ["<rootDir>/test-support/dbEnv.js"],
  clearMocks: true,
};
