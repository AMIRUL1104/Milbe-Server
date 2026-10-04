import { translateToEnglish } from "../../services/translation/translation.service.js";

const slugifyEnglish = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "book-listing";

/**
 * Generates the base slug for a post from its title source (an already
 * derived title, or the concatenated book names). No ID is appended.
 */
export const generatePostSlug = async (source: string): Promise<string> => {
  const translated = await translateToEnglish(source.trim());
  return slugifyEnglish(translated);
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
