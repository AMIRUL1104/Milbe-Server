import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostSchema,
  updatePostSchema,
} from "../post/post.validation.js";
import { updateCurrentUserProfileSchema } from "../user/user.validation.js";
import {
  deleteImageParamsSchema,
  hasValidImageSignature,
  uploadImageSchema,
} from "./image.validation.js";

const assetId = "507f1f77bcf86cd799439011";
const imageUrl = "https://res.cloudinary.com/example/image/upload/sample.jpg";

test("image upload accepts only the supported purposes", () => {
  assert.equal(uploadImageSchema.safeParse({ body: { purpose: "post" } }).success, true);
  assert.equal(uploadImageSchema.safeParse({ body: { purpose: "profile" } }).success, true);
  assert.equal(uploadImageSchema.safeParse({ body: { purpose: "other" } }).success, false);
});

test("pending-image delete accepts only a Mongo asset ID", () => {
  assert.equal(
    deleteImageParamsSchema.safeParse({ params: { assetId } }).success,
    true,
  );
  assert.equal(
    deleteImageParamsSchema.safeParse({ params: { assetId: "not-an-id" } })
      .success,
    false,
  );
});

test("image validation checks content signatures rather than trusting MIME alone", () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

  assert.equal(hasValidImageSignature(png, "image/png"), true);
  assert.equal(hasValidImageSignature(webp, "image/webp"), true);
  assert.equal(hasValidImageSignature(jpeg, "image/jpeg"), true);
  assert.equal(hasValidImageSignature(png, "image/jpeg"), false);
  assert.equal(hasValidImageSignature(Buffer.from("not an image"), "image/png"), false);
});

test("post image removal and asset pairing are validated", () => {
  assert.equal(
    updatePostSchema.safeParse({
      body: { image: null, imageAssetId: null },
      params: { id: "post-id" },
    }).success,
    true,
  );
  assert.equal(
    updatePostSchema.safeParse({
      body: { image: imageUrl, imageAssetId: assetId },
      params: { id: "post-id" },
    }).success,
    true,
  );
  assert.equal(
    updatePostSchema.safeParse({
      body: { imageAssetId: assetId },
      params: { id: "post-id" },
    }).success,
    false,
  );
});

test("new posts require a server-issued image asset ID", () => {
  const body = {
    title: "Sample listing",
    category: "Academic",
    type: "sell",
    image: imageUrl,
    imageAssetId: assetId,
    totalPrice: 0,
    overallCondition: "good",
    district: "Dhaka",
    area: "Dhanmondi",
    phone: "01700000000",
  };

  assert.equal(createPostSchema.safeParse({ body }).success, true);
  const withoutAssetId = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "imageAssetId"),
  );
  assert.equal(
    createPostSchema.safeParse({ body: withoutAssetId }).success,
    false,
  );
});

test("profile image removal and asset pairing are validated", () => {
  assert.equal(
    updateCurrentUserProfileSchema.safeParse({
      body: { avatarUrl: null, avatarAssetId: null },
    }).success,
    true,
  );
  assert.equal(
    updateCurrentUserProfileSchema.safeParse({
      body: { avatarUrl: imageUrl, avatarAssetId: assetId },
    }).success,
    true,
  );
  assert.equal(
    updateCurrentUserProfileSchema.safeParse({
      body: { avatarAssetId: assetId },
    }).success,
    false,
  );
});
