"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Upload a photo to the business's public image folder (the `branding` bucket, `<orgId>/<folder>/…`) and return its
 * web address. Phone photos are shrunk in the browser first (longest side 2000px) so they load fast and fit the 2 MB limit.
 * Owners and admins can upload (storage policy 0009).
 */
export async function uploadPhoto(orgId: string, folder: string, file: File, maxSide = 2000): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  let blob: Blob = file, ext = file.type === "image/png" ? "png" : file.type === "image/gif" ? "gif" : file.type === "image/webp" ? "webp" : "jpg";
  if (file.type !== "image/gif") {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
      const keepPng = file.type === "image/png" && file.size < 1_500_000; // logos/cut-outs keep transparency
      const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, keepPng ? "image/png" : "image/webp", 0.86));
      if (out && (out.size < file.size || scale < 1 || file.size > 2_000_000)) { blob = out; ext = keepPng ? "png" : "webp"; }
    } catch { /* the browser couldn't read it — upload as is */ }
  }
  if (blob.size > 2_000_000) throw new Error("That photo is too big — try one under 2 MB.");
  const supabase = createClient();
  const path = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/row-level security|not authorized|unauthorized/i.test(error.message) ? "Only owners and admins can upload photos." : error.message);
  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}
