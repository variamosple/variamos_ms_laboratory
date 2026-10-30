// Loaded by jest.db.config.js before any module: points Config at the compose.test.yml database.
process.env.NODE_ENV = "test";
process.env.DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || "55433";
process.env.DB_DATABASE = "laboratory_test";
process.env.DB_USER = "lab_test";
process.env.DB_PASSWORD = "local_test_only";
process.env.DB_SCHEMA = "variamos_laboratory_it";
// The compose.test.yml database has no TLS
process.env.DB_SSL = "false";
