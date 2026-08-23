import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyUser } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createUser,
  getUserProfileController,
  getUsersController,
  updateUserController,
  deleteUserController,
} from "./user.controller.js";
import { updateUserProfileSchema, getUsersQuerySchema, deleteUserParamsSchema } from "./user.validation.js";

const router = Router();

router.post("/", verifyToken, createUser);

router.get("/", verifyToken, getUserProfileController);

router.get("/admin", verifyToken, validate(getUsersQuerySchema), getUsersController);

router.patch("/", verifyToken, validate(updateUserProfileSchema), updateUserController);

router.delete("/:id", verifyToken, validate(deleteUserParamsSchema), deleteUserController);

export default router;