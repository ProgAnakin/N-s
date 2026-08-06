import { describe, expect, it } from 'vitest';
import {
  buildBooks,
  flattenAlbum,
  nextSortOrder,
  orderPhotos,
  slideIndexOf,
  stepSlide,
  type MemoryLike,
  type PhotoLike,
} from './album';

function memory(id: string, date: string): MemoryLike {
  return { id, title: `memory ${id}`, date, note: null };
}

function photo(
  id: string,
  memoryId: string,
  sortOrder: number,
  createdAt = '2026-08-01T00:00:00.000Z',
): PhotoLike {
  return {
    id,
    memory_id: memoryId,
    path: `${memoryId}/${id}.jpg`,
    caption: null,
    sort_order: sortOrder,
    created_at: createdAt,
  };
}

describe('orderPhotos', () => {
  it('follows the order the couple chose', () => {
    const ordered = orderPhotos([photo('c', 'm1', 2), photo('a', 'm1', 0), photo('b', 'm1', 1)]);
    expect(ordered.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie by upload time, so an album never reshuffles itself', () => {
    const ordered = orderPhotos([
      photo('second', 'm1', 0, '2026-08-01T10:00:00.000Z'),
      photo('first', 'm1', 0, '2026-08-01T09:00:00.000Z'),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('leaves the input alone', () => {
    const input = [photo('b', 'm1', 1), photo('a', 'm1', 0)];
    orderPhotos(input);
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('buildBooks', () => {
  it('hangs each photograph off the memory it belongs to', () => {
    const books = buildBooks(
      [memory('m1', '2026-08-01'), memory('m2', '2026-08-02')],
      [photo('p1', 'm1', 0), photo('p2', 'm2', 0), photo('p3', 'm1', 1)],
    );

    expect(books[0]?.photos.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(books[1]?.photos.map((p) => p.id)).toEqual(['p2']);
  });

  it('makes the first photograph the cover', () => {
    const books = buildBooks([memory('m1', '2026-08-01')], [photo('b', 'm1', 1), photo('a', 'm1', 0)]);
    expect(books[0]?.cover?.id).toBe('a');
  });

  it('keeps a memory with no photographs, with no cover', () => {
    // A memory can be a sentence and no picture, and it still belongs on the
    // timeline.
    const books = buildBooks([memory('m1', '2026-08-01')], []);
    expect(books).toHaveLength(1);
    expect(books[0]?.cover).toBeNull();
    expect(books[0]?.photos).toEqual([]);
  });

  it('keeps the order the memories arrived in', () => {
    const books = buildBooks([memory('m2', '2026-08-02'), memory('m1', '2026-08-01')], []);
    expect(books.map((b) => b.memory.id)).toEqual(['m2', 'm1']);
  });

  it('ignores a photograph pointing at a memory that is not here', () => {
    const books = buildBooks([memory('m1', '2026-08-01')], [photo('orphan', 'gone', 0)]);
    expect(books[0]?.photos).toEqual([]);
  });
});

describe('flattenAlbum', () => {
  const books = buildBooks(
    [memory('m1', '2026-08-01'), memory('m2', '2026-08-02')],
    [photo('p1', 'm1', 0), photo('p2', 'm1', 1), photo('p3', 'm2', 0)],
  );

  it('runs straight from one memory into the next', () => {
    // This is what makes the arrow keys feel like turning pages rather than
    // opening files one at a time.
    expect(flattenAlbum(books).map((s) => s.photo.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('tells each photograph where it sits inside its own memory', () => {
    const slides = flattenAlbum(books);
    expect(slides[1]).toMatchObject({ indexInBook: 2, countInBook: 2 });
    expect(slides[2]).toMatchObject({ indexInBook: 1, countInBook: 1 });
  });

  it('carries the memory along, so the story beside it changes as you go', () => {
    const slides = flattenAlbum(books);
    expect(slides[0]?.memory.id).toBe('m1');
    expect(slides[2]?.memory.id).toBe('m2');
  });

  it('skips memories with nothing in them', () => {
    const withEmpty = buildBooks([memory('m1', '2026-08-01')], []);
    expect(flattenAlbum(withEmpty)).toEqual([]);
  });
});

describe('slideIndexOf', () => {
  const slides = flattenAlbum(
    buildBooks([memory('m1', '2026-08-01')], [photo('p1', 'm1', 0), photo('p2', 'm1', 1)]),
  );

  it('finds where a tapped photograph sits', () => {
    expect(slideIndexOf(slides, 'p2')).toBe(1);
  });

  it('is -1 for something not in the album', () => {
    expect(slideIndexOf(slides, 'nope')).toBe(-1);
  });
});

describe('stepSlide', () => {
  it('moves forward and back', () => {
    expect(stepSlide(1, 1, 5)).toBe(2);
    expect(stepSlide(1, -1, 5)).toBe(0);
  });

  // Looping is disorienting: you cannot tell whether you have seen
  // everything, and the first and last photograph are meaningful positions.
  it('stops at the start instead of wrapping to the end', () => {
    expect(stepSlide(0, -1, 5)).toBe(0);
  });

  it('stops at the end instead of wrapping to the start', () => {
    expect(stepSlide(4, 1, 5)).toBe(4);
  });

  it('is -1 for an empty album', () => {
    expect(stepSlide(0, 1, 0)).toBe(-1);
  });
});

describe('nextSortOrder', () => {
  it('is zero for the first photograph', () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it('goes after the highest one already there', () => {
    expect(nextSortOrder([photo('a', 'm1', 0), photo('b', 'm1', 4)])).toBe(5);
  });

  it('copes with orders that are not contiguous', () => {
    expect(nextSortOrder([photo('a', 'm1', 7), photo('b', 'm1', 2)])).toBe(8);
  });
});
