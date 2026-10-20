import type { OptionItem } from "../dsl";
import type { Payload } from "../compile";
import type { QualificationStatus } from "@/lib/offline/reference-keys";

/** Reference data comes from the offline layer (task 2.3); the renderer only receives it as props. */
export type FormReferences = {
  personas?: OptionItem[];
  crews?: OptionItem[];
  locations?: OptionItem[];
  taskTypes?: OptionItem[];
  /** PPE items required by the selected task type. */
  ppeItems?: OptionItem[];
  /** Persona details for pickers (dni, crew, worst qualification status from the reference cache). */
  personaInfo?: Record<string, { dni: string; crewId: string | null; status?: QualificationStatus }>;
  /** Crew currently chosen in the form (lets the attendees picker offer "add the whole crew"). */
  crewId?: string;
};

/** Validation messages by dotted path, e.g. `steps.0.step`. */
export type FormErrors = Record<string, string>;

export type FormRendererProps = {
  sections: import("../dsl").Section[];
  value: Payload;
  onChange?: (next: Payload) => void;
  references?: FormReferences;
  errors?: FormErrors;
  /** Office detail: no inputs, values as text. */
  readOnly?: boolean;
};
