"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SigningStep } from "@/components/field/signing-step";
import { FieldActionBar, FieldContent } from "@/components/shell/field-action-bar";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import type { Payload } from "@/forms/compile";
import { FormRenderer, type FormErrors } from "@/forms/render";
import { t } from "@/i18n/es-AR";
import {
  applyDerived,
  buildReferences,
  findField,
  signerIds,
} from "@/lib/field/capture/derive";
import {
  applyGeo,
  clearSignatures,
  emptyMeta,
  saveSignature,
  savePayload,
  type CaptureDraft,
  type CaptureMeta,
} from "@/lib/field/capture/draft";
import { captureGeo } from "@/lib/field/capture/geo";
import type { PinnedSchemas } from "@/lib/field/capture/schema";
import { submitDraft, validateDraft } from "@/lib/field/capture/submit";
import { formatDateTimeAr } from "@/lib/field/capture/time";
import { useReference } from "@/lib/offline/reference";
import { canonicalJson } from "@/lib/sync/canonical";

const SAVE_DELAY_MS = 300;

/**
 * Generic capture form for any record type: renders the pinned schema, autosaves the draft to
 * Dexie, takes a signature per signer, then freezes the draft and queues it for sync.
 * Everything runs over Dexie so it works with no connection.
 */
export function CaptureForm({
  companyId,
  draft,
  pinned,
  onExit,
}: {
  companyId: string;
  draft: CaptureDraft;
  pinned: PinnedSchemas;
  onExit: () => void;
}) {
  const personas = useReference(companyId, "personas");
  const crews = useReference(companyId, "crews");
  const locations = useReference(companyId, "locations");
  const taskTypes = useReference(companyId, "task_types");
  const qualifications = useReference(companyId, "qualification_status");

  const [payload, setPayload] = useState<Payload>(draft.payload);
  const [meta, setMeta] = useState<CaptureMeta>(draft.capture ?? emptyMeta(new Date()));
  const [step, setStep] = useState<"fill" | "sign">("fill");
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(draft.submission));

  const payloadRef = useRef(payload);
  const metaRef = useRef(meta);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    await savePayload(draft.id, payloadRef.current);
  }, [draft.id]);

  // Flush on leaving the page / unmounting so nothing typed is lost.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  // Automatic geo (best-effort; denied/unavailable never blocks anything).
  const geoRequested = useRef(false);
  useEffect(() => {
    if (done || geoRequested.current || draft.capture?.geo_state === "ok") return;
    geoRequested.current = true;
    void captureGeo().then(async (geo) => {
      if (Object.keys(metaRef.current.signatures).length > 0) return; // signatures cover the geo
      await applyGeo(draft.id, pinned.sections, geo);
      const geoField = findField(pinned.sections, "geo");
      setMeta((m) => ({ ...m, geo, geo_state: geo ? "ok" : "unavailable" }));
      if (geoField && geo) {
        const next = { ...payloadRef.current, [geoField.key]: geo };
        payloadRef.current = next;
        setPayload(next);
      }
    });
  }, [done, draft.id, draft.capture?.geo_state, pinned.sections]);

  const crewField = findField(pinned.sections, "crew");
  const references = useMemo(
    () =>
      buildReferences({
        personas: personas ?? [],
        crews: crews ?? [],
        locations: locations ?? [],
        taskTypes: taskTypes ?? [],
        qualifications: qualifications ?? [],
        crewId: crewField ? (payload[crewField.key] as string | undefined) : undefined,
      }),
    [personas, crews, locations, taskTypes, qualifications, crewField, payload],
  );

  const onChange = (next: Payload) => {
    const derived = applyDerived(pinned.sections, payloadRef.current, next, crews ?? [], locations ?? []);
    if (canonicalJson(derived) === canonicalJson(payloadRef.current)) return;
    if (Object.keys(metaRef.current.signatures).length > 0) {
      // Signing freezes the form: any content edit clears every signature (spec/forms.md).
      void clearSignatures(draft.id);
      setMeta((m) => ({ ...m, signatures: {} }));
      setNotice(t.capture.signaturesCleared);
    }
    payloadRef.current = derived;
    setPayload(derived);
    setErrors({});
    setProblem(null);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const signers = useMemo(() => {
    return signerIds(pinned.sections, payload).map((id) => ({
      id,
      name: (personas ?? []).find((p) => p.id === id)?.full_name ?? id,
    }));
  }, [pinned.sections, payload, personas]);

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await flush();
      const res = await submitDraft(draft.id, pinned);
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.reason === "invalid") {
        setErrors(res.errors);
        setStep("fill");
        setProblem(t.capture.fixErrors);
      } else {
        setProblem(
          res.reason === "missing_context"
            ? t.capture.errors.missingContext
            : res.reason === "missing_signatures"
              ? t.capture.errors.missingSignatures
              : res.reason === "frozen"
                ? t.capture.errors.frozen
                : t.capture.errors.noDraft,
        );
        if (res.reason === "missing_context") setStep("fill");
      }
    } catch {
      setProblem(t.capture.errors.storage);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    await flush();
    const valid = validateDraft(pinned, payloadRef.current);
    if (!valid.ok) {
      setErrors(valid.errors);
      setProblem(t.capture.fixErrors);
      return;
    }
    if (signerIds(pinned.sections, valid.parsed).length === 0) return submit();
    setNotice(null);
    setStep("sign");
  };

  const onSign = async (personaId: string, png: Blob) => {
    const sig = await saveSignature({ draftId: draft.id, personaId, png });
    setMeta((m) => ({ ...m, signatures: { ...m.signatures, [personaId]: sig } }));
    setProblem(null);
  };

  if (done)
    return (
      <>
        <FieldContent className="flex-1">
          <p role="status" className="text-base">
            {t.capture.submitted}
          </p>
        </FieldContent>
        <FieldActionBar>
          <Button type="button" variant="primary" size="touch" onClick={onExit}>
            {t.capture.back}
          </Button>
        </FieldActionBar>
      </>
    );

  const allSigned = signers.every((s) => meta.signatures[s.id]);
  const hasSigners = signers.length > 0;

  return (
    <>
      <FieldContent className="flex-1">
        <Stepper
          steps={[
            { label: t.capture.steps.fill, state: step === "fill" ? "current" : "done" },
            { label: t.capture.steps.sign, state: step === "sign" ? "current" : "todo" },
          ]}
        />
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {step === "fill" ? (
          <>
            <FormRenderer
              sections={pinned.sections}
              value={payload}
              onChange={onChange}
              references={references}
              errors={errors}
            />
            <div className="text-muted flex flex-col gap-1 font-mono text-xs">
              <span>{t.capture.occurredAt(formatDateTimeAr(meta.occurred_at))}</span>
              <span>
                {meta.geo_state === "ok" && meta.geo
                  ? t.capture.geoOk(
                      meta.geo.lat.toFixed(5),
                      meta.geo.lng.toFixed(5),
                      Math.round(meta.geo.accuracy).toString(),
                    )
                  : meta.geo_state === "unavailable"
                    ? t.capture.geoUnavailable
                    : t.capture.geoPending}
              </span>
              <span>{t.capture.saved}</span>
            </div>
            {hasSigners && Object.keys(meta.signatures).length > 0 && (
              <p className="text-muted text-xs">{t.capture.editClearsSignatures}</p>
            )}
          </>
        ) : (
          <SigningStep signers={signers} signatures={meta.signatures} onSign={onSign} />
        )}
        {problem && <FieldError>{problem}</FieldError>}
      </FieldContent>
      <FieldActionBar>
        {step === "fill" ? (
          <Button type="button" variant="primary" size="touch" disabled={busy} onClick={next}>
            {hasSigners ? t.capture.next : t.capture.submit}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="primary"
              size="touch"
              disabled={busy || !allSigned}
              onClick={submit}
            >
              {busy ? t.capture.submitting : t.capture.submit}
            </Button>
            <Button type="button" className="h-12" disabled={busy} onClick={() => setStep("fill")}>
              {t.capture.steps.fill}
            </Button>
          </>
        )}
      </FieldActionBar>
    </>
  );
}
