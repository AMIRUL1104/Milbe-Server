import { Router } from "express";
import { verifyToken } from "../../middleware/auth.middleware.js";
import { verifyAdmin } from "../../middleware/role.middleware.js";
import {
  seedLocationDataController,
  getDistrictsController,
  getUpazilasController,
  getInstitutionsController,
  getAllUpazilasController,
  getAllInstitutionsController,
} from "./location.controller.js";

const router = Router();

router.post("/seed", verifyToken, verifyAdmin, seedLocationDataController);

router.get("/districts", getDistrictsController);

router.get("/upazilas", getUpazilasController);

router.get("/upazilas/all", getAllUpazilasController);

router.get("/institutions", getInstitutionsController);

router.get("/institutions/all", getAllInstitutionsController);

export default router;