export interface DashboardActivity {
  id: string;
  type: "user_registered" | "post_created" | "request_created";
  title: string;
  description: string;
  createdAt: string;
}

export interface AdminDashboardData {
  totalUsers: number;
  activePosts: number;
  pendingReviews: number;
  knowledgeBaseCount: number;
  recentActivities: DashboardActivity[];
}

export interface UserDashboardData {
  activePosts: number;
  pendingRequests: number;
  booksSold: number;
  booksDonated: number;
  recentActivities: DashboardActivity[];
}