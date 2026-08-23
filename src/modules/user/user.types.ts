export interface UserProfile {
  _id: string;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  district: string;
  area: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  memberSince: string;
}