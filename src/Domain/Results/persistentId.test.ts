import { isPersistentId, newPersistentId } from "./persistentId";

describe("persistent run identifier (LAB-RP-03)", () => {
  test("format: VLAB- and four groups, valid check character", () => {
    const id = newPersistentId();
    expect(id).toMatch(/^VLAB-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z*~$=]{4}$/);
    expect(isPersistentId(id)).toBe(true);
  });

  test("unique over 100 000 draws", () => {
    const ids = new Set(Array.from({ length: 100_000 }, newPersistentId));
    expect(ids.size).toBe(100_000);
  });

  test("a mistyped or swapped character is detected", () => {
    for (let i = 0; i < 200; i++) {
      const id = newPersistentId();
      const chars = [...id.replace(/^VLAB-/, "")];
      const position = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17][i % 15];
      const changed = [...chars];
      changed[position] = changed[position] === "0" ? "1" : "0";
      expect(isPersistentId(`VLAB-${changed.join("")}`)).toBe(false);

      const next = position + 1 < chars.length && chars[position + 1] !== "-" ? position + 1 : position - 1;
      if (chars[position] !== chars[next] && chars[next] !== "-") {
        const swapped = [...chars];
        [swapped[position], swapped[next]] = [swapped[next], swapped[position]];
        expect(isPersistentId(`VLAB-${swapped.join("")}`)).toBe(false);
      }
    }
  });

  test("letters that look like digits are not used", () => {
    expect(isPersistentId("VLAB-IIII-LLLL-OOOO-UUUU")).toBe(false);
    expect(isPersistentId("vlab-0000-0000-0000-0000")).toBe(false);
  });
});
