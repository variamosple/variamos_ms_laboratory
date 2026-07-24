export interface Replacements {
  [key: string]: any;
}

export abstract class BaseRepository {
  initilizeReplacements(filter: Replacements) {
    if (!filter) {
      return {};
    }

    return Object.entries(filter).reduce<Replacements>(
      (result, [key, value]) => {
        result[key] = value === undefined ? null : value;

        return result;
      },
      {}
    );
  }
}
