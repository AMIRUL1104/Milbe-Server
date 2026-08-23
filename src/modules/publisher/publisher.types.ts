export interface Publisher {
  _id?: string;
  name: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  isActive: boolean;
  createdAt: Date;
}