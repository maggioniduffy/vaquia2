"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { commitAction, previewAction, type ClientRow, type ImportActionState } from "./actions";

type Kind = "personas" | "capacitaciones";
type Ok = Extract<ImportActionState, { ok: true }>;

const KINDS: Kind[] = ["personas", "capacitaciones"];
const COLUMNS: Record<Kind, readonly (keyof typeof t.import.columns)[]> = {
  personas: ["dni", "nombre", "cuadrilla", "activo"],
  capacitaciones: ["dni", "capacitacion", "emitida", "vence"],
};
const MAX_BYTES = 2 * 1024 * 1024;
const VALID_DISPLAY_LIMIT = 500;

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function ImportForm() {
  const [kind, setKind] = useState<Kind>("personas");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Ok | null>(null);
  const [result, setResult] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inputKey, setInputKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset(nextKind: Kind) {
    setKind(nextKind);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setInputKey((k) => k + 1);
  }

  function buildForm(): FormData | null {
    if (!file) {
      setError(t.import.noFile);
      return null;
    }
    if (file.size > MAX_BYTES) {
      setError(t.import.fileTooLarge);
      return null;
    }
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);
    return formData;
  }

  function run(action: typeof previewAction, onOk: (state: Ok) => void) {
    const formData = buildForm();
    if (!formData) return;
    setError(null);
    startTransition(async () => {
      try {
        const state = await action(formData);
        if (state.ok) onOk(state);
        else setError(state.error);
      } catch {
        setError(t.import.genericError);
      }
    });
  }

  const onPreview = () =>
    run(previewAction, (state) => {
      setResult(null);
      setPreview(state);
    });
  // The file is re-sent and re-validated on the server; the preview is never trusted.
  const onCommit = () =>
    run(commitAction, (state) => {
      setPreview(null);
      setResult(state);
    });

  const canCommit =
    preview !== null && preview.counts.valid > 0 && preview.headerErrors.length === 0;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>{t.import.kindLabel}</Label>
        <div className="flex gap-2" role="group" aria-label={t.import.kindLabel}>
          {KINDS.map((k) => (
            <Button
              key={k}
              variant={kind === k ? "secondary" : "ghost"}
              aria-pressed={kind === k}
              className={cn(kind === k && "border-text")}
              onClick={() => reset(k)}
              disabled={pending}
            >
              {t.import.kinds[k]}
            </Button>
          ))}
        </div>
        <p className="text-muted text-xs">{t.import.columnsHint[kind]}</p>
        <p className="text-muted text-xs">{t.import.separatorsHint}</p>
        <a
          href={`/people/import/template/${kind}`}
          download
          className="text-text w-fit text-sm underline underline-offset-2"
        >
          {t.import.template}
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">{t.import.fileLabel}</Label>
        <input
          key={inputKey}
          ref={inputRef}
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          className="text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
            setError(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant={canCommit ? "secondary" : "primary"}
            onClick={onPreview}
            disabled={pending || !file}
          >
            {pending ? t.import.previewing : t.import.preview}
          </Button>
          {canCommit && (
            <Button variant="primary" onClick={onCommit} disabled={pending}>
              {pending
                ? t.import.committing
                : fmt(t.import.commit, { count: preview.counts.valid })}
            </Button>
          )}
        </div>
        {canCommit && <p className="text-muted text-xs">{t.import.commitHint}</p>}
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
      </div>

      {preview && <PreviewView preview={preview} />}
      {result && <ResultView result={result} onAgain={() => reset(kind)} />}
    </div>
  );
}

function PreviewView({ preview }: { preview: Ok }) {
  const { counts, rows, kind, headerErrors } = preview;
  const columns = COLUMNS[kind];
  const errorRows = rows.filter((r) => r.action === "invalid");
  const validRows = rows.filter((r) => r.action !== "invalid");

  if (headerErrors.length > 0) {
    return (
      <ul className="flex flex-col gap-1" aria-label={t.import.table.errorsTitle}>
        {headerErrors.map((e) => (
          <li key={e} className="border-danger border-l-2 pl-3 text-sm">
            {e}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="preview">
      <p className="text-sm" data-testid="import-summary">
        {[
          fmt(t.import.summary.valid, { count: counts.valid }),
          fmt(t.import.summary.errors, { count: counts.errors }),
          fmt(t.import.summary.skipped, { count: counts.skipped }),
        ].join(" · ")}
      </p>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t.import.table.errorsTitle}</h2>
        {errorRows.length === 0 ? (
          <p className="text-muted text-sm">{t.import.table.noErrors}</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{t.import.table.line}</Th>
                {columns.map((c) => (
                  <Th key={c}>{t.import.columns[c]}</Th>
                ))}
                <Th>{t.import.table.error}</Th>
              </Tr>
            </THead>
            <TBody>
              {errorRows.map((row) => (
                <Tr key={row.line}>
                  <Td numeric className="border-danger border-l-2">
                    {row.line}
                  </Td>
                  {columns.map((c) => (
                    <Td key={c}>{row.values[c]}</Td>
                  ))}
                  <Td className="h-auto py-2">
                    {row.errors.map((e) => (
                      <div key={e}>{e}</div>
                    ))}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {validRows.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {fmt(t.import.table.validTitle, { count: validRows.length })}
          </summary>
          <ValidTable rows={validRows.slice(0, VALID_DISPLAY_LIMIT)} columns={columns} />
          {validRows.length > VALID_DISPLAY_LIMIT && (
            <p className="text-muted pt-2 text-xs">
              {fmt(t.import.table.moreRows, { count: validRows.length - VALID_DISPLAY_LIMIT })}
            </p>
          )}
        </details>
      )}
    </section>
  );
}

function ValidTable({
  rows,
  columns,
}: {
  rows: ClientRow[];
  columns: readonly (keyof typeof t.import.columns)[];
}) {
  return (
    <Table>
      <THead>
        <Tr>
          <Th>{t.import.table.line}</Th>
          {columns.map((c) => (
            <Th key={c}>{t.import.columns[c]}</Th>
          ))}
          <Th>{t.import.table.action}</Th>
          <Th>{t.import.table.note}</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.line}>
            <Td numeric>{row.line}</Td>
            {columns.map((c) => (
              <Td key={c}>{row.values[c]}</Td>
            ))}
            <Td>{row.action === "invalid" ? "" : t.import.actions[row.action]}</Td>
            <Td className="text-muted">{row.note}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function ResultView({ result, onAgain }: { result: Ok; onAgain: () => void }) {
  const { counts, kind } = result;
  const line =
    kind === "personas"
      ? fmt(t.import.result.personas, { created: counts.created, updated: counts.updated })
      : fmt(t.import.result.capacitaciones, {
          inserted: counts.inserted,
          skipped: counts.skipped,
        });
  return (
    <section className="border-border flex flex-col gap-2 rounded-lg border p-4" role="status">
      <h2 className="text-sm font-medium">{t.import.result.title}</h2>
      <p className="text-sm" data-testid="import-result">
        {line}
      </p>
      {counts.errors > 0 && (
        <p className="text-muted text-sm">
          {fmt(t.import.result.errorsLeft, { count: counts.errors })}
        </p>
      )}
      <Button variant="secondary" className="w-fit" onClick={onAgain}>
        {t.import.result.again}
      </Button>
    </section>
  );
}
