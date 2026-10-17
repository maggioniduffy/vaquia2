export type Coords = { lat: number; lng: number };

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PAIR = String.raw`${NUM}\s*[,;\s]\s*${NUM}`;

function valid(lat: number, lng: number): Coords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function fromMatch(m: RegExpMatchArray | null): Coords | null {
  return m ? valid(Number(m[1]), Number(m[2])) : null;
}

/**
 * Extracts coordinates from a Google Maps URL (`!3dLAT!4dLNG`, `@lat,lng`, `q=`/`ll=`/`query=`)
 * or plain `lat, lng` text (decimal comma is not supported: it clashes with the separator).
 * Returns null when nothing valid is found or values are out of range.
 */
export function parseCoords(input: string): Coords | null {
  let text = input.trim();
  if (!text) return null;
  try {
    text = decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    // keep raw text
  }

  const pin = fromMatch(text.match(new RegExp(String.raw`!3d${NUM}!4d${NUM}`)));
  if (pin) return pin;

  const at = fromMatch(text.match(new RegExp(String.raw`@${NUM}\s*,\s*${NUM}`)));
  if (at) return at;

  const param = fromMatch(text.match(new RegExp(String.raw`[?&](?:q|ll|query|center)=\s*${PAIR}`)));
  if (param) return param;

  return fromMatch(text.match(new RegExp(String.raw`^${PAIR}$`)));
}
