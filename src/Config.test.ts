import { choice, setting } from "./Config";

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
