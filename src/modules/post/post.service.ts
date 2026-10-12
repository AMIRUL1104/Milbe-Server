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
import type { Post, PostStatus } from "./post.types.js";
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
  // Destructure instead of `delete` — `phone` is required on the new
  // contract and `exactOptionalPropertyTypes` forbids deleting it.
  const { phone: _phone, messenger: _messenger, ...publicPost } = post;
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
  if (!postData.imageAssetId) {
    throw ApiError.badRequest("Post images must be uploaded through the image API.");
  }
  await assertPendingImage(
    postData.imageAssetId,
    postData.sellerId,
    "post",
    postData.image,
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
        if (postData.imageAssetId) {
          await attachPendingImage({
            assetId: postData.imageAssetId,
            ownerId: postData.sellerId,
            purpose: "post",
            secureUrl: postData.image,
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
      if (postData.imageAssetId) {
        try {
          await cleanupDetachedImage(postData.imageAssetId);
        } catch (cleanupError) {
          console.error("[image-assets] Failed to clean up image after post creation failure.", {
            assetId: postData.imageAssetId,
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
  return postsCollection
    .find({
      sellerId,
      isDeleted: { $ne: true },
    })
    .sort({ publishedAt: -1 })
    .toArray();
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

  return postsCollection.findOne({
    _id: new ObjectId(id),
    sellerId,
    isDeleted: { $ne: true },
  });
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

  return postsCollection.findOne({
    _id: new ObjectId(id),
    isDeleted: { $ne: true },
  });
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

  const hasImage = Object.prototype.hasOwnProperty.call(updateData, "image");
  const hasAssetId = Object.prototype.hasOwnProperty.call(
    updateData,
    "imageAssetId",
  );
  const nextImage = hasImage ? updateData.image ?? null : existing.image;
  const requestedAssetId = hasAssetId
    ? updateData.imageAssetId ?? undefined
    : hasImage && nextImage !== existing.image
      ? undefined
      : existing.imageAssetId;

  if (
    hasImage &&
    nextImage &&
    nextImage !== existing.image &&
    !requestedAssetId
  ) {
    throw ApiError.badRequest(
      "New post images must be uploaded through the image API.",
    );
  }
  if (
    hasAssetId &&
    requestedAssetId !== existing.imageAssetId &&
    !hasImage
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
    requestedAssetId === existing.imageAssetId &&
    requestedAssetId &&
    nextImage !== existing.image
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
  if (hasImage) $set.image = nextImage;
  if (hasAssetId || (hasImage && nextImage !== existing.image)) {
    if (requestedAssetId) {
      $set.imageAssetId = requestedAssetId;
    } else {
      $unset.imageAssetId = "";
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
        if (
          latest.image !== existing.image ||
          latest.imageAssetId !== existing.imageAssetId
        ) {
          throw ApiError.conflict(
            "The post image changed in another update. Reload and try again.",
          );
        }

        if (requestedAssetId !== existing.imageAssetId) {
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
            existing.imageAssetId,
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
    existing.imageAssetId &&
    existing.imageAssetId !== requestedAssetId
  ) {
    try {
      await cleanupDetachedImage(existing.imageAssetId);
    } catch (error) {
      cleanupPending = true;
      console.error("[image-assets] Old post image cleanup is pending.", {
        postId: id,
        assetId: existing.imageAssetId,
        error,
      });
    }
  }

  return { post: updatedPost, cleanupPending };
};

/**
 * Soft-deletes a post with ownership-or-admin authorization: admins may
 * delete any live post, regular users only their own (the same endpoint
 * serves the user-facing "My Posts" delete).
 */
export const deletePost = async (
  id: string,
  requester: { _id: string; isAdmin: boolean },
): Promise<{ deleted: boolean; cleanupPending: boolean }> => {
  if (!ObjectId.isValid(id)) {
    return { deleted: false, cleanupPending: false };
  }

  const session = client.startSession();
  let detachedAssetId: string | undefined;
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
      detachedAssetId = post.imageAssetId;
      await detachImageAsset(
        detachedAssetId,
        post.sellerId,
        "post",
        id,
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  let cleanupPending = false;
  if (matched && detachedAssetId) {
    try {
      await cleanupDetachedImage(detachedAssetId);
    } catch (error) {
      cleanupPending = true;
      console.error("[image-assets] Deleted post image cleanup is pending.", {
        postId: id,
        assetId: detachedAssetId,
        error,
      });
    }
  }

  return { deleted: matched, cleanupPending };
};

// Soft-deleted posts must never re-appear in the admin list — every other
// read path filters `isDeleted`, this query previously did not (deleted posts
// came back on refresh).
export const getAllPostsForAdmin = async (): Promise<Post[]> => {
  return postsCollection
    .find({ isDeleted: { $ne: true } })
    .sort({ publishedAt: -1 })
    .toArray();
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
