import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyUser, verifyAdmin } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createPostController,
  getAllPostsController,
  getMyPostsController,
  getPostByIdController,
  getFeaturedPostsController,
  updatePostController,
  deletePostController,
  getAllPostsForAdminController,
} from "./post.controller.js";
import {
  createPostSchema,
  updatePostSchema,
  getPostsQuerySchema,
  getPostByIdParamsSchema,
  deletePostParamsSchema,
} from "./post.validation.js";

const router = Router();

router.post("/", verifyToken, verifyUser, createPostController);

router.get("/", validate(getPostsQuerySchema), getAllPostsController);

router.get("/my", verifyToken, verifyUser, getMyPostsController);

router.get("/featured", getFeaturedPostsController);

router.get("/admin", verifyToken, verifyAdmin, getAllPostsForAdminController);

router.get("/:id", validate(getPostByIdParamsSchema), getPostByIdController);

router.patch(
  "/:id",
  verifyToken,
  verifyUser,
  validate(updatePostSchema),
  updatePostController,
);

router.delete(
  "/:id",
  verifyToken,
  validate(deletePostParamsSchema),
  deletePostController,
);

export default router;
