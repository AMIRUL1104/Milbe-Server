import { z } from "zod";

export const uploadImageSchema = z.object({
  body: z.object({
    purpose: z.enum(["post", "profile"]),
  }),
});

export const deleteImageParamsSchema = z.object({
  params: z.object({
    assetId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid image asset ID."),
  }),
});

export function hasValidImageSignature(
  buffer: Buffer,
  mimeType: string,
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}
