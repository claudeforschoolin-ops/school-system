/**
 * سجل المجموعات النظامية المتاحة.
 */
import { admissionsCollection } from "./admissions";
import { studentsCollection } from "./students";
import type { SystemCollection } from "./types";

export const COLLECTIONS: Record<string, SystemCollection> = {
  [studentsCollection.source]: studentsCollection,
  [admissionsCollection.source]: admissionsCollection,
};

export const COLLECTION_SOURCES = Object.keys(COLLECTIONS);
