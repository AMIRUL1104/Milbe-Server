import type { ObjectId } from "mongodb";

export type ListingType = "sell" | "donate";
export type PostStatus = "available" | "sold" | "donated";
export type AvailableStatus = "available" | "unavailable";

export interface PostBook {
  bookId: string;
  publisherId: string;
  bookName: string;
  publisherName: string;
  image?: string | null;
  condition: string;
  price?: number | null;
  availableStatus: AvailableStatus;
}

export interface Post {
  _id?: ObjectId;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  title: string;
  type: ListingType;
  image?: string;
  district: string;
  area: string;
  phone?: string;
  messenger?: string;
  whatsappOnly?: boolean;
  description?: string;
  category?: string;
  status: PostStatus;
  acceptedRequestId?: string | null;
  isDeleted?: boolean;
  books: PostBook[];
  publishedAt: Date;
  updatedAt?: Date;
}