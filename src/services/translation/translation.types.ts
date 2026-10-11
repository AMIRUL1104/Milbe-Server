/**
 * Identifiers for the translation providers available in the application.
 * Extend this union when adding a new provider, and register the provider in
 * `translation.service.ts`.
 */
export type TranslationProviderId = "mymemory";
export type TranslationLanguage = "bn" | "en";

/**
 * Translation providers must throw on failures so callers can decide how to
 * handle translation errors.
 */
export interface TranslationProvider {
  readonly id: TranslationProviderId;
  translate(
    text: string,
    sourceLanguage: TranslationLanguage,
    targetLanguage: TranslationLanguage,
  ): Promise<string>;
}