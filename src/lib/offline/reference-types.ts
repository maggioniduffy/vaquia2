// Shape of GET /api/sync/reference (shared by the route handler and the client cache).
import type { QualificationStatus } from "@/lib/offline/reference-keys";

export type RefPersona = { id: string; full_name: string; dni: string; crew_id: string | null };
export type RefCrew = {
  id: string;
  name: string;
  location_id: string | null;
  supervisor_persona_id: string | null;
};
export type RefLocation = {
  id: string;
  name: string;
  field: string | null;
  lat: string | null;
  lng: string | null;
};
/** company_id null = global seed. */
export type RefTaskType = { id: string; company_id: string | null; code: string; name: string };
export type RefRecordType = { id: string; company_id: string | null; code: string; name: string };
export type RefQualificationStatus = {
  persona_id: string;
  task_type_id: string;
  qualification_type_id: string;
  status: QualificationStatus;
  expires_on: string | null;
  days_left: number | null;
};
export type RefFormSchema = {
  id: string;
  record_type_id: string;
  record_type: string; // record_types.code
  company_id: string | null;
  kind: "base" | "extension";
  version: number;
  schema: unknown;
  published_at: string;
};

export type ReferencePayload = {
  company_id: string;
  fetched_at: string;
  personas: RefPersona[];
  crews: RefCrew[];
  locations: RefLocation[];
  task_types: RefTaskType[];
  record_types: RefRecordType[];
  qualification_status: RefQualificationStatus[];
  form_schemas: RefFormSchema[];
};
