import { env } from "../../config/env.js";
import { myMemoryProvider } from "./providers/mymemory.provider.js";
import type {
  TranslationLanguage,
  TranslationProvider,
  TranslationProviderId,
} from "./translation.types.js";

/** Bengali Unicode block (U+0980–U+09FF); text outside it needs no translation. */
const BENGALI_PATTERN = /[\u0980-\u09FF]/u;

const providers: Record<TranslationProviderId, TranslationProvider> = {
  mymemory: myMemoryProvider,
};

/**
 * Translates text between Bengali and English using the configured provider.
 */
export const translateBetweenLanguages = async (
  text: string,
  sourceLanguage: TranslationLanguage,
  targetLanguage: TranslationLanguage,
): Promise<string> => {
  if (sourceLanguage === targetLanguage || !text.trim()) {
    return text;
  }

  return providers[env.TRANSLATION_PROVIDER].translate(
    text,
    sourceLanguage,
    targetLanguage,
  );
};

export const containsBengali = (text: string): boolean =>
  BENGALI_PATTERN.test(text);

/**
 * Translates text for generated metadata; on provider failure it retains the
 * original value so saving a post and indexing its source text can continue.
 */
export const translateBetweenLanguagesOrOriginal = async (
  text: string,
  sourceLanguage: TranslationLanguage,
  targetLanguage: TranslationLanguage,
): Promise<string> => {
  try {
    return await translateBetweenLanguages(text, sourceLanguage, targetLanguage);
  } catch (error) {
    console.warn(
      `Translation failed (${sourceLanguage}|${targetLanguage}); retaining the original text.`,
      error,
    );
    return text;
  }
};

/**
 * Retained for existing callers that need only a Bengali-to-English value.
 */
export const translateToEnglish = async (text: string): Promise<string> => {
  if (!containsBengali(text)) {
    return text;
  }

  return translateBetweenLanguages(text, "bn", "en");
};

/**
 * Translation is an enhancement for generated metadata, not a prerequisite
 * for saving user content. Keep the original text when a provider is
 * unavailable so post creation and editing can still complete.
 */
export const translateToEnglishOrOriginal = async (
  text: string,
): Promise<string> => {
  if (!containsBengali(text)) return text;
  return translateBetweenLanguagesOrOriginal(text, "bn", "en");
};