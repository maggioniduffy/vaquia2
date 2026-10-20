"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaptureForm } from "@/components/field/capture-form";
import { useCaptureRoute } from "@/components/field/use-capture-route";
import { FieldContent } from "@/components/shell/field-action-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { t } from "@/i18n/es-AR";
import { createDraft, discardDraft, getDraft, useOpenDrafts, type CaptureDraft } from "@/lib/field/capture/draft";
import { capturableTypes, latestSchemas, pinnedSchemas } from "@/lib/field/capture/schema";
import { formatDateTimeAr } from "@/lib/field/capture/time";
import { useReference } from "@/lib/offline/reference";
import type { RefFormSchema } from "@/lib/offline/reference-types";

/**
 * Entry of the shared field capture flow (one URL, draft id in the hash, see use-capture-route).
 * Lists the capturable record types and open drafts; opens `CaptureForm` for the chosen draft.
 */
export function CaptureHub({ companyId }: { companyId: string }) {
  const { draftId, newType, open } = useCaptureRoute();
  const recordTypes = useReference(companyId, "record_types");
  const formSchemas = useReference(companyId, "form_schemas");
  const drafts = useOpenDrafts(companyId);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(
    () => (recordTypes && formSchemas ? capturableTypes(recordTypes, formSchemas) : undefined),
    [recordTypes, formSchemas],
  );

  if (newType)
    return <NewDraft companyId={companyId} code={newType} formSchemas={formSchemas} open={open} />;
  if (draftId)
    return (
      <CaptureLoader
        key={draftId}
        companyId={companyId}
        draftId={draftId}
        onExit={() => open(null)}
      />
    );

  const start = async (code: string) => {
    const pinned = formSchemas ? latestSchemas(formSchemas, code) : undefined;
    if (!pinned) return;
    try {
      const draft = await createDraft({ companyId, recordTypeCode: code, pinned });
      open(draft.id);
    } catch {
      setError(t.capture.errors.storage);
    }
  };

  const titleOf = (code: string) => types?.find((x) => x.code === code)?.title ?? code;

  return (
    <FieldContent>
      {types === undefined ? (
        <p className="text-muted text-sm">{t.capture.loading}</p>
      ) : types.length === 0 ? (
        <EmptyState message={t.capture.noTypes} />
      ) : (
        <div className="flex flex-col gap-3">
          {types.map((type) => (
            <Button
              key={type.code}
              type="button"
              size="touch"
              variant="primary"
              onClick={() => void start(type.code)}
            >
              {type.title}
            </Button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-danger text-xs">{error}</p>}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-medium">{t.capture.drafts}</h2>
        {drafts === undefined ? null : drafts.length === 0 ? (
          <p className="text-muted text-sm">{t.capture.noDrafts}</p>
        ) : (
          <ul className="border-border divide-border flex flex-col divide-y rounded-[var(--radius-panel)] border">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 p-3">
                <span className="text-base">
                  {t.capture.draftLine(titleOf(d.record_type), formatDateTimeAr(d.updated_at))}
                </span>
                {confirmDiscard === d.id ? (
                  <>
                    <p className="text-muted text-sm">{t.capture.discardConfirm}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" className="h-12" onClick={() => setConfirmDiscard(null)}>
                        {t.common.cancel}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="h-12"
                        onClick={() => {
                          setConfirmDiscard(null);
                          void discardDraft(d.id);
                        }}
                      >
                        {t.capture.discardYes}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="ghost" className="h-12" onClick={() => setConfirmDiscard(d.id)}>
                      {t.capture.discard}
                    </Button>
                    <Button type="button" className="h-12" onClick={() => open(d.id)}>
                      {t.capture.resume}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </FieldContent>
  );
}

function CaptureLoader({
  companyId,
  draftId,
  onExit,
}: {
  companyId: string;
  draftId: string;
  onExit: () => void;
}) {
  const formSchemas = useReference(companyId, "form_schemas");
  const [draft, setDraft] = useState<CaptureDraft | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void getDraft(draftId).then((d) => live && setDraft(d && d.company_id === companyId ? d : null));
    return () => {
      live = false;
    };
  }, [draftId, companyId]);

  const pinned = useMemo(
    () => (draft && formSchemas ? pinnedSchemas(formSchemas, draft) : undefined),
    [draft, formSchemas],
  );

  if (draft === undefined || formSchemas === undefined)
    return (
      <FieldContent>
        <p className="text-muted text-sm">{t.capture.loading}</p>
      </FieldContent>
    );
  if (draft === null || !pinned)
    return (
      <FieldContent>
        <EmptyState
          message={draft === null ? t.capture.notFound : t.capture.schemaMissing}
          action={
            <Button type="button" className="h-12" onClick={onExit}>
              {t.capture.back}
            </Button>
          }
        />
      </FieldContent>
    );
  return <CaptureForm companyId={companyId} draft={draft} pinned={pinned} onExit={onExit} />;
}

/** Deep link `#/new/<code>`: creates the draft once the cached schemas are ready, then swaps the hash. */
function NewDraft({
  companyId,
  code,
  formSchemas,
  open,
}: {
  companyId: string;
  code: string;
  formSchemas: RefFormSchema[] | undefined;
  open: (id: string | null, opts?: { replace?: boolean }) => void;
}) {
  const started = useRef(false);
  const [storageFailed, setFailed] = useState(false);
  const pinned = formSchemas ? latestSchemas(formSchemas, code) : undefined;
  const ready = formSchemas !== undefined;
  const failed = storageFailed || (ready && !pinned);

  useEffect(() => {
    if (!ready || started.current) return;
    if (!pinned) return;
    started.current = true;
    createDraft({ companyId, recordTypeCode: code, pinned })
      .then((d) => open(d.id, { replace: true }))
      .catch(() => setFailed(true));
  }, [ready, pinned, companyId, code, open]);

  return (
    <FieldContent>
      {failed ? (
        <EmptyState
          message={pinned ? t.capture.errors.storage : t.capture.noTypes}
          action={
            <Button type="button" className="h-12" onClick={() => open(null, { replace: true })}>
              {t.capture.back}
            </Button>
          }
        />
      ) : (
        <p className="text-muted text-sm">{t.capture.loading}</p>
      )}
    </FieldContent>
  );
}
