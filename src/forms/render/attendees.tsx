"use client";

import { useMemo, useState } from "react";
import { StatusBadge, type Status } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import type { QualificationStatus } from "@/lib/offline/reference-keys";
import type { OptionItem } from "../dsl";
import type { FormReferences } from "./types";

const STATUS: Record<QualificationStatus, Status> = {
  valid: "valid",
  expiring: "expiring",
  expired: "expired",
  missing: "warning",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function PersonaStatus({ id, references }: { id: string; references: FormReferences }) {
  const status = references.personaInfo?.[id]?.status;
  if (!status) return null;
  return (
    <StatusBadge status={STATUS[status]} className="text-xs">
      {t.forms.attendees.status[status]}
    </StatusBadge>
  );
}

/**
 * Attendees picker (`widget: "attendees"`): chosen people with their qualification status
 * (informational), quick "add the crew", and a searchable list. Works fully from the reference cache.
 */
export function AttendeesPicker({
  id,
  label,
  value,
  onChange,
  references,
  readOnly,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  references: FormReferences;
  readOnly: boolean;
}) {
  const [query, setQuery] = useState("");
  const personas = useMemo(() => references.personas ?? [], [references.personas]);
  const byId = useMemo(() => new Map(personas.map((p) => [p.key, p])), [personas]);
  const info = useMemo(() => references.personaInfo ?? {}, [references.personaInfo]);
  const crewMembers = useMemo(
    () => (references.crewId ? personas.filter((p) => info[p.key]?.crewId === references.crewId) : []),
    [personas, info, references.crewId],
  );
  const missingCrew = crewMembers.filter((p) => !value.includes(p.key));

  const q = normalize(query.trim());
  const results: OptionItem[] = q
    ? personas.filter(
        (p) => normalize(p.label).includes(q) || (info[p.key]?.dni ?? "").includes(q),
      )
    : personas;

  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...value, key] : value.filter((k) => k !== key));

  return (
    <div id={id} className="flex flex-col gap-3" role="group" aria-label={label}>
      <p className="text-muted text-sm">{t.forms.attendees.count(value.length)}</p>
      {value.length > 0 && (
        <ul className="border-border divide-border flex flex-col divide-y rounded-[var(--radius-panel)] border">
          {value.map((key) => (
            <li key={key} className="flex min-h-12 items-center justify-between gap-2 px-3 py-1">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base">{byId.get(key)?.label ?? key}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted font-mono text-xs">{info[key]?.dni}</span>
                  <PersonaStatus id={key} references={references} />
                </span>
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 shrink-0"
                  aria-label={`${t.forms.remove} ${byId.get(key)?.label ?? ""}`}
                  onClick={() => toggle(key, false)}
                >
                  {t.forms.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <>
          {missingCrew.length > 0 && (
            <Button
              type="button"
              className="h-12"
              onClick={() => onChange([...value, ...missingCrew.map((p) => p.key)])}
            >
              {t.forms.attendees.addCrew(missingCrew.length)}
            </Button>
          )}
          <Input
            className="h-12 text-base"
            type="search"
            placeholder={t.forms.attendees.search}
            aria-label={t.forms.attendees.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="border-border max-h-72 overflow-y-auto rounded-[var(--radius-panel)] border px-3">
            {results.length === 0 ? (
              <p className="text-muted py-3 text-sm">{t.forms.attendees.noResults}</p>
            ) : (
              results.map((p) => (
                <div key={p.key} className="flex min-h-12 items-center justify-between gap-2">
                  <Checkbox
                    label={p.label}
                    checked={value.includes(p.key)}
                    onChange={(e) => toggle(p.key, e.target.checked)}
                  />
                  <PersonaStatus id={p.key} references={references} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
