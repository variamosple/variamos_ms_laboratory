import { choice, DEFAULT_CORS_ORIGINS, origins, setting } from "./Config";

// A setting is read once at start: a wrong value stops the service instead of being guessed
describe("settings", () => {
  const NAME = "LAB_TEST_SETTING";
  afterEach(() => {
    delete process.env[NAME];
  });

  test("a number takes its default when unset, and refuses what is not a number above its minimum", () => {
    expect(setting(NAME, 4, 1)).toBe(4);
    process.env[NAME] = "8";
    expect(setting(NAME, 4, 1)).toBe(8);
    process.env[NAME] = "0";
    expect(() => setting(NAME, 4, 1)).toThrow(`${NAME} must be a number of at least 1, not "0".`);
    process.env[NAME] = "four";
    expect(() => setting(NAME, 4, 1)).toThrow(/not "four"/);
  });

  test("a gateway is one of the implementations that exist, and says why the others do not", () => {
    expect(choice(NAME, "mock", ["mock"] as const)).toBe("mock");
    process.env[NAME] = "mock";
    expect(choice(NAME, "mock", ["mock"] as const)).toBe("mock");
    process.env[NAME] = "http";
    expect(() => choice(NAME, "mock", ["mock"] as const, "The real gateway waits for the Reasoning API (roadmap Q5)."))
      .toThrow(`${NAME} must be one of: mock, not "http". The real gateway waits for the Reasoning API (roadmap Q5).`);
  });
});

// The origins allowed to call the service with the session cookie
describe("origins", () => {
  const NAME = "LAB_TEST_ORIGINS";
  afterEach(() => {
    delete process.env[NAME];
  });

  test("the platform and the local servers of the interface when unset or empty", () => {
    expect(origins(NAME, DEFAULT_CORS_ORIGINS)).toEqual([...DEFAULT_CORS_ORIGINS]);
    process.env[NAME] = " ";
    expect(origins(NAME, DEFAULT_CORS_ORIGINS)).toEqual([...DEFAULT_CORS_ORIGINS]);
    expect(DEFAULT_CORS_ORIGINS).toContain("https://app.variamos.com");
  });

  test("a comma separated list replaces the default", () => {
    process.env[NAME] = "https://app.variamos.com, http://127.0.0.1:4173,";
    expect(origins(NAME, DEFAULT_CORS_ORIGINS)).toEqual(["https://app.variamos.com", "http://127.0.0.1:4173"]);
  });

  test("refuses what is not an origin, such as an address with a path", () => {
    process.env[NAME] = "https://app.variamos.com/variamos_laboratory/";
    expect(() => origins(NAME, DEFAULT_CORS_ORIGINS))
      .toThrow(`${NAME} must list origins such as https://app.variamos.com, not "https://app.variamos.com/variamos_laboratory/".`);
    process.env[NAME] = "app.variamos.com";
    expect(() => origins(NAME, DEFAULT_CORS_ORIGINS)).toThrow(/not "app.variamos.com"/);
  });
});
