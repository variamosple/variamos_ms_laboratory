module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  // *.db.test.ts need PostgreSQL: npm run test:db
  testPathIgnorePatterns: ["\\.db\\.test\\.ts$"],
  clearMocks: true,
};
