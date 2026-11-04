import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";

import outrazoLogoDataUrl from "@/assets/outrazo-symbol-dark.png?inline";
import { EXTERNAL_SUPABASE_URL } from "@/integrations/supabase/external-client";
import { fetchPublishedEventDetails } from "@/showcase/event-data";

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 8_000;

let wasmPromise: Promise<void> | undefined;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function allowedImageUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("The event cover image URL is invalid.");
  }

  const allowedHosts = new Set([
    new URL(EXTERNAL_SUPABASE_URL).host,
    "images.unsplash.com",
    ...(process.env["SOCIAL_IMAGE_HOSTS"] ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !allowedHosts.has(url.host)
  ) {
    throw new Error("The event cover image host is not supported for social previews.");
  }
  return url;
}

async function fetchEventImageDataUri(rawUrl: string) {
  const url = allowedImageUrl(rawUrl);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`The event cover image returned HTTP ${response.status}.`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("The event cover image must be a JPEG, PNG, or WebP.");
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error("The event cover image exceeds the social preview size limit.");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("The event cover image response had no body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("The event cover image exceeds the social preview size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return `data:${mimeType};base64,${toBase64(bytes)}`;
}

function createSocialPreviewSvg(imageDataUri: string | undefined) {
  const imageMarkup = imageDataUri
    ? `<image href="${imageDataUri}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#123e31"/><stop offset="1" stop-color="#071b18"/>
      </linearGradient>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#071b18" stop-opacity=".02"/><stop offset="1" stop-color="#071b18" stop-opacity=".48"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
    ${imageMarkup}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
    <g transform="translate(1100 510)">
      <circle cx="40" cy="40" r="36" fill="#fff" fill-opacity=".96"/>
      <image href="${outrazoLogoDataUrl}" x="16" y="16" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>
    </g>
  </svg>`;
}

function initializeResvg(requestUrl: string) {
  if (!wasmPromise) {
    wasmPromise = initWasm(fetch(new URL(resvgWasmUrl, requestUrl)));
  }
  return wasmPromise.catch((error: unknown) => {
    wasmPromise = undefined;
    throw error;
  });
}

export async function handleEventSocialPreview(request: Request, eventId: string) {
  const event = await fetchPublishedEventDetails(eventId);
  if (!event) {
    return new Response("Event not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let imageDataUri: string | undefined;
  if (event.imageSrc) {
    try {
      imageDataUri = await fetchEventImageDataUri(event.imageSrc);
    } catch (error) {
      console.error(`[Event social preview] Could not load cover for ${event.id}:`, error);
      return new Response("Unable to load the event cover image.", {
        status: 502,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  await initializeResvg(request.url);
  const renderer = new Resvg(createSocialPreviewSvg(imageDataUri));
  const rendered = renderer.render();
  let png: Uint8Array;
  try {
    png = rendered.asPng();
  } finally {
    rendered.free();
    renderer.free();
  }

  const imageBuffer = new ArrayBuffer(png.byteLength);
  new Uint8Array(imageBuffer).set(png);
  return new Response(imageBuffer, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
