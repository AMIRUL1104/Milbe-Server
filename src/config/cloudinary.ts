import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "../utils/apiError.js";
import { env } from "./env.js";

const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
);

if (
  cloudinaryConfigured &&
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const requireCloudinary = () => {
  if (!cloudinaryConfigured) {
    throw new ApiError(
      "Cloudinary is not configured on the server.",
      503,
    );
  }

  return cloudinary;
};
