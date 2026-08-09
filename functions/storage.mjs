import { getStore } from "@netlify/blobs";

// Mirrors the shape of Claude's window.storage API:
//   GET    /api/storage?key=...&shared=true|false        -> { key, value, shared }
//   GET    /api/storage?action=list&prefix=...&shared=... -> { keys, prefix, shared }
//   POST   /api/storage   { key, value, shared }          -> { key, value, shared }
//   DELETE /api/storage?key=...&shared=true|false         -> { key, deleted, shared }
//
// There is no per-user auth in this app (just a typed display name), so
// "shared=false" and "shared=true" both currently resolve to the same
// site-wide store. The distinction is kept so the frontend code can stay
// nearly identical to the original artifact and so a real per-user store
// can be added later without touching call sites.

function storeFor(shared) {
  return getStore(shared ? "jetema-shared" : "jetema-personal");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const shared = url.searchParams.get("shared") === "true";
  const action = url.searchParams.get("action");
  const store = storeFor(shared);

  try {
    if (req.method === "GET" && action === "list") {
      const prefix = url.searchParams.get("prefix") || "";
      const { blobs } = await store.list({ prefix });
      return json({ keys: blobs.map((b) => b.key), prefix, shared });
    }

    if (req.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key is required" }, 400);
      const value = await store.get(key);
      if (value == null) return json({ error: "not found" }, 404);
      return json({ key, value, shared });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { key, value } = body || {};
      if (!key) return json({ error: "key is required" }, 400);
      await store.set(key, value);
      return json({ key, value, shared });
    }

    if (req.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "key is required" }, 400);
      await store.delete(key);
      return json({ key, deleted: true, shared });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

export const config = { path: "/api/storage" };
