import { MongoServerError, ObjectId } from "mongodb";
import { postsCollection } from "../../database/collections.js";
import { client } from "../../database/index.js";
import {
  assertPendingImage,
  attachPendingImage,
  cleanupDetachedImage,
  detachImageAsset,
  isCloudinaryUrl,
} from "../image/image.service.js";
import { ApiError } from "../../utils/apiError.js";
import type { Post, PostImage, PostStatus } from "./post.types.js";
import type { GetPostsQueryInput } from "./post.validation.js";
import {
  derivePostSource,
  generatePostSearchData,
  resolveUniquePostSlug,
} from "./post.slug.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SLUG_RETRIES = 3;

const SORT_OPTIONS: Record<string, Record<string, 1 | -1>> = {
  newest: { publishedAt: -1 },
  oldest: { publishedAt: 1 },
  "title-asc": { title: 1 },
  "title-desc": { title: -1 },
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redactPostContact = (post: Post): Omit<Post, "phone" | "messenger"> => {
  const normalized = normalizePostImages(post);
  // Destructure instead of `delete` — `phone` is required on the new
  // contract and `exactOptionalPropertyTypes` forbids deleting it.
  const { phone: _phone, messenger: _messenger, ...publicPost } = normalized;
  return publicPost;
};

/**
 * Checks whether a slug is already used by ANY post (including soft-deleted
 * ones, which still occupy a slot in the unique slug index). An optional post
 * ID can be excluded so an existing post can regenerate its own slug without
 * colliding with itself.
 */
const isSlugTaken = (
  slug: string,
  excludePostId?: string,
): Promise<boolean> =>
  postsCollection
    .findOne(
      {
        slug,
        ...(excludePostId
          ? { _id: { $ne: new ObjectId(excludePostId) } }
          : {}),
      },
      { projection: { _id: 1 } },
    )
    .then(Boolean);

const isDuplicateKeyError = (error: unknown): boolean =>
  error instanceof MongoServerError && error.code === 11000;

/**
 * Future-proof image normalization (single locked to 1 for now).
 * Primary source: `images[]`. Legacy `image/imageAssetId` mirrors images[0].
 * Old docs without `images` are backfilled on read/write from legacy fields.
 */
export const normalizePostImages = (post: Post): Post => {
  if (Array.isArray(post.images) && post.images.length > 0) {
    const first = post.images[0];
    if (!first) return { ...post, images: [] };
    return {
      ...post,
      image: first.url ?? post.image ?? null,
      imageAssetId: first.assetId ?? post.imageAssetId,
    };
  }
  if (post.image) {
    const fallback: PostImage[] = post.imageAssetId
      ? [{ url: post.image, assetId: post.imageAssetId }]
      : [];
    // Legacy docs may lack assetId (pre-Cloudinary ImgBB URLs) — keep URL
    // visible via `image`, images stays empty until re-upload.
    return {
      ...post,
      images: fallback.length > 0 ? fallback : [],
      image: post.image,
    };
  }
  return { ...post, images: [] };
};

const resolveWriteImages = (input: {
  images?: PostImage[] | null | undefined;
  image?: string | null | undefined;
  imageAssetId?: string | null | undefined;
}): { images: PostImage[]; image: string | null; imageAssetId?: string } => {
  if (Array.isArray(input.images) && input.images.length > 0) {
    const first = input.images[0];
    if (!first) return { images: [], image: input.image ?? null };
    return {
      images: input.images,
      image: first.url,
      imageAssetId: first.assetId,
    };
  }
  // Legacy payload path (old clients): derive images[0] from image pair.
  if (typeof input.image === "string" && typeof input.imageAssetId === "string") {
    return {
      images: [{ url: input.image, assetId: input.imageAssetId }],
      image: input.image,
      imageAssetId: input.imageAssetId,
    };
  }
  return { images: [], image: input.image ?? null };
};

export const createPost = async (
  postData: Omit<
    Post,
    | "_id"
    | "publishedAt"
    | "updatedAt"
    | "slug"
    | "title"
    | "acceptedEver"
    | "requestCount"
    | "milestoneEmailLease"
  > & {
    title?: string;
  },
): Promise<Post> => {
  // images[] is primary; legacy image/imageAssetId derived for compat.
  const writeImages = resolveWriteImages({
    images: (postData as { images?: PostImage[] }).images,
    image: postData.image,
    imageAssetId: postData.imageAssetId,
  });
  const primaryAssetId = writeImages.images[0]?.assetId ?? writeImages.imageAssetId;
  const primaryUrl = writeImages.images[0]?.url ?? writeImages.image ?? null;
  if (!primaryAssetId || !primaryUrl) {
    throw ApiError.badRequest("Post images must be uploaded through the image API.");
  }
  await assertPendingImage(
    primaryAssetId,
    postData.sellerId,
    "post",
    primaryUrl,
  );

  const postId = new ObjectId();
  const books = postData.books;
  const bookNames = books.map(
    (book) => book.bookName ?? book.title ?? book.name ?? "",
  );
  const source = derivePostSource(postData.title, bookNames);
  const generatedSearchData = await generatePostSearchData(source, books);
  const data = {
    ...postData,
    images: writeImages.images,
    image: writeImages.image,
    ...(writeImages.imageAssetId ? { imageAssetId: writeImages.imageAssetId } : {}),
    _id: postId,
    acceptedEver: false,
    requestCount: 0,
    title: source,
    slug: await resolveUniquePostSlug(
      generatedSearchData.baseSlug,
      isSlugTaken,
    ),
    searchSlug: generatedSearchData.searchSlug,
    searchKeywords: generatedSearchData.searchKeywords,
    publishedAt: new Date(),
  };

  // The unique slug index is the source of truth; if a concurrent insert
  // wins the race for the same slug, re-resolve and retry.
  for (let attempt = 0; ; attempt++) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        if (primaryAssetId) {
          await attachPendingImage({
            assetId: primaryAssetId,
            ownerId: postData.sellerId,
            purpose: "post",
            secureUrl: primaryUrl,
            attachedTo: { kind: "post", id: postId.toString() },
            session,
          });
        }
        await postsCollection.insertOne(data, { session });
      });
      break;
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt < MAX_SLUG_RETRIES) {
        data.slug = await resolveUniquePostSlug(
          generatedSearchData.baseSlug,
          isSlugTaken,
        );
        continue;
      }
      if (primaryAssetId) {
        try {
          await cleanupDetachedImage(primaryAssetId);
        } catch (cleanupError) {
          console.error("[image-assets] Failed to clean up image after post creation failure.", {
            assetId: primaryAssetId,
            error: cleanupError,
          });
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  return data;
};

export const getAllPosts = async (query: GetPostsQueryInput) => {
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const search = query.search?.trim();
  const category = query.category?.trim();
  const condition = query.condition?.trim();
  const type = query.type;
  const district = query.district?.trim();
  const area = query.area?.trim();
  const academicLevel = query.academicLevel?.trim();
  const sort = query.sort ?? "newest";

  const filter: Record<string, unknown> = {
    status: "available",
    isDeleted: { $ne: true },
  };

  if (search) {
    const searchPattern = escapeRegex(search);
    filter.$or = [
      { searchKeywords: { $regex: searchPattern, $options: "i" } },
      { searchSlug: { $regex: searchPattern, $options: "i" } },
      { title: { $regex: searchPattern, $options: "i" } },
      { description: { $regex: searchPattern, $options: "i" } },
      { category: { $regex: searchPattern, $options: "i" } },
      { "books.bookName": { $regex: searchPattern, $options: "i" } },
      { "books.author": { $regex: searchPattern, $options: "i" } },
      { "books.publisherName": { $regex: searchPattern, $options: "i" } },
    ];
  }

  if (category) {
    filter.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
  }

  if (condition) {
    filter.overallCondition = condition;
  }

  if (type === "sell" || type === "donate") {
    filter.type = type;
  }

  if (district) {
    filter.district = { $regex: `^${escapeRegex(district)}$`, $options: "i" };
  }

  if (area) {
    filter.area = { $regex: `^${escapeRegex(area)}$`, $options: "i" };
  }

  if (academicLevel) {
    filter["books.academicLevel"] = academicLevel;
  }

  const sortQuery = SORT_OPTIONS[sort] ?? { publishedAt: -1 };

  const [posts, total] = await Promise.all([
    postsCollection
      .find(filter)
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    postsCollection.countDocuments(filter),
  ]);

  return {
    posts: posts.map(redactPostContact),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    currentPage: page,
  };
};

export const getMyPosts = async (sellerId: string): Promise<Post[]> => {
  const posts = await postsCollection
    .find({
      sellerId,
      isDeleted: { $ne: true },
    })
    .sort({ publishedAt: -1 })
    .toArray();
  return posts.map(normalizePostImages);
};

/**
 * Owner-scoped single-post fetch (edit mode). Unlike the public `getPostById`,
 * the contact fields (phone/messenger) are NOT redacted — the requester is
 * verified to be the seller, the same trust level as `getMyPosts`.
 */
export const getMyPostById = async (
  id: string,
  sellerId: string,
): Promise<Post | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const post = await postsCollection.findOne({
    _id: new ObjectId(id),
    sellerId,
    isDeleted: { $ne: true },
  });
  return post ? normalizePostImages(post) : null;
};

export const getPostById = async (
  id: string,
): Promise<Omit<Post, "phone" | "messenger"> | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const post = await postsCollection.findOne({
    _id: new ObjectId(id),
    isDeleted: { $ne: true },
  });

  return post ? redactPostContact(post) : null;
};

export const getPostBySlug = async (
  slug: string,
): Promise<Omit<Post, "phone" | "messenger"> | null> => {
  const post = await postsCollection.findOne({
    slug,
    isDeleted: { $ne: true },
  });

  return post ? redactPostContact(post) : null;
};

export const getPostByIdForRequest = async (
  id: string,
): Promise<Post | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const post = await postsCollection.findOne({
    _id: new ObjectId(id),
    isDeleted: { $ne: true },
  });
  return post ? normalizePostImages(post) : null;
};

export const getFeaturedPosts = async (
  limit = 8,
): Promise<Array<Omit<Post, "phone" | "messenger">>> => {
  const posts = await postsCollection
    .find({
      isDeleted: { $ne: true },
      status: "available",
    })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();

  return posts.map(redactPostContact);
};

// Fields a seller is allowed to modify when editing an existing post.
// Everything else (status, acceptedRequestId, seller*, isDeleted, publishedAt,
// etc.) is intentionally excluded so edit requests can never corrupt the
// post lifecycle or ownership data.
const UPDATE_FIELD_WHITELIST = new Set([
  "title",
  "category",
  "type",
  "images",
  "image",
  "imageAssetId",
  "totalPrice",
  "overallCondition",
  "district",
  "area",
  "phone",
  "messenger",
  "whatsappOnly",
  "description",
  "books",
]);

export const updatePost = async (
  id: string,
  sellerId: string,
  // `| undefined` on each optional key keeps this assignable from the zod
  // update body under exactOptionalPropertyTypes.
  updateData: { [K in keyof Post]?: Post[K] | null | undefined },
): Promise<{ post: Post | null; cleanupPending: boolean }> => {
  if (!ObjectId.isValid(id)) {
    return { post: null, cleanupPending: false };
  }

  const postObjectId = new ObjectId(id);

  const existing = await postsCollection.findOne({
    _id: postObjectId,
    sellerId,
    isDeleted: { $ne: true },
  });

  if (!existing) {
    return { post: null, cleanupPending: false };
  }

  const normalizedExisting = normalizePostImages(existing);
  const hasImages = Object.prototype.hasOwnProperty.call(updateData, "images");
  const hasImage = Object.prototype.hasOwnProperty.call(updateData, "image");
  const hasAssetId = Object.prototype.hasOwnProperty.call(
    updateData,
    "imageAssetId",
  );
  // images[] is primary (locked to 1 now); legacy fields fill gaps for old clients.
  const incomingImages = hasImages
    ? ((updateData.images as PostImage[] | null | undefined) ?? null)
    : hasImage || hasAssetId
      ? resolveWriteImages({
          image: (updateData.image as string | null | undefined) ?? null,
          imageAssetId:
            (updateData.imageAssetId as string | null | undefined) ?? null,
        }).images
      : normalizedExisting.images;
  const nextImages: PostImage[] | null = hasImages
    ? incomingImages
    : hasImage || hasAssetId
      ? incomingImages
      : null;
  const nextImage = nextImages
    ? (nextImages[0]?.url ?? null)
    : normalizedExisting.image;
  const requestedAssetId = nextImages
    ? (nextImages[0]?.assetId ?? undefined)
    : normalizedExisting.imageAssetId;
  const existingPrimaryAssetId =
    normalizedExisting.images[0]?.assetId ?? normalizedExisting.imageAssetId ?? undefined;

  const imageTouched = hasImages || hasImage || hasAssetId;

  if (
    imageTouched &&
    nextImage &&
    nextImage !== normalizedExisting.image &&
    !requestedAssetId
  ) {
    throw ApiError.badRequest(
      "New post images must be uploaded through the image API.",
    );
  }
  if (
    hasAssetId &&
    requestedAssetId !== existingPrimaryAssetId &&
    !hasImage &&
    !hasImages
  ) {
    throw ApiError.badRequest(
      "Image URL and asset reference must be updated together.",
    );
  }
  if (isCloudinaryUrl(nextImage ?? "") && !requestedAssetId) {
    throw ApiError.badRequest(
      "Cloudinary images must include a valid image asset reference.",
    );
  }
  if (
    requestedAssetId === existingPrimaryAssetId &&
    requestedAssetId &&
    nextImage !== normalizedExisting.image
  ) {
    throw ApiError.badRequest(
      "An image asset cannot be paired with a different delivery URL.",
    );
  }
  if (requestedAssetId && !nextImage) {
    throw ApiError.badRequest("An image URL is required with an image asset ID.");
  }

  const cleanUpdate = Object.fromEntries(
    Object.entries(updateData).filter(
      ([key]) => UPDATE_FIELD_WHITELIST.has(key) && key !== "imageAssetId",
    ),
  );

  // Merge the update over the existing post to derive the current title
  // source (title if present, otherwise all book names).
  const updatedBooks = Array.isArray(cleanUpdate.books)
    ? (cleanUpdate.books as Post["books"])
    : existing.books;
  const bookNames = updatedBooks.map(
    (book) => book.bookName ?? book.title ?? book.name ?? "",
  );
  const source = derivePostSource(
    typeof cleanUpdate.title === "string" ? cleanUpdate.title : existing.title,
    bookNames,
  );
  const sourceChanged = source !== existing.title;
  const searchableBooksChanged =
    JSON.stringify(
      updatedBooks.map((book) => [
        book.bookName ?? book.title ?? book.name ?? "",
        book.author ?? "",
        book.publisherName ?? "",
      ]),
    ) !==
    JSON.stringify(
      existing.books.map((book) => [
        book.bookName ?? book.title ?? book.name ?? "",
        book.author ?? "",
        book.publisherName ?? "",
      ]),
    );
  let baseSlugToResolve: string | undefined;

  const $set: Record<string, unknown> = {
    ...cleanUpdate,
    updatedAt: new Date(),
  };
  const $unset: Record<string, ""> = {};
  if (imageTouched && nextImages) {
    $set.images = nextImages;
    $set.image = nextImage;
    if (requestedAssetId) {
      $set.imageAssetId = requestedAssetId;
    } else {
      $unset.imageAssetId = "";
    }
  } else {
    if (hasImage) $set.image = nextImage;
    if (hasAssetId || (hasImage && nextImage !== existing.image)) {
      if (requestedAssetId) {
        $set.imageAssetId = requestedAssetId;
      } else {
        $unset.imageAssetId = "";
      }
    }
  }

  if (sourceChanged || searchableBooksChanged || !existing.searchKeywords?.length) {
    const generatedSearchData = await generatePostSearchData(source, updatedBooks);
    $set.searchSlug = generatedSearchData.searchSlug;
    $set.searchKeywords = generatedSearchData.searchKeywords;

    if (sourceChanged) {
      // Keep the URL unchanged when only book names change under an explicit
      // post title. A changed title source gets the same unique-slug rules as
      // post creation, excluding this post itself.
      baseSlugToResolve = generatedSearchData.baseSlug;
      $set.title = source;
      $set.slug = await resolveUniquePostSlug(
        generatedSearchData.baseSlug,
        (slug) => isSlugTaken(slug, id),
      );
    }
  } else if (!existing.searchSlug) {
    $set.searchSlug = existing.searchKeywords.join(" ");
  }

  // The unique slug index is the source of truth; if a concurrent write wins
  // the race for the same slug, re-resolve and retry.
  let updatedPost: Post | null = null;
  for (let attempt = 0; ; attempt++) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const latest = await postsCollection.findOne(
          {
            _id: postObjectId,
            sellerId,
            isDeleted: { $ne: true },
          },
          { session },
        );
        if (!latest) throw ApiError.notFound("Post not found.");
        const latestNormalized = normalizePostImages(latest);
        const latestPrimaryAssetId =
          latestNormalized.images[0]?.assetId ?? latestNormalized.imageAssetId;
        if (
          latestNormalized.image !== normalizedExisting.image ||
          latestPrimaryAssetId !== existingPrimaryAssetId
        ) {
          throw ApiError.conflict(
            "The post image changed in another update. Reload and try again.",
          );
        }

        if (imageTouched && requestedAssetId !== existingPrimaryAssetId) {
          if (requestedAssetId) {
            await attachPendingImage({
              assetId: requestedAssetId,
              ownerId: sellerId,
              purpose: "post",
              secureUrl: nextImage,
              attachedTo: { kind: "post", id },
              session,
            });
          }
          await detachImageAsset(
            existingPrimaryAssetId,
            sellerId,
            "post",
            id,
            session,
          );
        }

        const update = {
          $set,
          ...(Object.keys($unset).length ? { $unset } : {}),
        };
        updatedPost = await postsCollection.findOneAndUpdate(
          {
            _id: postObjectId,
            sellerId,
            isDeleted: { $ne: true },
          },
          update,
          { returnDocument: "after", session },
        );
        if (!updatedPost) {
          throw ApiError.conflict(
            "Post changed while the image update was being saved.",
          );
        }
      });
      break;
    } catch (error) {
      if (
        !isDuplicateKeyError(error) ||
        !baseSlugToResolve ||
        attempt >= MAX_SLUG_RETRIES
      ) {
        throw error;
      }

      $set.slug = await resolveUniquePostSlug(baseSlugToResolve, (slug) =>
        isSlugTaken(slug, id),
      );
    } finally {
      await session.endSession();
    }
  }

  let cleanupPending = false;
  if (
    imageTouched &&
    existingPrimaryAssetId &&
    existingPrimaryAssetId !== requestedAssetId
  ) {
    try {
      await cleanupDetachedImage(existingPrimaryAssetId);
    } catch (error) {
      cleanupPending = true;
      console.error("[image-assets] Old post image cleanup is pending.", {
        postId: id,
        assetId: existingPrimaryAssetId,
        error,
      });
    }
  }

  return { post: updatedPost ? normalizePostImages(updatedPost) : null, cleanupPending };
};

/**
 * Soft-deletes a post with ownership-or-admin authorization: admins may
 * delete any live post, regular users only their own (the same endpoint
 * serves the user-facing "My Posts" delete).
 */
export const deletePost = async (
  id: string,
  requester: { _id: string; isAdmin: boolean },
): Promise<{ deleted: boolean }> => {
  if (!ObjectId.isValid(id)) {
    return { deleted: false };
  }

  const session = client.startSession();
  let matched = false;
  try {
    await session.withTransaction(async () => {
      const filter = {
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
        ...(requester.isAdmin ? {} : { sellerId: requester._id }),
      };
      const post = await postsCollection.findOne(filter, { session });
      if (!post) return;

      const result = await postsCollection.updateOne(
        filter,
        { $set: { isDeleted: true, updatedAt: new Date() } },
        { session },
      );
      if (result.matchedCount !== 1) return;
      matched = true;
      // This is a soft delete: keep the post's imageAssetId and attached asset
      // reference intact so Cloudinary images remain available if restored.
      // A future hard delete should detach the asset and call
      // cleanupDetachedImage only after permanently removing the post.
    });
  } finally {
    await session.endSession();
  }

  return { deleted: matched };
};

// Soft-deleted posts must never re-appear in the admin list — every other
// read path filters `isDeleted`, this query previously did not (deleted posts
// came back on refresh).
export const getAllPostsForAdmin = async (): Promise<Post[]> => {
  const posts = await postsCollection
    .find({ isDeleted: { $ne: true } })
    .sort({ publishedAt: -1 })
    .toArray();
  return posts.map(normalizePostImages);
};

export const updatePostStatus = async (
  id: string,
  status: PostStatus,
): Promise<boolean> => {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await postsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } },
  );

  return result.modifiedCount > 0;
};

export const updatePostAcceptedRequest = async (
  postId: string,
  requestId: string | null,
): Promise<boolean> => {
  if (!ObjectId.isValid(postId)) {
    return false;
  }

  const result = await postsCollection.updateOne(
    { _id: new ObjectId(postId) },
    { $set: { acceptedRequestId: requestId, updatedAt: new Date() } },
  );

  return result.modifiedCount > 0;
};
