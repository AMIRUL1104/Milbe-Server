import type { Request, Response } from "express";
import type { AuthRequest } from "../../types/auth.types.js";
import {
  createPost,
  getAllPosts,
  getMyPosts,
  getPostById,
  getFeaturedPosts,
  updatePost,
  deletePost,
  getAllPostsForAdmin,
} from "./post.service.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";

const getParamId = (req: Request): string | null => {
  const id = req.params.id;
  if (Array.isArray(id)) return id[0] ?? null;
  return id ?? null;
};

export const createPostController = async (req: Request, res: Response): Promise<void> => {
  const postData = {
    ...req.body,
    sellerId: (req as AuthRequest).user!._id,
    sellerName: (req as AuthRequest).user!.name,
    sellerEmail: (req as AuthRequest).user!.email,
  };

  const post = await createPost(postData);
  sendCreated(res, "Post created successfully", { insertedId: post._id, publishedAt: post.publishedAt });
};

export const getAllPostsController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string>;
  const result = await getAllPosts(query as any);
  sendSuccess(res, "Posts fetched successfully", result.posts, {
    total: result.total,
    totalPages: result.totalPages,
    currentPage: result.currentPage,
  });
};

export const getMyPostsController = async (req: AuthRequest, res: Response): Promise<void> => {
  const sellerId = req.user!._id;
  const posts = await getMyPosts(sellerId);
  sendSuccess(res, "Your posts fetched successfully", posts);
};

export const getPostByIdController = async (req: Request, res: Response): Promise<void> => {
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

export const getFeaturedPostsController = async (req: Request, res: Response): Promise<void> => {
  const posts = await getFeaturedPosts();
  sendSuccess(res, "Featured posts fetched successfully", posts);
};

export const updatePostController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }
  const updated = await updatePost(id, req.body);

  if (!updated) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post updated successfully", updated);
};

export const deletePostController = async (req: Request, res: Response): Promise<void> => {
  const id = getParamId(req);
  if (!id) {
    sendSuccess(res, "Invalid post ID", null, undefined, 400);
    return;
  }
  const deleted = await deletePost(id);

  if (!deleted) {
    sendSuccess(res, "Post not found", null, undefined, 404);
    return;
  }

  sendSuccess(res, "Post deleted successfully");
};

export const getAllPostsForAdminController = async (req: Request, res: Response): Promise<void> => {
  const posts = await getAllPostsForAdmin();
  sendSuccess(res, "All posts fetched successfully", posts);
};