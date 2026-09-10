import {
  upazilasCollection,
  institutionsCollection,
} from "../../database/collections.js";
import type { Upazila, Institution, District } from "./location.types.js";

const SYLHET_DISTRICT = "Sylhet";

const SYLHET_UPAZILAS = [
  "Balaganj",
  "Beanibazar",
  "Bishwanath",
  "Companiganj",
  "Dakshin Surma",
  "Fenchuganj",
  "Golapganj",
  "Gowainghat",
  "Jaintiapur",
  "Kanaighat",
  "Sylhet Sadar",
  "Zakiganj",
];

const SYLHET_INSTITUTIONS: Omit<Institution, "_id">[] = [
  {
    name: "Shahjalal University of Science and Technology",
    type: "university",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Agricultural University",
    type: "university",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Medical College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet MAG Osmani Medical College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Engineering College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Cadet College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Government Pilot High School",
    type: "school",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Blue Bird High School & College",
    type: "school",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Scholastica Sylhet",
    type: "school",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Government Women's College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Murari Chand College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Sylhet Government College",
    type: "college",
    district: "Sylhet",
    upazila: "Sylhet Sadar",
  },
  {
    name: "Jaintapur Degree College",
    type: "college",
    district: "Sylhet",
    upazila: "Jaintiapur",
  },
  {
    name: "Beanibazar College",
    type: "college",
    district: "Sylhet",
    upazila: "Beanibazar",
  },
  {
    name: "Golapganj College",
    type: "college",
    district: "Sylhet",
    upazila: "Golapganj",
  },
  {
    name: "Balaganj College",
    type: "college",
    district: "Sylhet",
    upazila: "Balaganj",
  },
  {
    name: "Fenchuganj College",
    type: "college",
    district: "Sylhet",
    upazila: "Fenchuganj",
  },
  {
    name: "Zakiganj College",
    type: "college",
    district: "Sylhet",
    upazila: "Zakiganj",
  },
  {
    name: "Companiganj College",
    type: "college",
    district: "Sylhet",
    upazila: "Companiganj",
  },
  {
    name: "Kanaighat College",
    type: "college",
    district: "Sylhet",
    upazila: "Kanaighat",
  },
];

export const seedLocationData = async (): Promise<void> => {
  const upazilaCount = await upazilasCollection.countDocuments({
    district: SYLHET_DISTRICT,
  });
  if (upazilaCount === 0) {
    const upazilas = SYLHET_UPAZILAS.map((name) => ({
      name,
      district: SYLHET_DISTRICT,
    }));
    await upazilasCollection.insertMany(upazilas);
    // console.log("✅ Seeded upazilas for Sylhet district");
  }

  const institutionCount = await institutionsCollection.countDocuments({
    district: SYLHET_DISTRICT,
  });
  if (institutionCount === 0) {
    await institutionsCollection.insertMany(SYLHET_INSTITUTIONS);
    // console.log("✅ Seeded institutions for Sylhet district");
  }
};

export const getDistricts = async (): Promise<string[]> => {
  const districts = await upazilasCollection.distinct("district");
  return districts;
};

export const getUpazilas = async (district: string): Promise<Upazila[]> => {
  return upazilasCollection.find({ district }).sort({ name: 1 }).toArray();
};

export const getInstitutions = async (
  district: string,
  upazila?: string,
  type?: "school" | "college" | "university",
): Promise<Institution[]> => {
  const filter: Record<string, unknown> = { district };

  if (upazila) {
    filter.upazila = upazila;
  }

  if (type) {
    filter.type = type;
  }

  return institutionsCollection.find(filter).sort({ name: 1 }).toArray();
};

export const getAllUpazilas = async (): Promise<Upazila[]> => {
  return upazilasCollection.find({}).sort({ district: 1, name: 1 }).toArray();
};

export const getAllInstitutions = async (): Promise<Institution[]> => {
  return institutionsCollection
    .find({})
    .sort({ district: 1, upazila: 1, name: 1 })
    .toArray();
};
