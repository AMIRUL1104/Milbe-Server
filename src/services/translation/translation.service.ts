import { env } from "../../config/env.js";
import { myMemoryProvider } from "./providers/mymemory.provider.js";
import type {
  TranslationProvider,
  TranslationProviderId,
} from "./translation.types.js";

/** Bengali Unicode block (U+0980–U+09FF); text outside it needs no translation. */
const BENGALI_PATTERN = /[\u0980-\u09FF]/u;

const providers: Record<TranslationProviderId, TranslationProvider> = {
  mymemory: myMemoryProvider,
};

/**
 * Translates the given text to English using the provider configured via
 * `TRANSLATION_PROVIDER`. Text without any Bengali characters is returned
 * unchanged, so already-English input never triggers a provider call.
 */
export const translateToEnglish = async (text: string): Promise<string> => {
  if (!BENGALI_PATTERN.test(text)) {
    return text;
  }

  return providers[env.TRANSLATION_PROVIDER].translate(text);
};