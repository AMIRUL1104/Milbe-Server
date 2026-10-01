import { env } from "../../config/env.js";
import { v2 } from "@google-cloud/translate";
import type { PostBook } from "./post.types.js";

const translationClient = new v2.Translate(
  env.GOOGLE_TRANSLATE_API_KEY ? { key: env.GOOGLE_TRANSLATE_API_KEY } : {},
);

const translateBengaliToEnglish = async (value: string): Promise<string> => {
  if (!/[\u0980-\u09FF]/u.test(value)) {
    return value;
  }

  if (!env.GOOGLE_TRANSLATE_API_KEY) {
    throw new Error("Google Cloud Translation is not configured.");
  }

  const [translatedText] = await translationClient.translate(value, "en");
  if (!translatedText) {
    throw new Error("Google Cloud Translation returned no translated text.");
  }

  return translatedText;
};

const slugifyEnglish = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "book-listing";

export const generatePostSlug = async (
  title: string | undefined,
  books: Pick<PostBook, "bookName">[],
  postId: string,
): Promise<string> => {
  const source = title?.trim() || books.map((book) => book.bookName.trim()).filter(Boolean).join(" ");
  const translated = await translateBengaliToEnglish(source);
  return `${slugifyEnglish(translated)}-${postId}`;
};