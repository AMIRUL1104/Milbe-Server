import { MongoServerError, ObjectId } from "mongodb";
import { postsCollection } from "../../database/collections.js";
import type { Post, PostStatus } from "./post.types.js";
import type { GetPostsQueryInput } from "./post.validation.js";
import { generatePostSlug, resolveUniquePostSlug } from "./post.slug.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SLUG_RETRIES = 3;

const SORT_OPTIONS: Record<string, Record<string, 1 | -1>> = {
  newest: { publishedAt: -1 },
  oldest: { publishedAt: 1 },
  "title-asc": { "books.bookName": 1 },
  "title-desc": { "books.bookName": -1 },
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const redactPostContact = (post: Post): Omit<Post, "phone" | "messenger"> => {
  const publicPost = { ...post };
  delete publicPost.phone;
  delete publicPost.messenger;
  return publicPost;
};

/**
 * Derives the post title source: the provided title if present, otherwise all
 * book names concatenated. Used both for the stored `title` field and as the
 * source text for slug generation (kept in one place to avoid duplication).
 */
const derivePostSource = (
  title: string | undefined,
  books: { bookName: string }[],
): string =>
  title?.trim() ||
  books
    .map((book) => book.bookName.trim())
    .filter(Boolean)
    .join(" ");

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
    "_id" | "publishedAt" | "updatedAt" | "slug" | "title"
  > & {
    title?: string;
  },
): Promise<Post> => {
  const postId = new ObjectId();
  const source = derivePostSource(postData.title, postData.books);
  const baseSlug = await generatePostSlug(source);
  const data = {
    ...postData,
    _id: postId,
    title: source,
    slug: await resolveUniquePostSlug(baseSlug, isSlugTaken),
    publishedAt: new Date(),
  };

  // The unique slug index is the source of truth; if a concurrent insert
  // wins the race for the same slug, re-resolve and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      await postsCollection.insertOne(data);
      break;
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt < MAX_SLUG_RETRIES) {
        data.slug = await resolveUniquePostSlug(baseSlug, isSlugTaken);
        continue;
      }
      throw error;
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
      { title: { $regex: searchPattern, $options: "i" } },
      { description: { $regex: searchPattern, $options: "i" } },
      { category: { $regex: searchPattern, $options: "i" } },
      { "books.bookName": { $regex: searchPattern, $options: "i" } },
      { "books.publisherName": { $regex: searchPattern, $options: "i" } },
    ];
  }

  if (category) {
    filter.category = { $regex: `^${escapeRegex(category)}$`, $options: "i" };
  }

  if (condition) {
    filter["books.condition"] = condition;
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
  updateData: Partial<Post>,
): Promise<Post | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const postObjectId = new ObjectId(id);

  const existing = await postsCollection.findOne({
    _id: postObjectId,
    sellerId,
    isDeleted: { $ne: true },
  });

  if (!existing) {
    return null;
  }

  const cleanUpdate = Object.fromEntries(
    Object.entries(updateData).filter(([key]) =>
      UPDATE_FIELD_WHITELIST.has(key),
    ),
  );

  // Merge the update over the existing post to derive the current title
  // source (title if present, otherwise all book names). The slug only
  // regenerates when the source actually changed, so edits that do not touch
  // title/books never trigger a translation call and never churn the URL.
  const source = derivePostSource(
    typeof cleanUpdate.title === "string" ? cleanUpdate.title : existing.title,
    Array.isArray(cleanUpdate.books)
      ? (cleanUpdate.books as { bookName: string }[])
      : existing.books,
  );
  const sourceChanged = source !== existing.title;

  const $set: Record<string, unknown> = {
    ...cleanUpdate,
    updatedAt: new Date(),
  };

  if (sourceChanged) {
    // Same rules as create: no postId in the slug, counter suffix when the
    // new base slug is already taken — excluding this post itself.
    const baseSlug = await generatePostSlug(source);
    $set.title = source;
    $set.slug = await resolveUniquePostSlug(baseSlug, (slug) =>
      isSlugTaken(slug, id),
    );
  }

  // The unique slug index is the source of truth; if a concurrent write wins
  // the race for the same slug, re-resolve and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await postsCollection.findOneAndUpdate(
        { _id: postObjectId, sellerId, isDeleted: { $ne: true } },
        { $set },
        { returnDocument: "after" },
      );

      return result;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt >= MAX_SLUG_RETRIES) {
        throw error;
      }

      const baseSlug = await generatePostSlug(source);
      $set.slug = await resolveUniquePostSlug(baseSlug, (slug) =>
        isSlugTaken(slug, id),
      );
    }
  }
};

/**
 * Soft-deletes a post with ownership-or-admin authorization: admins may
 * delete any live post, regular users only their own (the same endpoint
 * serves the user-facing "My Posts" delete).
 */
export const deletePost = async (
  id: string,
  requester: { _id: string; isAdmin: boolean },
): Promise<boolean> => {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await postsCollection.updateOne(
    {
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
      ...(requester.isAdmin ? {} : { sellerId: requester._id }),
    },
    { $set: { isDeleted: true, updatedAt: new Date() } },
  );

  return result.matchedCount > 0;
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
