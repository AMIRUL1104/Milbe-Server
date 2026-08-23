export interface Upazila {
  _id?: string;
  name: string;
  district: string;
}

export interface Institution {
  _id?: string;
  name: string;
  type: "school" | "college" | "university";
  district: string;
  upazila: string;
}

export interface District {
  name: string;
  upazilas: string[];
}