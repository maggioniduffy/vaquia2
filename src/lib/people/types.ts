// Row types for phase 1 (people, places, qualifications). Dates are ISO `YYYY-MM-DD` strings,
// timestamps ISO strings, numeric lat/lng arrive as strings from `pg`.

export type Operator = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

export type Location = {
  id: string;
  company_id: string;
  name: string;
  field: string | null;
  operator_id: string | null;
  lat: string | null;
  lng: string | null;
  created_at: string;
  created_by: string | null;
};

export type Crew = {
  id: string;
  company_id: string;
  name: string;
  supervisor_persona_id: string | null;
  location_id: string | null;
  created_at: string;
  created_by: string | null;
};

export type Persona = {
  id: string;
  company_id: string;
  full_name: string;
  dni: string;
  crew_id: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
};

/** `company_id` null = global seed (read-only). */
export type QualificationType = {
  id: string;
  company_id: string | null;
  name: string;
  default_validity_months: number | null;
  issuer: string | null;
  operator_id: string | null;
  created_at: string;
  created_by: string | null;
};

export type Qualification = {
  id: string;
  company_id: string;
  persona_id: string;
  type_id: string;
  issued_on: string;
  expires_on: string | null;
  file_path: string | null;
  created_at: string;
  created_by: string | null;
};

/** `company_id` null = global seed. */
export type TaskType = {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

export type TaskRequirement = {
  id: string;
  company_id: string | null;
  task_type_id: string;
  qualification_type_id: string;
  created_at: string;
  created_by: string | null;
};

export type QualificationState = "valid" | "expiring" | "expired";
export type QualificationStatusValue = QualificationState | "missing";

/** View `current_qualifications`: latest qualification per persona x type. */
export type CurrentQualification = {
  qualification_id: string;
  company_id: string;
  persona_id: string;
  type_id: string;
  issued_on: string;
  expires_on: string | null;
  file_path: string | null;
  status: QualificationState;
  /** null when the qualification has no expiry. */
  days_left: number | null;
};

/** View `qualification_status`: active persona x task type x required qualification type. */
export type QualificationStatus = {
  company_id: string;
  persona_id: string;
  task_type_id: string;
  qualification_type_id: string;
  /** null when status is `missing`. */
  qualification_id: string | null;
  expires_on: string | null;
  days_left: number | null;
  status: QualificationStatusValue;
};

/** View `persona_task_fitness`: active persona x task type. */
export type PersonaTaskFitness = {
  company_id: string;
  persona_id: string;
  task_type_id: string;
  required_count: number;
  missing_count: number;
  expired_count: number;
  expiring_count: number;
  apto: boolean;
};
