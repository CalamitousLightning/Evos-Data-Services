import axios from "axios";

// =========================
// SINGLE SOURCE OF TRUTH
// =========================
// Change hosts here — every page/component picks it up automatically.
export const PRIMARY_BASE = "https://evos-data-services.fly.dev";       // main (Render, behind custom domain)
export const FALLBACK_BASE = "https://api.evosdata.xyz"; // used only if primary is unreachable

// Separate service, unrelated to the failover pair above
export const BUSINESS_HUB_API_BASE = "https://evos-business-hub.onrender.com";

const TIMEOUT_MS = 8000; // how long we wait on primary before trying fallback

// =========================
// fetch()-based failover
// =========================
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Drop-in replacement for fetch(`${API_BASE}${path}`, options).
 * Tries PRIMARY_BASE first. Only falls back to FALLBACK_BASE if the
 * primary never responds at all (timeout / DNS / connection error) —
 * a normal HTTP error response (4xx/5xx) is returned as-is and does NOT
 * trigger a retry, since re-sending a POST against a second host could
 * double-fire something like a withdrawal or a deposit.
 */
export async function smartFetch(path, options = {}, timeoutMs = TIMEOUT_MS) {
  try {
    return await fetchWithTimeout(`${PRIMARY_BASE}${path}`, options, timeoutMs);
  } catch (err) {
    console.warn(`⚠️ ${PRIMARY_BASE} unreachable, falling back to ${FALLBACK_BASE}`, err?.message || err);
    return fetchWithTimeout(`${FALLBACK_BASE}${path}`, options, timeoutMs);
  }
}

// =========================
// axios-based failover (for pages still using axios directly)
// =========================
export async function smartAxios(method, path, data, options = {}) {
  const cfg = { timeout: TIMEOUT_MS, ...options };
  try {
    return await axios({ method, url: `${PRIMARY_BASE}${path}`, data, ...cfg });
  } catch (err) {
    // err.response means the server answered (e.g. 400/401/500) — trust that, don't retry.
    if (err.response) throw err;
    console.warn(`⚠️ ${PRIMARY_BASE} unreachable, falling back to ${FALLBACK_BASE}`, err?.message || err);
    return axios({ method, url: `${FALLBACK_BASE}${path}`, data, ...cfg });
  }
}

export const smartGet = (path, options) => smartAxios("get", path, undefined, options);
export const smartPost = (path, data, options) => smartAxios("post", path, data, options);
