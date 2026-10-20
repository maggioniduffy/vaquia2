import Link from "next/link";
import { notFound } from "next/navigation";
import { Mono, PageTitle } from "@/components/people/page-title";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { mergeSchemas } from "@/forms/dsl";
import { FormRenderer } from "@/forms/render";
import { t } from "@/i18n/es-AR";
import { getRecordDetail } from "@/lib/office/records";
import { getSession } from "@/lib/session";
import { authorLabel, formatArt } from "../format";
import { RecordStatusBadge } from "../status-badge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border-border flex flex-col gap-3 rounded-[var(--radius-panel)] border p-4">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

const geoText = (lat: string | null, lng: string | null, acc: string | null) =>
  lat && lng ? t.forms.geoValue(lat, lng, acc ?? "—") : t.records.detail.noGeo;

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  const rec = await getRecordDetail(session.userId, id);
  if (!rec) notFound();

  const d = t.records.detail;
  const merged = rec.base_schema ? mergeSchemas(rec.base_schema, rec.extension_schema) : null;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Link
        href="/records"
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon size={14} />
        {t.records.back}
      </Link>
      <PageTitle
        title={rec.type_name}
        subtitle={
          <>
            <Mono>{formatArt(rec.occurred_at)}</Mono> · {rec.crew_name} · {rec.location_name}
          </>
        }
        actions={<RecordStatusBadge status={rec.status} />}
      />

      <Panel title={d.facts}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Fact label={t.records.columns.author}>{authorLabel(rec.author_id, session.userId)}</Fact>
          <Fact label={d.occurredAt}>
            <Mono>{formatArt(rec.occurred_at)}</Mono>
          </Fact>
          <Fact label={d.submittedAt}>
            <Mono>{formatArt(rec.submitted_at)}</Mono>
          </Fact>
          <Fact label={t.records.columns.crew}>{rec.crew_name}</Fact>
          <Fact label={t.records.columns.location}>{rec.location_name}</Fact>
          <Fact label={d.task}>{rec.task_type_name ?? "—"}</Fact>
          <Fact label={d.geo}>
            <Mono>{geoText(rec.geo_lat, rec.geo_lng, rec.geo_accuracy)}</Mono>
          </Fact>
          <Fact label={t.records.columns.type}>
            <Mono>{d.version(rec.schema_version, rec.extension_version)}</Mono>
          </Fact>
          {rec.amends_record_id ? (
            <Fact label={d.amends}>
              <Link
                href={`/records/${rec.amends_record_id}`}
                className="text-accent-strong hover:underline"
              >
                <Mono>{rec.amends_record_id.slice(0, 8)}</Mono>
              </Link>
            </Fact>
          ) : null}
        </dl>
      </Panel>

      <Panel title={d.content}>
        {merged ? (
          <FormRenderer
            sections={merged.sections}
            value={rec.payload}
            references={rec.references}
            readOnly
          />
        ) : (
          <p className="text-muted text-sm">{d.schemaMissing}</p>
        )}
      </Panel>

      <Panel title={d.participants}>
        {rec.participants.length === 0 ? (
          <p className="text-muted text-sm">{d.noParticipants}</p>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {rec.participants.map((p) => (
              <li key={`${p.persona_id}-${p.role}`} className="flex justify-between py-1.5">
                <span>{p.full_name}</span>
                <span className="text-muted">{d.roles[p.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={d.signatures}>
        {rec.signatures.length === 0 ? (
          <p className="text-muted text-sm">{d.noSignatures}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rec.signatures.map((s) => (
              <li
                key={s.id}
                className="border-border flex flex-col gap-1 rounded-[var(--radius-control)] border p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated /api/files route */}
                <img
                  src={`/api/files/${s.image_path}`}
                  alt={d.signatureAlt(s.persona_name)}
                  loading="lazy"
                  decoding="async"
                  className="bg-bg h-24 w-full object-contain"
                />
                <span className="text-sm font-medium">{s.persona_name}</span>
                <span className="text-muted text-xs">
                  {d.signedAt} <Mono>{formatArt(s.signed_at)}</Mono>
                </span>
                <span className="text-muted text-xs">
                  <Mono>{geoText(s.geo_lat, s.geo_lng, s.geo_accuracy)}</Mono>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {rec.attachments.length > 0 ? (
        <Panel title={d.attachments}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {rec.attachments.map((a) => (
              <li key={a.id}>
                <a href={`/api/files/${a.path}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated /api/files route */}
                  <img
                    src={`/api/files/${a.path}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="border-border aspect-square w-full rounded-[var(--radius-control)] border object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {rec.conflicts.length > 0 ? (
        <Panel title={d.conflicts}>
          <p className="text-muted text-sm">{d.conflictsHint}</p>
          <ul className="flex flex-col gap-3">
            {rec.conflicts.map((c) => (
              <li key={c.id} className="border-border rounded-[var(--radius-control)] border p-3">
                <p className="text-muted text-xs">
                  {d.conflictReceived(c.device_id)} · <Mono>{formatArt(c.received_at)}</Mono>
                </p>
                <pre className="mt-2 max-h-64 overflow-auto font-mono text-xs">
                  {JSON.stringify(c.envelope, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
