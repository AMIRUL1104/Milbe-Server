const MYMEMORY_ENDPOINT = process.env.MYMEMORY_ENDPOINT || "";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "";
const MAX_QUERY_BYTES = 500;
const MAX_CHUNK_BYTES = 400;
const MIN_CHUNK_BYTES = 300;
const utf8Encoder = new TextEncoder();

type MyMemoryResponse = {
  responseStatus?: number;
  responseData?: { translatedText?: unknown };
};

const splitIntoChunks = (value: string): string[] => {
  let remaining = value;
  let remainingBytes = utf8Encoder.encode(remaining).length;
  const chunks: string[] = [];

  while (remainingBytes > MAX_QUERY_BYTES) {
    let bytes = 0;
    let codeUnits = 0;
    let preferredCodeUnits = 0;
    let preferredBytes = 0;

    for (const character of remaining) {
      const characterBytes = utf8Encoder.encode(character).length;
      if (bytes + characterBytes > MAX_CHUNK_BYTES) break;

      bytes += characterBytes;
      codeUnits += character.length;
      if (bytes >= MIN_CHUNK_BYTES && /[\s\p{P}]/u.test(character)) {
        preferredCodeUnits = codeUnits;
        preferredBytes = bytes;
      }
    }

    const splitAt = preferredCodeUnits || codeUnits;
    const splitBytes = preferredBytes || bytes;
    if (!splitAt) throw new Error("Unable to split translation text safely.");

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
    remainingBytes -= splitBytes;
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

const translateChunk = async (value: string): Promise<string> => {
  const url = new URL(MYMEMORY_ENDPOINT);
  url.searchParams.set("q", value);
  url.searchParams.set("langpair", "bn|en");
  url.searchParams.set("de", MYMEMORY_EMAIL);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory request failed with status ${response.status}.`);
  }

  const result = (await response.json()) as MyMemoryResponse;
  const translatedText = result.responseData?.translatedText;
  if (
    result.responseStatus !== 200 ||
    typeof translatedText !== "string" ||
    !translatedText.trim()
  ) {
    throw new Error("MyMemory returned an invalid translation.");
  }

  return translatedText;
};

const translateBengaliToEnglish = async (value: string): Promise<string> => {
  if (!/[\u0980-\u09FF]/u.test(value)) {
    return value;
  }

  const chunks = splitIntoChunks(value);
  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk));
  }
  return translatedChunks.join(" ");
};

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
  const translated = await translateBengaliToEnglish(source.trim());
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
