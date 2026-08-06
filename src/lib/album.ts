/**
 * Turning a list of memories and a list of photographs into an album.
 *
 * Kept away from React because the fiddly part is not the rendering, it is
 * the ordering: a lightbox that lets you walk the whole timeline with the
 * arrow keys needs one flat sequence, and every photograph in it needs to
 * know which memory it belongs to so the story beside it changes as you go.
 */

export interface MemoryLike {
  id: string;
  title: string;
  /** ISO date, e.g. '2026-08-06'. */
  date: string;
  note: string | null;
}

export interface PhotoLike {
  id: string;
  memory_id: string;
  path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface Book<M extends MemoryLike, P extends PhotoLike> {
  memory: M;
  photos: P[];
  /** The photograph the tile shows. Null for a memory with nothing in it yet. */
  cover: P | null;
}

/**
 * Photographs in the order the couple put them in.
 *
 * `sort_order` first so a chosen order sticks, then the upload time, so two
 * photographs added in one go never swap places between renders — an album
 * that reshuffles itself is unsettling in a way a list of expenses is not.
 */
export function orderPhotos<P extends PhotoLike>(photos: readonly P[]): P[] {
  return [...photos].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}

/** Groups photographs onto the memories they belong to, keeping memory order. */
export function buildBooks<M extends MemoryLike, P extends PhotoLike>(
  memories: readonly M[],
  photos: readonly P[],
): Book<M, P>[] {
  const byMemory = new Map<string, P[]>();
  for (const photo of photos) {
    const bucket = byMemory.get(photo.memory_id);
    if (bucket) bucket.push(photo);
    else byMemory.set(photo.memory_id, [photo]);
  }

  return memories.map((memory) => {
    const ordered = orderPhotos(byMemory.get(memory.id) ?? []);
    return { memory, photos: ordered, cover: ordered[0] ?? null };
  });
}

export interface AlbumSlide<M extends MemoryLike, P extends PhotoLike> {
  photo: P;
  memory: M;
  /** Which photograph of its own memory this is, 1-based — "3 of 7". */
  indexInBook: number;
  countInBook: number;
}

/**
 * Every photograph in the album, flattened in reading order.
 *
 * One sequence rather than one per memory, because the arrow keys should
 * carry you off the end of an afternoon and into the next one without
 * anybody having to close anything. That is what makes it feel like turning
 * pages together rather than opening files.
 */
export function flattenAlbum<M extends MemoryLike, P extends PhotoLike>(
  books: readonly Book<M, P>[],
): AlbumSlide<M, P>[] {
  const slides: AlbumSlide<M, P>[] = [];
  for (const book of books) {
    book.photos.forEach((photo, index) => {
      slides.push({
        photo,
        memory: book.memory,
        indexInBook: index + 1,
        countInBook: book.photos.length,
      });
    });
  }
  return slides;
}

/**
 * Where a given photograph sits in the flattened album, or -1.
 *
 * Used when somebody taps a tile: the lightbox opens on that photograph and
 * the arrows carry on from there, rather than restarting at the beginning.
 */
export function slideIndexOf<M extends MemoryLike, P extends PhotoLike>(
  slides: readonly AlbumSlide<M, P>[],
  photoId: string,
): number {
  return slides.findIndex((slide) => slide.photo.id === photoId);
}

/**
 * The next index in a given direction.
 *
 * Deliberately stops at both ends rather than wrapping. Looping an album is
 * disorienting — you cannot tell whether you have seen everything — and the
 * first and last photograph are meaningful positions in a shared story.
 */
export function stepSlide(current: number, delta: number, total: number): number {
  if (total <= 0) return -1;
  return Math.min(total - 1, Math.max(0, current + delta));
}

/** The next sort_order to hand a photograph being added to a memory. */
export function nextSortOrder(photos: readonly PhotoLike[]): number {
  return photos.reduce((highest, photo) => Math.max(highest, photo.sort_order), -1) + 1;
}
