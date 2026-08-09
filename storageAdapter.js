// Drop-in replacement for the Claude-artifact-only `window.storage` API,
// backed by the /api/storage Netlify Function (which itself uses Netlify Blobs).
// Same method signatures as before: get/set/delete/list(key, shared).

const BASE = "/api/storage";

async function request(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 404) throw new Error("not found");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `storage request failed (${res.status})`);
  }
  return res.json();
}

export const storage = {
  get(key, shared = false) {
    return request(`${BASE}?key=${encodeURIComponent(key)}&shared=${shared}`);
  },
  set(key, value, shared = false) {
    return request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, shared }),
    });
  },
  delete(key, shared = false) {
    return request(`${BASE}?key=${encodeURIComponent(key)}&shared=${shared}`, {
      method: "DELETE",
    });
  },
  list(prefix = "", shared = false) {
    return request(
      `${BASE}?action=list&prefix=${encodeURIComponent(prefix)}&shared=${shared}`
    );
  },
};
