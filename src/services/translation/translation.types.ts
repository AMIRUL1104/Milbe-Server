/**
 * Identifiers for the translation providers available in the application.
 * Extend this union when adding a new provider, and register the provider in
 * `translation.service.ts`.
 */
export type TranslationProviderId = "mymemory";

/**
 * A translation provider translates text to English. Implementations must
 * throw on any failure (network error, invalid response, ...) so callers can
 * decide how to handle it.
 */
export interface TranslationProvider {
  readonly id: TranslationProviderId;
  translate(text: string): Promise<string>;
}