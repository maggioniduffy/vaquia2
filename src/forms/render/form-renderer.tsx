"use client";

import type { Payload } from "../compile";
import { FieldList } from "./field";
import type { FormRendererProps } from "./types";

/** Generic renderer: sections -> fields. Controlled; the parent owns `value` and validation `errors`. */
export function FormRenderer({
  sections,
  value,
  onChange,
  references = {},
  errors = {},
  readOnly = false,
}: FormRendererProps) {
  const set = (next: Payload) => onChange?.(next);
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-4">
          <h2 className="text-base font-medium">{section.title}</h2>
          <FieldList
            fields={section.fields}
            value={value}
            onChange={set}
            references={references}
            errors={errors}
            pathPrefix=""
            readOnly={readOnly}
            scope={value}
          />
        </section>
      ))}
    </div>
  );
}
