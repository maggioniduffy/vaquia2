"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import { parseCoords } from "@/lib/geo/parse-coords";
import { controlClass, Field } from "./entity-sheet";

const LocationMap = dynamic(() => import("./location-map"), {
  ssr: false,
  loading: () => (
    <div className="border-border bg-hover text-muted flex h-60 items-center justify-center rounded-[var(--radius-control)] border text-xs">
      {t.locations.picker.mapLoading}
    </div>
  ),
});

type Place = { key: string; label: string; lat: number; lng: number };

function toNum(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Math.abs(n) <= 180 ? n : null;
}

async function searchPhoton(q: string, signal: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=es&limit=5&lat=-38.95&lon=-68.06`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("photon");
  const data = (await res.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: Record<string, string | undefined>;
    }[];
  };
  const out: Place[] = [];
  (data.features ?? []).forEach((f, i) => {
    const c = f.geometry?.coordinates;
    const p = f.properties ?? {};
    if (!c) return;
    const label = [p.name, p.street, p.city ?? p.county, p.state, p.country]
      .filter((x, idx, arr) => x && arr.indexOf(x) === idx)
      .join(", ");
    out.push({
      key: `${i}-${c[0]}-${c[1]}`,
      label: label || `${c[1]}, ${c[0]}`,
      lat: c[1],
      lng: c[0],
    });
  });
  return out;
}

/** Sets `lat`/`lng` form values via map click, place search, pasted link/text or manual inputs. */
export function LocationPicker({
  initialLat,
  initialLng,
  latError,
  lngError,
}: {
  initialLat: string | null;
  initialLng: string | null;
  latError?: string;
  lngError?: string;
}) {
  const [lat, setLat] = useState(initialLat ?? "");
  const [lng, setLng] = useState(initialLng ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteInvalid, setPasteInvalid] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const la = toNum(lat);
  const ln = toNum(lng);
  const point = la !== null && ln !== null && Math.abs(la) <= 90 ? { lat: la, lng: ln } : null;

  function setPoint(a: number, b: number) {
    setLat(String(a));
    setLng(String(b));
  }

  useEffect(() => {
    abort.current?.abort();
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const timer = setTimeout(() => {
      setSearching(true);
      searchPhoton(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setSearchFailed(false);
          setSearching(false);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults(null);
          setSearchFailed(true);
          setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  function onPaste(value: string) {
    setPaste(value);
    if (!value.trim()) {
      setPasteInvalid(false);
      return;
    }
    const c = parseCoords(value);
    setPasteInvalid(!c);
    if (c) setPoint(c.lat, c.lng);
  }

  const picker = t.locations.picker;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col gap-1">
        <Label htmlFor="place-search">{picker.search}</Label>
        <Input
          id="place-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={picker.searchPlaceholder}
          autoComplete="off"
          className={controlClass}
        />
        {query.trim().length >= 3 && (searching || results || searchFailed) ? (
          <ul
            aria-label={picker.search}
            className="border-border bg-surface absolute top-full right-0 left-0 z-[1000] mt-1 max-h-60 overflow-auto rounded-[var(--radius-control)] border shadow-lg"
          >
            {searching ? (
              <li className="text-muted px-3 py-2 text-xs">{picker.searching}</li>
            ) : searchFailed ? (
              <li className="text-muted px-3 py-2 text-xs">{picker.searchError}</li>
            ) : results && results.length === 0 ? (
              <li className="text-muted px-3 py-2 text-xs">{picker.noResults}</li>
            ) : (
              results?.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    className="hover:bg-hover focus-visible:bg-hover min-h-11 w-full px-3 py-2 text-left text-sm focus-visible:outline-none"
                    onClick={() => {
                      setPoint(r.lat, r.lng);
                      setQuery("");
                      setResults(null);
                    }}
                  >
                    {r.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <LocationMap point={point} onPick={setPoint} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="coords-paste">{picker.paste}</Label>
        <Input
          id="coords-paste"
          value={paste}
          onChange={(e) => onPaste(e.target.value)}
          placeholder={picker.pastePlaceholder}
          autoComplete="off"
          aria-invalid={pasteInvalid ? true : undefined}
          className={controlClass}
        />
        {pasteInvalid ? (
          <p role="alert" className="text-danger text-xs">
            {picker.pasteInvalid}
          </p>
        ) : null}
      </div>

      <details open={Boolean(latError || lngError)} className="group">
        <summary className="text-muted hover:text-text min-h-9 cursor-pointer text-xs select-none">
          {t.locations.fields.manual}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          <Field
            name="lat"
            label={t.locations.fields.lat}
            hint={t.locations.fields.coordsHint}
            error={latError}
          >
            <Input
              id="lat"
              name="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={latError ? true : undefined}
              className={`${controlClass} font-mono tabular-nums`}
            />
          </Field>
          <Field name="lng" label={t.locations.fields.lng} error={lngError}>
            <Input
              id="lng"
              name="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={lngError ? true : undefined}
              className={`${controlClass} font-mono tabular-nums`}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}
