"use client";

import { useRef, useState, useTransition } from "react";
import { FileIcon } from "@/components/people/file-icon";
import { Mono, PageTitle } from "@/components/people/page-title";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Stepper, type Step } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n/es-AR";
import { cn } from "@/lib/cn";
import { commitAction, previewAction, type ClientRow, type ImportActionState } from "./actions";

type Kind = "personas" | "capacitaciones";
type Ok = Extract<ImportActionState, { ok: true }>;
type ColumnKey = keyof typeof t.import.columns;

const KINDS: Kind[] = ["personas", "capacitaciones"];
const COLUMNS: Record<Kind, readonly ColumnKey[]> = {
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
  const [onlyProblems, setOnlyProblems] = useState(true);
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

  const current: 0 | 1 | 2 = result ? 2 : preview ? 1 : 0;
  const labels = [t.import.steps.file, t.import.steps.review, t.import.steps.confirm];
  const steps: Step[] = labels.map((label, i) => ({
    label,
    state: result ? "done" : i < current ? "done" : i === current ? "current" : "todo",
  }));

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4">
      <PageTitle
        title={t.import.title}
        subtitle={t.import.subtitle}
        actions={<Stepper steps={steps} className="w-72 max-w-full" />}
      />

      {!preview && !result && (
        <div className="bg-surface border-border flex flex-col gap-5 rounded-[var(--radius-panel)] border p-5">
          <div className="flex flex-col gap-2">
            <Label>{t.import.kindLabel}</Label>
            <div className="flex gap-2" role="group" aria-label={t.import.kindLabel}>
              {KINDS.map((k) => (
                <Button
                  key={k}
                  variant="secondary"
                  aria-pressed={kind === k}
                  className={cn(kind === k && "border-accent bg-accent-subtle")}
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
              className="text-accent-strong hover:text-accent-hover w-fit text-sm font-medium"
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
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => inputRef.current?.click()}
              >
                {t.import.chooseFile}
              </Button>
              <span className="text-muted truncate text-sm">
                {file ? file.name : t.import.noFileChosen}
              </span>
            </div>
            <div className="pt-2">
              <Button variant="primary" onClick={onPreview} disabled={pending || !file}>
                {pending ? t.import.previewing : t.import.preview}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {preview && (
        <PreviewView
          preview={preview}
          file={file}
          kind={kind}
          onlyProblems={onlyProblems}
          onOnlyProblems={setOnlyProblems}
          onChangeFile={() => reset(kind)}
          onBack={() => {
            setPreview(null);
            setError(null);
          }}
          onCommit={onCommit}
          canCommit={canCommit}
          pending={pending}
          error={error}
        />
      )}
      {result && <ResultView result={result} onAgain={() => reset(kind)} />}
    </div>
  );
}

/** Which columns an error message points at (UI hint only; the server owns validation). */
const COLUMN_HINTS: [ColumnKey, RegExp][] = [
  ["dni", /\bDNI\b/i],
  ["nombre", /\bnombre\b/i],
  ["cuadrilla", /\bcuadrilla\b/i],
  ["activo", /\bactivo\b/i],
  ["capacitacion", /capacitaci[oó]n/i],
  ["emitida", /emisi[oó]n/i],
  ["vence", /vencimiento/i],
];

function offendingColumns(errors: string[]): Set<ColumnKey> {
  const cols = new Set<ColumnKey>();
  for (const e of errors) {
    const msg = e.replace(/^Fila \d+:\s*/, "");
    for (const [col, re] of COLUMN_HINTS) if (re.test(msg)) cols.add(col);
  }
  return cols;
}

function cleanMessage(e: string): string {
  const msg = e.replace(/^Fila \d+:\s*/, "");
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

const MONO_COLUMNS = new Set<ColumnKey>(["dni", "emitida", "vence"]);

function PreviewView({
  preview,
  file,
  kind,
  onlyProblems,
  onOnlyProblems,
  onChangeFile,
  onBack,
  onCommit,
  canCommit,
  pending,
  error,
}: {
  preview: Ok;
  file: File | null;
  kind: Kind;
  onlyProblems: boolean;
  onOnlyProblems: (v: boolean) => void;
  onChangeFile: () => void;
  onBack: () => void;
  onCommit: () => void;
  canCommit: boolean;
  pending: boolean;
  error: string | null;
}) {
  const { counts, rows, headerErrors } = preview;
  const columns = COLUMNS[preview.kind];
  const problemRows = rows.filter((r) => r.action === "invalid" || r.action === "skip");
  const shown = onlyProblems ? problemRows : rows;
  const limited = shown.slice(0, VALID_DISPLAY_LIMIT);
  const gridCols = "grid-cols-[56px_repeat(4,minmax(104px,1fr))_minmax(260px,2fr)]";

  if (headerErrors.length > 0) {
    return (
      <>
        <ul className="flex flex-col gap-1" aria-label={t.import.table.errorsTitle}>
          {headerErrors.map((e) => (
            <li key={e} className="border-danger border-l-2 pl-3 text-sm">
              {e}
            </li>
          ))}
        </ul>
        <Footer>
          <span />
          <Button variant="secondary" onClick={onBack}>
            {t.import.back}
          </Button>
        </Footer>
      </>
    );
  }

  return (
    <>
      <section
        aria-label={t.import.previewLabel}
        className="bg-surface border-border flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-panel)] border px-4 py-3"
      >
        <FileIcon size={20} className="text-muted shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono">{file?.name ?? t.import.kinds[kind]}</span>
          <span className="text-muted text-xs">
            <Mono>{rows.length}</Mono> {t.import.rows}
            {file ? (
              <>
                {" · "}
                <Mono>
                  {Math.max(1, Math.round(file.size / 1024))} {t.import.sizeUnit}
                </Mono>
              </>
            ) : null}
            {" · "}
            {columns.join(", ")}
          </span>
        </div>
        <span className="flex-1" />
        <p className="sr-only" data-testid="import-summary">
          {[
            fmt(t.import.summary.valid, { count: counts.valid }),
            fmt(t.import.summary.errors, { count: counts.errors }),
            fmt(t.import.summary.skipped, { count: counts.skipped }),
          ].join(" · ")}
        </p>
        <span aria-hidden className="flex items-baseline gap-5">
          <span>
            <Mono className="text-xl font-semibold">{counts.valid}</Mono>{" "}
            <span className="text-muted">{t.import.validShort}</span>
          </span>
          <span>
            <Mono className={cn("text-xl font-semibold", counts.errors > 0 && "text-danger")}>
              {counts.errors}
            </Mono>{" "}
            <span className="text-muted">{t.import.errorsShort}</span>
          </span>
          <span>
            <Mono className={cn("text-xl font-semibold", counts.skipped > 0 && "text-warning")}>
              {counts.skipped}
            </Mono>{" "}
            <span className="text-muted">{t.import.skippedShort}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={onChangeFile}
          className="text-accent-strong hover:text-accent-hover text-sm font-medium"
        >
          {t.import.changeFile}
        </button>
      </section>

      <div className="flex items-center gap-2">
        <Switch
          id="only-problems"
          checked={onlyProblems}
          onCheckedChange={onOnlyProblems}
          aria-labelledby="only-problems-label"
        />
        <label id="only-problems-label" htmlFor="only-problems" className="cursor-pointer">
          {t.import.onlyProblems}
        </label>
        <span className="flex-1" />
        <a
          href={`/people/import/template/${kind}`}
          download
          className="text-accent-strong hover:text-accent-hover text-sm"
        >
          {t.import.template}
        </a>
      </div>

      <div className="bg-surface border-border overflow-x-auto rounded-[var(--radius-panel)] border">
        <div className="min-w-[860px]">
          <div
            className={cn(
              "text-muted border-border grid h-9 items-center gap-3 border-b pr-4 pl-4 text-xs",
              gridCols,
            )}
          >
            <span>{t.import.table.line}</span>
            {columns.map((c) => (
              <span key={c}>{t.import.columns[c]}</span>
            ))}
            <span>{t.import.problem}</span>
          </div>
          {limited.length === 0 ? (
            <p className="text-muted px-4 py-3 text-sm">{t.import.table.noErrors}</p>
          ) : (
            <ul>
              {limited.map((row) => (
                <ImportRow key={row.line} row={row} columns={columns} gridCols={gridCols} />
              ))}
            </ul>
          )}
        </div>
      </div>
      {shown.length > VALID_DISPLAY_LIMIT && (
        <p className="text-muted text-xs">
          {fmt(t.import.table.moreRows, { count: shown.length - VALID_DISPLAY_LIMIT })}
        </p>
      )}

      <Footer>
        <span className="text-muted text-sm">
          {error ? (
            <span role="alert" className="text-danger">
              {error}
            </span>
          ) : counts.skipped > 0 ? (
            t.import.skippedHint
          ) : (
            t.import.commitHint
          )}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack} disabled={pending}>
            {t.import.back}
          </Button>
          {canCommit && (
            <Button variant="primary" onClick={onCommit} disabled={pending}>
              {pending
                ? t.import.committing
                : fmt(t.import.commit, { count: preview.counts.valid })}
            </Button>
          )}
        </div>
      </Footer>
    </>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-bg sticky bottom-0 mt-auto flex flex-wrap items-center justify-between gap-3 border-t py-3">
      {children}
    </div>
  );
}

function ImportRow({
  row,
  columns,
  gridCols,
}: {
  row: ClientRow;
  columns: readonly ColumnKey[];
  gridCols: string;
}) {
  const invalid = row.action === "invalid";
  const skipped = row.action === "skip";
  const bad = invalid ? offendingColumns(row.errors) : new Set<ColumnKey>();
  return (
    <li
      className={cn(
        "border-border grid h-10 items-center gap-3 border-b border-l-2 pr-4 pl-3.5 whitespace-nowrap last:border-b-0",
        gridCols,
        invalid ? "border-l-danger" : skipped ? "border-l-warning" : "border-l-transparent",
      )}
    >
      <Mono className="text-muted text-xs">{row.line}</Mono>
      {columns.map((c) => (
        <span
          key={c}
          title={row.values[c]}
          className={cn(
            "truncate",
            MONO_COLUMNS.has(c) && "font-mono text-xs tabular-nums",
            bad.has(c) && "text-danger font-medium",
          )}
        >
          {row.values[c]}
        </span>
      ))}
      <span className="flex gap-2 overflow-hidden">
        {invalid ? (
          <>
            <span className="text-danger shrink-0 text-xs font-medium">{t.import.table.error}</span>
            <span className="truncate" title={row.errors.map(cleanMessage).join(" · ")}>
              {row.errors.map(cleanMessage).join(" · ")}
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                skipped ? "text-warning" : "text-muted",
              )}
            >
              {row.action === "invalid" ? "" : t.import.actions[row.action]}
            </span>
            <span className="text-muted truncate">{row.note}</span>
          </>
        )}
      </span>
    </li>
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
    <section
      className="bg-surface border-border flex max-w-3xl flex-col gap-2 rounded-[var(--radius-panel)] border p-5"
      role="status"
    >
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
