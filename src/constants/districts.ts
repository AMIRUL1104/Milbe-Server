/**
 * Centralized districts — backend mirror of
 * `bookbridge/src/lib/constant/districts.ts`.
 *
 * Sylhet FIRST, remaining 63 alphabetical. DB contract: English `value`.
 * Keep in sync with frontend (verified by `category-district-sync.test.ts`).
 */
export const DISTRICT_OPTIONS = [
  { value: "Sylhet", labelBn: "সিলেট" },
  { value: "Bagerhat", labelBn: "বাগেরহাট" },
  { value: "Bandarban", labelBn: "বান্দরবান" },
  { value: "Barguna", labelBn: "বরগুনা" },
  { value: "Barishal", labelBn: "বরিশাল" },
  { value: "Bhola", labelBn: "ভোলা" },
  { value: "Bogura", labelBn: "বগুড়া" },
  { value: "Brahmanbaria", labelBn: "ব্রাহ্মণবাড়িয়া" },
  { value: "Chandpur", labelBn: "চাঁদপুর" },
  { value: "Chapainawabganj", labelBn: "চাঁপাইনবাবগঞ্জ" },
  { value: "Chattogram", labelBn: "চট্টগ্রাম" },
  { value: "Chuadanga", labelBn: "চুয়াডাঙ্গা" },
  { value: "Cox's Bazar", labelBn: "কক্সবাজার" },
  { value: "Cumilla", labelBn: "কুমিল্লা" },
  { value: "Dhaka", labelBn: "ঢাকা" },
  { value: "Dinajpur", labelBn: "দিনাজপুর" },
  { value: "Faridpur", labelBn: "ফরিদপুর" },
  { value: "Feni", labelBn: "ফেনী" },
  { value: "Gaibandha", labelBn: "গাইবান্ধা" },
  { value: "Gazipur", labelBn: "গাজীপুর" },
  { value: "Gopalganj", labelBn: "গোপালগঞ্জ" },
  { value: "Habiganj", labelBn: "হবিগঞ্জ" },
  { value: "Jamalpur", labelBn: "জামালপুর" },
  { value: "Jashore", labelBn: "যশোর" },
  { value: "Jhalokati", labelBn: "ঝালকাঠি" },
  { value: "Jhenaidah", labelBn: "ঝিনাইদহ" },
  { value: "Joypurhat", labelBn: "জয়পুরহাট" },
  { value: "Khagrachari", labelBn: "খাগড়াছড়ি" },
  { value: "Khulna", labelBn: "খুলনা" },
  { value: "Kishoreganj", labelBn: "কিশোরগঞ্জ" },
  { value: "Kurigram", labelBn: "কুড়িগ্রাম" },
  { value: "Kushtia", labelBn: "কুষ্টিয়া" },
  { value: "Lakshmipur", labelBn: "লক্ষ্মীপুর" },
  { value: "Lalmonirhat", labelBn: "লালমনিরহাট" },
  { value: "Madaripur", labelBn: "মাদারীপুর" },
  { value: "Magura", labelBn: "মাগুরা" },
  { value: "Manikganj", labelBn: "মানিকগঞ্জ" },
  { value: "Meherpur", labelBn: "মেহেরপুর" },
  { value: "Moulvibazar", labelBn: "মৌলভীবাজার" },
  { value: "Munshiganj", labelBn: "মুন্সিগঞ্জ" },
  { value: "Mymensingh", labelBn: "ময়মনসিংহ" },
  { value: "Naogaon", labelBn: "নওগাঁ" },
  { value: "Narail", labelBn: "নড়াইল" },
  { value: "Narayanganj", labelBn: "নারায়ণগঞ্জ" },
  { value: "Narsingdi", labelBn: "নরসিংদী" },
  { value: "Natore", labelBn: "নাটোর" },
  { value: "Netrokona", labelBn: "নেত্রকোণা" },
  { value: "Nilphamari", labelBn: "নীলফামারী" },
  { value: "Noakhali", labelBn: "নোয়াখালী" },
  { value: "Pabna", labelBn: "পাবনা" },
  { value: "Panchagarh", labelBn: "পঞ্চগড়" },
  { value: "Patuakhali", labelBn: "পটুয়াখালী" },
  { value: "Pirojpur", labelBn: "পিরোজপুর" },
  { value: "Rajbari", labelBn: "রাজবাড়ী" },
  { value: "Rajshahi", labelBn: "রাজশাহী" },
  { value: "Rangamati", labelBn: "রাঙামাটি" },
  { value: "Rangpur", labelBn: "রংপুর" },
  { value: "Satkhira", labelBn: "সাতক্ষীরা" },
  { value: "Shariatpur", labelBn: "শরীয়তপুর" },
  { value: "Sherpur", labelBn: "শেরপুর" },
  { value: "Sirajganj", labelBn: "সিরাজগঞ্জ" },
  { value: "Sunamganj", labelBn: "সুনামগঞ্জ" },
  { value: "Tangail", labelBn: "টাঙ্গাইল" },
  { value: "Thakurgaon", labelBn: "ঠাকুরগাঁও" },
] as const;

export type DistrictValue = (typeof DISTRICT_OPTIONS)[number]["value"];

export const DISTRICT_VALUES = DISTRICT_OPTIONS.map((d) => d.value) as unknown as readonly [
  DistrictValue,
  ...DistrictValue[],
];

/** Default district for new posts / launch market. */
export const DEFAULT_DISTRICT: DistrictValue = "Sylhet";

const DISTRICT_BY_VALUE = new Map<string, (typeof DISTRICT_OPTIONS)[number]>(
  DISTRICT_OPTIONS.map((d) => [d.value, d]),
);

const DISTRICT_ALIASES: Record<string, DistrictValue> = {
  comilla: "Cumilla",
  bogra: "Bogura",
  jessore: "Jashore",
  barisal: "Barishal",
  chittagong: "Chattogram",
  "cox'sbazar": "Cox's Bazar",
  "cox-bazar": "Cox's Bazar",
  coxsbazar: "Cox's Bazar",
  sylhet: "Sylhet",
};

export function normalizeDistrict(input: unknown): DistrictValue | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const direct = DISTRICT_BY_VALUE.get(trimmed);
  if (direct) return direct.value;
  const lower = trimmed.toLowerCase();
  if (lower in DISTRICT_ALIASES) return DISTRICT_ALIASES[lower]!;
  for (const opt of DISTRICT_OPTIONS) {
    if (opt.value.toLowerCase() === lower) return opt.value;
    if (opt.labelBn === trimmed) return opt.value;
  }
  return null;
}

export function isDistrictValue(input: unknown): input is DistrictValue {
  return typeof input === "string" && DISTRICT_BY_VALUE.has(input);
}
