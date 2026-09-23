import type { Request } from "express";

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isBlocked: boolean;
  emailVerified: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
