import { ObjectId } from "mongodb";
import { postsCollection } from "../../database/collections.js";
import type { Post, PostStatus } from "./post.types.js";
import type { GetPostsQueryInput } from "./post.validation.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const SORT_OPTIONS: Record<string, Record<string, 1 | -1>> = {
  newest: { publishedAt: -1 },
  oldest: { publishedAt: 1 },
  "title-asc": { "books.bookName": 1 },
  "title-desc": { "books.bookName": -1 },
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createPost = async (
  postData: Omit<Post, "_id" | "publishedAt" | "updatedAt">,
): Promise<Post> => {
  const data = {
    ...postData,
    publishedAt: new Date(),
  };

  const result = await postsCollection.insertOne(data as Post);
  const created = await postsCollection.findOne({ _id: result.insertedId });
  return created!;
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
    posts,
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

export const getPostById = async (id: string): Promise<Post | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return postsCollection.findOne({
    _id: new ObjectId(id),
    isDeleted: { $ne: true },
  });
};

export const getFeaturedPosts = async (limit = 8): Promise<Post[]> => {
  return postsCollection
    .find({
      isDeleted: { $ne: true },
      status: "available",
    })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();
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

  const cleanUpdate = Object.fromEntries(
    Object.entries(updateData).filter(([key]) =>
      UPDATE_FIELD_WHITELIST.has(key),
    ),
  );

  const result = await postsCollection.findOneAndUpdate(
    { _id: new ObjectId(id), sellerId, isDeleted: { $ne: true } },
    { $set: { ...cleanUpdate, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  return result;
};

export const deletePost = async (id: string): Promise<boolean> => {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const result = await postsCollection.updateOne(
    { _id: new ObjectId(id), isDeleted: { $ne: true } },
    { $set: { isDeleted: true, updatedAt: new Date() } },
  );

  return result.matchedCount > 0;
};

export const getAllPostsForAdmin = async (): Promise<Post[]> => {
  return postsCollection.find().toArray();
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
