import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_OPTIONS,
  CATEGORY_VALUES,
  normalizeCategory,
  isCategoryValue,
} from "../../constants/categories.js";
import {
  DISTRICT_OPTIONS,
  DISTRICT_VALUES,
  DEFAULT_DISTRICT,
  normalizeDistrict,
} from "../../constants/districts.js";
import { createPostSchema, updatePostSchema } from "./post.validation.js";

// bookbridge-server/src/modules/post → repo root (folders dir).
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** Extract ordered `value: "..."` entries from the frontend constants file. */
const readFrontendValues = (file: string): string[] => {
  const src = readFileSync(
    path.join(rootDir, "bookbridge/src/lib/constant", file),
    "utf8",
  );
  const values: string[] = [];
  const regex = /value: "([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(src)) !== null) {
    values.push(match[1]!);
  }
  return values;
};

test("category values stay in sync with the frontend list (order included)", () => {
  assert.deepEqual(readFrontendValues("categories.ts"), [...CATEGORY_VALUES]);
  assert.equal(CATEGORY_VALUES.length, 15);
  assert.ok(isCategoryValue("hsc-humanities"));
  assert.equal(isCategoryValue("Science"), false);
});

test("district values stay in sync with the frontend; Sylhet first; 64 total", () => {
  assert.deepEqual(readFrontendValues("districts.ts"), [...DISTRICT_VALUES]);
  assert.equal(DISTRICT_VALUES.length, 64);
  assert.equal(DISTRICT_VALUES[0], "Sylhet");
  assert.equal(DEFAULT_DISTRICT, "Sylhet");
  assert.equal(DISTRICT_OPTIONS.length, 64);
  assert.equal(CATEGORY_OPTIONS.length, 15);
});

test("category normalization maps case/aliases; legacy values stay unmapped", () => {
  assert.equal(normalizeCategory("SSC-SCIENCE"), "ssc-science");
  assert.equal(normalizeCategory("Others"), "others");
  assert.equal(normalizeCategory("University"), "university");
  assert.equal(normalizeCategory("এসএসসি মানবিক"), "ssc-humanities");
  assert.equal(normalizeCategory("এইচএসসি বিজ্ঞান"), "hsc-science");
  // Subject-era values are ambiguous — never auto-mapped (kept by migration).
  assert.equal(normalizeCategory("Science"), null);
  assert.equal(normalizeCategory(""), null);
  assert.equal(normalizeCategory(42), null);
});

test("district normalization maps aliases + Bengali labels; unknown kept null", () => {
  assert.equal(normalizeDistrict("comilla"), "Cumilla");
  assert.equal(normalizeDistrict("sylhet"), "Sylhet");
  assert.equal(normalizeDistrict("ঢাকা"), "Dhaka");
  assert.equal(normalizeDistrict("Cox Bazar"), null);
  assert.equal(normalizeDistrict("Syleht"), null);
});

test("create accepts canonical + normalized values; legacy/unknown rejected", () => {
  const body = (overrides: Record<string, unknown> = {}) => ({
    title: "Sample",
    category: "ssc-science",
    type: "sell",
    images: [
      {
        url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        assetId: "507f1f77bcf86cd799439011",
      },
    ],
    totalPrice: 0,
    overallCondition: "good",
    district: "Sylhet",
    area: "Ambarkhana",
    phone: "01700000000",
    books: [],
    ...overrides,
  });

  assert.equal(createPostSchema.safeParse({ body: body() }).success, true);
  // Bengali labels + aliases normalize into canonical values.
  assert.equal(
    createPostSchema.safeParse({
      body: body({ category: "এসএসসি বাণিজ্য", district: "comilla" }),
    }).success,
    true,
  );
  // Legacy category and unknown district are rejected on create.
  assert.equal(
    createPostSchema.safeParse({ body: body({ category: "Science" }) }).success,
    false,
  );
  assert.equal(
    createPostSchema.safeParse({ body: body({ district: "Syleht" }) }).success,
    false,
  );
});

test("update stays lenient for legacy posts; known values normalize", () => {
  const parse = (patch: Record<string, unknown>) =>
    updatePostSchema.safeParse({
      body: patch,
      params: { id: "post-id" },
    });

  // Old posts keep their legacy category/unknown district — still editable.
  assert.equal(parse({ category: "Science" }).success, true);
  const unknownDistrict = parse({ district: "Syleht" });
  assert.equal(unknownDistrict.success, true);
  // Known aliases/case normalize to the canonical value.
  const comilla = parse({ district: "comilla" });
  assert.equal(comilla.success, true);
  if (comilla.success) assert.equal(comilla.data.body.district, "Cumilla");
});
