import { banglaToBanglish } from "bangla-to-banglish";
import {
  containsBengali,
  translateBetweenLanguagesOrOriginal,
} from "../../services/translation/translation.service.js";
import type { PostBook } from "./post.types.js";

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
  searchKeywords: string[];
}

/**
 * Builds normalized search variants for the post title and each book's
 * name, author, and publisher. Original text is retained if translation fails.
 */
export const generatePostSearchData = async (
  titleSource: string,
  books: PostBook[],
): Promise<GeneratedPostSearchData> => {
  const sourceTexts = [
    ...new Set(
      [
        titleSource,
        ...books.flatMap((book) => [
          book.bookName ?? book.title ?? book.name ?? "",
          book.author ?? "",
          book.publisherName ?? "",
        ]),
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const translatedTexts = await Promise.all(
    sourceTexts.map((value) =>
      translateBetweenLanguagesOrOriginal(
        value,
        containsBengali(value) ? "bn" : "en",
        containsBengali(value) ? "en" : "bn",
      ),
    ),
  );
  const translations = new Map(
    sourceTexts.map((value, index) => [value, translatedTexts[index] ?? value]),
  );
  const searchKeywords = new Set<string>();

  for (const sourceText of sourceTexts) {
    const translatedText = translations.get(sourceText) ?? sourceText;
    const banglishText = containsBengali(sourceText)
      ? banglaToBanglish(sourceText)
      : containsBengali(translatedText)
        ? banglaToBanglish(translatedText)
        : "";

    for (const value of [sourceText, translatedText, banglishText]) {
      const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
      if (normalized) searchKeywords.add(normalized);
    }
  }

  const slugSource = titleSource.trim();
  const translatedSlugSource = translations.get(slugSource) ?? slugSource;

  return {
    baseSlug: slugifyEnglish(
      containsBengali(slugSource) ? translatedSlugSource : slugSource,
    ),
    searchSlug: [...searchKeywords].join(" "),
    searchKeywords: [...searchKeywords],
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
