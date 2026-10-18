import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Origin not allowed", { status: 403 });
  if (!env.DB || !env.BUCKET) return new Response("Photo storage unavailable", { status: 503 });
  const size = Number(request.headers.get("content-length"));
  if (!size || size > 8 * 1024 * 1024) return new Response("Photos must be under 8 MB", { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const isWebp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const contentType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!contentType || bytes.length > 8 * 1024 * 1024) return new Response("Use a JPEG, PNG or WebP photo under 8 MB", { status: 400 });
  const id = crypto.randomUUID(); const key = `evidence/${id}`;
  let name = "Delivery photo";
  try { name = decodeURIComponent(request.headers.get("x-file-name") ?? name).slice(0, 160); } catch { /* use default */ }
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare("INSERT INTO evidence (id, owner_id, object_key, name, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, user.userId, key, name, contentType, new Date().toISOString()).run();
  } catch (cause) { await env.BUCKET.delete(key); throw cause; }
  return Response.json({ id, name }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const row = await env.DB?.prepare("SELECT object_key, content_type FROM evidence WHERE id = ? AND owner_id = ?").bind(id, user.userId).first<{ object_key: string; content_type: string }>();
  if (!row) return new Response("Photo not found", { status: 404 });
  const object = await env.BUCKET?.get(row.object_key);
  if (!object) return new Response("Photo not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": row.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
