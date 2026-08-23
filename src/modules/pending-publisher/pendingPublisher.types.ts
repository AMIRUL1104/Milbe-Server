export interface PendingPublisher {
  _id?: string;
  name: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt?: Date;
}