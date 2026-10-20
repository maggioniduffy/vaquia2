import { uuidv7 } from "@/lib/sync/uuid";

const KEY = "vaquia.device_id";

/** Stable per-browser id sent as `device_id` in every record envelope. */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = uuidv7();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "unknown-device"; // storage blocked: still a valid, non-empty id
  }
}
