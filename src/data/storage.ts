import { useEffect, useState } from 'react';
import { requireClient } from './client';

/**
 * Uploads and signed URLs.
 *
 * The `media` bucket is private, so nothing here returns a permanent link.
 * A path is exchanged for a signed URL when it is about to be rendered, and
 * that URL expires within the hour. Photographs of the two of them and
 * scans of their boarding passes should not live on a guessable address.
 */

const MEDIA_BUCKET = 'media';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type MediaFolder = 'memories' | 'trips' | 'phrases' | 'avatars';

export class UploadError extends Error {
  constructor(public readonly reason: 'too_large' | 'failed') {
    super(reason);
    this.name = 'UploadError';
  }
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName);
  return match ? match[1]!.toLowerCase() : 'bin';
}

/**
 * Stores a file under `<couple_id>/<folder>/<random>.<ext>`.
 *
 * The couple id must be the first path segment — that is exactly what the
 * storage policies in migration 0003 check.
 */
export async function uploadMedia(
  coupleId: string,
  folder: MediaFolder,
  file: File,
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('too_large');

  const client = requireClient();
  const name = `${crypto.randomUUID()}.${extensionOf(file.name)}`;
  const path = `${coupleId}/${folder}/${name}`;

  const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new UploadError('failed');
  return path;
}

export async function removeMedia(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const client = requireClient();
  await client.storage.from(MEDIA_BUCKET).remove([path]);
}

export async function signedUrlFor(path: string): Promise<string | null> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return error ? null : (data?.signedUrl ?? null);
}

/**
 * Signed URLs for a batch of paths, resolved in one round trip where
 * possible. Used by the memories timeline so a page of photos is not twenty
 * separate requests.
 */
async function signedUrlsFor(paths: readonly string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const client = requireClient();
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};

  const result: Record<string, string> = {};
  for (const entry of data) {
    if (entry.path && entry.signedUrl) result[entry.path] = entry.signedUrl;
  }
  return result;
}

/** A single signed URL, refreshed whenever the path changes. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    void signedUrlFor(path).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}

/** Signed URLs for many paths at once, keyed by path. */
export function useSignedUrls(paths: readonly (string | null | undefined)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const wanted = paths.filter((path): path is string => Boolean(path));
  const signature = wanted.join('|');

  useEffect(() => {
    if (!signature) {
      setUrls({});
      return;
    }
    let active = true;
    void signedUrlsFor(signature.split('|')).then((next) => {
      if (active) setUrls(next);
    });
    return () => {
      active = false;
    };
  }, [signature]);

  return urls;
}
