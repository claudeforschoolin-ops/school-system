/**
 * سجل المجموعات النظامية المتاحة.
 */
import { admissionsCollection } from "./admissions";
import { behaviorCollection, counselingCollection } from "./behavior";
import { leavesCollection, transfersCollection } from "./requests";
import { studentsCollection } from "./students";
import type { SystemCollection } from "./types";

export const COLLECTIONS: Record<string, SystemCollection> = {
  [studentsCollection.source]: studentsCollection,
  [admissionsCollection.source]: admissionsCollection,
  [leavesCollection.source]: leavesCollection,
  [transfersCollection.source]: transfersCollection,
  [behaviorCollection.source]: behaviorCollection,
  [counselingCollection.source]: counselingCollection,
};

export const COLLECTION_SOURCES = Object.keys(COLLECTIONS);
