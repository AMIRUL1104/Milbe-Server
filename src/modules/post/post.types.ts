import type { ObjectId } from "mongodb";

export type ListingType = "sell" | "donate";
export type PostStatus = "available" | "requested" | "sold" | "donated";

export interface PostBook {
  bookId: string;
  publisherId: string;
  bookName: string;
  publisherName: string;
  image?: string | null;
  condition: string;
  price?: number;
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
  isDeleted?: boolean;
  books: PostBook[];
  publishedAt: Date;
  updatedAt?: Date;
}