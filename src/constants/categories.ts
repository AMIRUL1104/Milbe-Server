/**
 * Centralized post categories — backend mirror of
 * `bookbridge/src/lib/constant/categories.ts`.
 *
 * DB contract: `value` (stable English slug). Keep in sync with frontend
 * (verified by `category-district-sync.test.ts`).
 */
export const CATEGORY_OPTIONS = [
  { value: "class-6-8", labelEn: "Class 6–8", labelBn: "৬ষ্ঠ–৮ম শ্রেণি" },
  { value: "ssc-science", labelEn: "SSC Science", labelBn: "এসএসসি বিজ্ঞান" },
  { value: "ssc-commerce", labelEn: "SSC Commerce", labelBn: "এসএসসি বাণিজ্য" },
  { value: "ssc-humanities", labelEn: "SSC Humanities", labelBn: "এসএসসি মানবিক" },
  { value: "hsc-science", labelEn: "HSC Science", labelBn: "এইচএসসি বিজ্ঞান" },
  { value: "hsc-commerce", labelEn: "HSC Commerce", labelBn: "এইচএসসি বাণিজ্য" },
  { value: "hsc-humanities", labelEn: "HSC Humanities", labelBn: "এইচএসসি মানবিক" },
  { value: "dakhil", labelEn: "Dakhil", labelBn: "দাখিল" },
  { value: "alim", labelEn: "Alim", labelBn: "আলিম" },
  { value: "university-admission", labelEn: "University Admission", labelBn: "বিশ্ববিদ্যালয় ভর্তি" },
  { value: "engineering-admission", labelEn: "Engineering Admission", labelBn: "ইঞ্জিনিয়ারিং ভর্তি" },
  { value: "medical-admission", labelEn: "Medical Admission", labelBn: "মেডিকেল ভর্তি" },
  { value: "university", labelEn: "University", labelBn: "বিশ্ববিদ্যালয়" },
  { value: "job-preparation", labelEn: "Job Preparation", labelBn: "চাকরি প্রস্তুতি" },
  { value: "others", labelEn: "Others", labelBn: "অন্যান্য" },
] as const;

export type CategoryValue = (typeof CATEGORY_OPTIONS)[number]["value"];

export const CATEGORY_VALUES = CATEGORY_OPTIONS.map((c) => c.value) as unknown as readonly [
  CategoryValue,
  ...CategoryValue[],
];

const CATEGORY_BY_VALUE = new Map<string, (typeof CATEGORY_OPTIONS)[number]>(
  CATEGORY_OPTIONS.map((c) => [c.value, c]),
);

/** Normalize legacy/variant category inputs to the canonical value (null = unmappable). */
const LEGACY_CATEGORY_ALIASES: Record<string, CategoryValue | null> = {
  science: null,
  commerce: null,
  arts: null,
  business: null,
  buisness: null,
  engineering: null,
  medical: null,
  admission: null,
  "৬ষ্ঠ–৮ম শ্রেণি": "class-6-8",
  "এসএসসি বিজ্ঞান": "ssc-science",
  "এসএসসি বাণিজ্য": "ssc-commerce",
  "এসএসসি মানবিক": "ssc-humanities",
  "এইচএসসি বিজ্ঞান": "hsc-science",
  "এইচএসসি বাণিজ্য": "hsc-commerce",
  "এইচএসসি মানবিক": "hsc-humanities",
  দাখিল: "dakhil",
  আলিম: "alim",
  "বিশ্ববিদ্যালয় ভর্তি": "university-admission",
  "ইঞ্জিনিয়ারিং ভর্তি": "engineering-admission",
  "মেডিকেল ভর্তি": "medical-admission",
  বিশ্ববিদ্যালয়: "university",
  "চাকরি প্রস্তুতি": "job-preparation",
  অন্যান্য: "others",
};

export function normalizeCategory(input: unknown): CategoryValue | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const direct = CATEGORY_BY_VALUE.get(trimmed);
  if (direct) return direct.value;
  const lower = trimmed.toLowerCase();
  for (const opt of CATEGORY_OPTIONS) {
    if (opt.value.toLowerCase() === lower) return opt.value;
  }
  if (lower in LEGACY_CATEGORY_ALIASES) {
    return LEGACY_CATEGORY_ALIASES[lower] ?? null;
  }
  return null;
}

export function isCategoryValue(input: unknown): input is CategoryValue {
  return typeof input === "string" && CATEGORY_BY_VALUE.has(input);
}
