import type { Request } from "express";

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isBlocked: boolean;
  emailVerified: boolean;
  district?: string | undefined;
  area?: string | undefined;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
