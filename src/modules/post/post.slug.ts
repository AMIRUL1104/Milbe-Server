import { translateToEnglishOrOriginal } from "../../services/translation/translation.service.js";

export const slugifyEnglish = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "book-listing";

export const derivePostSource = (
  title: string | undefined,
  bookNames: string[],
): string =>
  title?.trim() ||
  bookNames
    .map((bookName) => bookName.trim())
    .filter(Boolean)
    .join(" ");

export interface GeneratedPostSearchData {
  baseSlug: string;
  searchSlug: string;
}

/**
 * Produces URL and search metadata together, reusing each translation once.
 * Original text is always included so a provider failure never removes a
 * searchable variant.
 */
export const generatePostSearchData = async (
  titleSource: string,
  bookNames: string[],
): Promise<GeneratedPostSearchData> => {
  const sourceTexts = [
    ...new Set(
      [titleSource, ...bookNames]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const translatedTexts = await Promise.all(
    sourceTexts.map((value) => translateToEnglishOrOriginal(value)),
  );
  const translations = new Map(
    sourceTexts.map((value, index) => [value, translatedTexts[index] ?? value]),
  );
  const searchVariants = [...new Set([...sourceTexts, ...translatedTexts])];

  return {
    baseSlug: slugifyEnglish(
      translations.get(titleSource.trim()) ?? titleSource,
    ),
    searchSlug: searchVariants.join(" "),
  };
};

/**
 * Resolves a unique slug by appending a counter suffix when the base slug is
 * already taken: `book-name`, `book-name-2`, `book-name-3`, ...
 */
export const resolveUniquePostSlug = async (
  baseSlug: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> => {
  let candidate = baseSlug;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await isTaken(candidate))) return candidate;
    candidate = `${baseSlug}-${attempt + 1}`;
  }

  throw new Error("Unable to resolve a unique post slug.");
};
