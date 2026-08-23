import type { Request, Response } from "express";
import {
  seedLocationData,
  getDistricts,
  getUpazilas,
  getInstitutions,
  getAllUpazilas,
  getAllInstitutions,
} from "./location.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export const seedLocationDataController = async (req: Request, res: Response): Promise<void> => {
  try {
    await seedLocationData();
    sendSuccess(res, "Location data seeded successfully");
  } catch (error) {
    console.error("Failed to seed location data:", error);
    sendSuccess(res, "Failed to seed location data", null, undefined, 500);
  }
};

export const getDistrictsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const districts = await getDistricts();
    sendSuccess(res, "Districts fetched successfully", districts);
  } catch (error) {
    console.error("Failed to fetch districts:", error);
    sendSuccess(res, "Failed to fetch districts", null, undefined, 500);
  }
};

export const getUpazilasController = async (req: Request, res: Response): Promise<void> => {
  try {
    const district = req.query.district as string;
    if (!district) {
      sendSuccess(res, "District parameter is required", null, undefined, 400);
      return;
    }
    const upazilas = await getUpazilas(district);
    sendSuccess(res, "Upazilas fetched successfully", upazilas);
  } catch (error) {
    console.error("Failed to fetch upazilas:", error);
    sendSuccess(res, "Failed to fetch upazilas", null, undefined, 500);
  }
};

export const getInstitutionsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const district = req.query.district as string;
    const upazila = req.query.upazila as string | undefined;
    const type = req.query.type as "school" | "college" | "university" | undefined;

    if (!district) {
      sendSuccess(res, "District parameter is required", null, undefined, 400);
      return;
    }

    const institutions = await getInstitutions(district, upazila, type);
    sendSuccess(res, "Institutions fetched successfully", institutions);
  } catch (error) {
    console.error("Failed to fetch institutions:", error);
    sendSuccess(res, "Failed to fetch institutions", null, undefined, 500);
  }
};

export const getAllUpazilasController = async (req: Request, res: Response): Promise<void> => {
  try {
    const upazilas = await getAllUpazilas();
    sendSuccess(res, "All upazilas fetched successfully", upazilas);
  } catch (error) {
    console.error("Failed to fetch all upazilas:", error);
    sendSuccess(res, "Failed to fetch all upazilas", null, undefined, 500);
  }
};

export const getAllInstitutionsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const institutions = await getAllInstitutions();
    sendSuccess(res, "All institutions fetched successfully", institutions);
  } catch (error) {
    console.error("Failed to fetch all institutions:", error);
    sendSuccess(res, "Failed to fetch all institutions", null, undefined, 500);
  }
};