import z from "zod";
import { CATEGORY_VALUES, normalizeCategory } from "../../constants/categories.js";
import { DISTRICT_VALUES, normalizeDistrict } from "../../constants/districts.js";

// Future-proof image limits: model is array-based, but UX/API is locked to 1.
// To enable multi-image later, only change POST_IMAGE_MAX (e.g. 5) + UI.
export const POST_IMAGE_MIN = 1;
export const POST_IMAGE_MAX = 1;

const overallConditionSchema = z.enum(["new", "like_new", "good", "fair"]);

export const postImageSchema = z.object({
  url: z.string().url(),
  assetId: z.string().regex(/^[a-f\d]{24}$/i),
});

const imagesArrayRequired = z
  .array(postImageSchema)
  .min(POST_IMAGE_MIN, `এখন ${POST_IMAGE_MIN}টি ছবি দিন`)
  .max(POST_IMAGE_MAX, `এখন সর্বোচ্চ ${POST_IMAGE_MAX}টি ছবি দেওয়া যাবে`);

const imagesArrayOptional = z
  .array(postImageSchema)
  .min(POST_IMAGE_MIN, `এখন ${POST_IMAGE_MIN}টি ছবি দিন`)
  .max(POST_IMAGE_MAX, `এখন সর্বোচ্চ ${POST_IMAGE_MAX}টি ছবি দেওয়া যাবে`)
  .nullable()
  .optional();

// Keep helper exported for future multi-image reuse/tests.
export const imagesArrayOptionalDeprecated = imagesArrayOptional;

/**
 * Back-compat normalizer: old clients send { image, imageAssetId } without
 * `images`. Derive images[0] from the legacy pair, and mirror images[0]
 * back to legacy fields so service dual-write stays consistent.
 */
const normalizePostImagesInput = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const body = { ...(raw as Record<string, unknown>) };
  let images = body.images;
  if (!Array.isArray(images) && images !== null) {
    const url = body.image;
    const assetId = body.imageAssetId;
    if (typeof url === "string" && typeof assetId === "string") {
      images = [{ url, assetId }];
      body.images = images;
    } else if (url === null && assetId === null) {
      // Legacy removal signal: image:null + asset:null → images:[].
      body.images = [];
      return body;
    } else {
      // No images info — leave key absent so service treats as "untouched".
      delete body.images;
      return body;
    }
  }
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] as { url?: unknown; assetId?: unknown };
    return {
      ...body,
      images,
      image: typeof first?.url === "string" ? first.url : body.image,
      imageAssetId:
        typeof first?.assetId === "string" ? first.assetId : body.imageAssetId,
    };
  }
  return { ...body, images };
};

const postBookSchema = z.object({
  bookId: z.string().optional(),
  publisherId: z.string().optional(),
  bookName: z.string().trim().max(200).optional(),
  author: z.string().trim().max(200).optional(),
  publisherName: z.string().trim().max(200).optional(),
  availableStatus: z.enum(["available", "unavailable"]).default("available"),
});

// Safe enum validation: normalize legacy/alias inputs first, then enforce
// the canonical allowlist. Bengali labels ("এসএসসি বিজ্ঞান") and legacy
// values ("Science", "Comilla") auto-map; truly unknown values → 422.
const normalizeTaxonomyField = (
  raw: unknown,
  normalizer: (input: unknown) => string | null,
): unknown => {
  if (typeof raw !== "string") return raw;
  return normalizer(raw) ?? raw;
};

// Casts needed: *_VALUES are non-empty readonly tuples at runtime,
// but TS sees `readonly string[]` here.
const categorySchema = z.preprocess(
  (raw) => normalizeTaxonomyField(raw, normalizeCategory),
  z.enum(CATEGORY_VALUES as unknown as [string, ...string[]]),
);
const districtSchema = z.preprocess(
  (raw) => normalizeTaxonomyField(raw, normalizeDistrict),
  z.enum(DISTRICT_VALUES as unknown as [string, ...string[]]),
);

export const createPostSchema = z.object({
  body: z.preprocess(
    normalizePostImagesInput,
    z
    .object({
      title: z.string().trim().min(1).max(200),
      type: z.enum(["sell", "donate"]),
      images: imagesArrayRequired,
      // @deprecated legacy mirrors — accepted for back-compat, images is primary.
      image: z.string().url().optional(),
      imageAssetId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
      totalPrice: z.number().min(0).nullable(),
      overallCondition: overallConditionSchema.default("good"),
      district: districtSchema,
      area: z.string().min(1).max(100),
      phone: z.string().min(1).max(20),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: categorySchema,
      books: z.array(postBookSchema).default([]),
    })
    .superRefine((data, ctx) => {
      if (data.type === "donate") {
        if (data.totalPrice !== null) {
          ctx.addIssue({
            code: "custom",
            message: "Donate posts must have totalPrice: null.",
            path: ["totalPrice"],
          });
        }
        return;
      }
      // sell
      if (
        data.totalPrice === null ||
        data.totalPrice === undefined ||
        data.totalPrice < 0
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Sell posts require a total price of 0 or more.",
          path: ["totalPrice"],
        });
      }
    }),
  ),
});

export const updatePostSchema = z.object({
  body: z.preprocess(
    normalizePostImagesInput,
    z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      type: z.enum(["sell", "donate"]).optional(),
      images: z
        .array(postImageSchema)
        .max(POST_IMAGE_MAX, `এখন সর্বোচ্চ ${POST_IMAGE_MAX}টি ছবি দেওয়া যাবে`)
        .nullable()
        .optional(),
      image: z.string().url().nullable().optional(),
      imageAssetId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
      totalPrice: z.number().min(0).nullable().optional(),
      overallCondition: overallConditionSchema.optional(),
      // Lenient on update: normalize known values (aliases/case → canonical),
      // pass legacy/unknown through unchanged — old posts must stay editable.
      district: z.preprocess(
        (raw) => normalizeTaxonomyField(raw, normalizeDistrict) ?? raw,
        z.string().max(100).optional(),
      ),
      area: z.string().min(1).max(100).optional(),
      phone: z.string().min(1).max(20).optional(),
      messenger: z.string().max(100).optional(),
      whatsappOnly: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      category: z.preprocess(
        (raw) => normalizeTaxonomyField(raw, normalizeCategory) ?? raw,
        z.string().max(100).optional(),
      ),
      books: z.array(postBookSchema).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.imageAssetId && !data.image && !data.images) {
        ctx.addIssue({
          code: "custom",
          message: "An image URL is required with an image asset ID.",
          path: ["image"],
        });
      }
      // The client always sends the full payload (type included); the
      // type-aware totalPrice rules only apply when `type` is provided.
      if (data.type === "donate" && data.totalPrice !== undefined) {
        if (data.totalPrice !== null) {
          ctx.addIssue({
            code: "custom",
            message: "Donate posts must have totalPrice: null.",
            path: ["totalPrice"],
          });
        }
        return;
      }
      if (
        data.type === "sell" &&
        (data.totalPrice === null ||
          data.totalPrice === undefined ||
          data.totalPrice < 0)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Sell posts require a total price of 0 or more.",
          path: ["totalPrice"],
        });
      }
    }),
  ),
  params: z.object({
    id: z.string().min(1),
  }),
});

export const getPostsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    // Filter params: normalize aliases (Bengali labels, legacy spellings)
    // but keep unknown values (don't 422 browse queries — just match nothing
    // new; old mixed-case data still matches via case-insensitive filter).
    category: z.preprocess(
      (raw) => normalizeTaxonomyField(raw, normalizeCategory) ?? raw,
      z.string().optional(),
    ),
    condition: z.string().optional(),
    type: z.enum(["sell", "donate"]).optional(),
    district: z.preprocess(
      (raw) => normalizeTaxonomyField(raw, normalizeDistrict) ?? raw,
      z.string().optional(),
    ),
    area: z.string().optional(),
    academicLevel: z.string().optional(),
    sort: z
      .enum(["newest", "oldest", "title-asc", "title-desc"])
      .default("newest"),
  }),
});

export const getPostByIdParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const getPostBySlugParamsSchema = z.object({
  params: z.object({
    slug: z.string().min(1),
  }),
});

export const deletePostParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export type CreatePostInput = z.infer<typeof createPostSchema>["body"];
export type UpdatePostInput = z.infer<typeof updatePostSchema>["body"];
export type GetPostsQueryInput = z.infer<typeof getPostsQuerySchema>["query"];
export type GetPostByIdParamsInput = z.infer<
  typeof getPostByIdParamsSchema
>["params"];
export type DeletePostParamsInput = z.infer<
  typeof deletePostParamsSchema
>["params"];
