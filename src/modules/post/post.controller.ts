import type { Request, Response } from "express";
import type { AuthRequest } from "../../middleware/auth.types.js";
import {
  createPost,
  getAllPosts,
  getMyPosts,
  getMyPostById,
  getPostById,
  getPostBySlug,
  getFeaturedPosts,
  updatePost,
  deletePost,
  getAllPostsForAdmin,
} from "./post.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import { createPostSchema, updatePostSchema } from "./post.validation.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

const getParamSlug = (req: Request): string | null => {
  const slug = req.params.slug;
  if (Array.isArray(slug)) return slug[0] ?? null;
  return slug ?? null;
};

export const createPostController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // `validate` middleware only shadows req.query — it does NOT replace
  // req.body with the parsed result, so unknown keys (e.g. stale per-book
  // price/condition) would otherwise be persisted verbatim. Re-parsing the
  // body with the same schema applies defaults (books[], availableStatus,
  // overallCondition) and strips everything outside the contract.
  const body = createPostSchema.shape.body.parse(req.body);

  const postData = {
    ...body,
    sellerId: (req as AuthRequest).user!._id,
    sellerName: (req as AuthRequest).user!.name,
    sellerEmail: (req as AuthRequest).user!.email,
    status: "available",
  } as Parameters<typeof createPost>[0];

  const post = await createPost(postData);
  sendCreated(res, "Post created successfully", {
    insertedId: post._id,
    publishedAt: post.publishedAt,
  });
};

export const getAllPostsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = req.query as Record<string, string>;
  const result = await getAllPosts(query as any);
  sendSuccess(res, "Posts fetched successfully", result.posts, {
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
  });
};

export const getMyPostsController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const sellerId = req.user!._id;
  const posts = await getMyPosts(sellerId);
  sendSuccess(res, "Your posts fetched successfully", posts);
};

export const getMyPostByIdController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }

  // Scoped to the requester's own posts (contact fields are intentionally
  // NOT redacted here — the same trust level as getMyPosts).
  const post = await getMyPostById(id, req.user!._id);

  if (!post) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post fetched successfully", post);
};

export const getPostByIdController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }
  const post = await getPostById(id);

  if (!post) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post fetched successfully", post);
};

export const getPostBySlugController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const slug = getParamSlug(req);
  if (!slug) {
    sendSuccess(res, "Invalid post slug", null, undefined, 400);
    return;
  }

  const post = await getPostBySlug(slug);
  if (!post) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post fetched successfully", post);
};

export const getFeaturedPostsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const posts = await getFeaturedPosts();
  sendSuccess(res, "Featured posts fetched successfully", posts);
};

export const updatePostController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }
  // Same rationale as createPostController: apply the validated body
  // (defaults + unknown-key strip) instead of trusting raw req.body.
  const body = updatePostSchema.shape.body.parse(req.body);
  const updated = await updatePost(
    id,
    (req as AuthRequest).user!._id,
    body,
  );

  if (!updated) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post updated successfully", updated);
};

export const deletePostController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }

  const user = (req as AuthRequest).user;
  if (!user) {
    // `verifyToken` guarantees this; kept as a type-safety guard.
    sendSuccess(res, "Unauthorized", null, undefined, 401);
    return;
  }

  const deleted = await deletePost(id, {
    _id: user._id,
    isAdmin: user.role === "admin",
  });

  if (!deleted) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post deleted successfully");
};

export const getAllPostsForAdminController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const posts = await getAllPostsForAdmin();
  sendSuccess(res, "All posts fetched successfully", posts);
};
