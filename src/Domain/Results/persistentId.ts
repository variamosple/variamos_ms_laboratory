import { randomBytes } from "crypto";

/**
 * LAB-RP-03: the persistent identifier of a completed run, to cite it:
 * VLAB-XXXX-XXXX-XXXX-XXXY, 75 random bits in Crockford base 32 (no I, L, O, U)
 * and a check character Y that catches a mistyped or swapped character.
 * A DOI, if the group chooses one (decision Q4), would point to the same run.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Crockford's check symbols: the alphabet and *~$=U, for a sum modulo 37. */
const CHECK = ALPHABET + "*~$=U";
const PATTERN = /^VLAB-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{3})([0-9A-HJKMNP-TV-Z*~$=U])$/;

const checkCharacter = (body: string) => {
  // body is base 32: its value modulo 37, digit by digit
  const remainder = [...body].reduce((sum, char) => (sum * 32 + ALPHABET.indexOf(char)) % 37, 0);
  return CHECK[remainder];
};

export function newPersistentId(): string {
  // 5 random bits per character: 256 is a multiple of 32, so each character is uniform
  const body = [...randomBytes(15)].map((byte) => ALPHABET[byte & 31]).join("");
  const id = body + checkCharacter(body);
  return `VLAB-${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}-${id.slice(12)}`;
}

/** Well formed, with a matching check character. */
export function isPersistentId(value: string): boolean {
  const match = PATTERN.exec(value);
  if (!match) return false;
  const body = match.slice(1, 5).join("");
  return checkCharacter(body) === match[5];
}
