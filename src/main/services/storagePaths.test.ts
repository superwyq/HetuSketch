import { describe, expect, it } from 'vitest';
import { assertSafeSegment, createProjectSlug } from './storagePaths.js';

describe('storagePaths', () => {
  it('creates safe ASCII project slugs for Chinese project names', () => {
    const slug = createProjectSlug('雾海纪元');

    expect(slug).toBe('project');
    expect(() => assertSafeSegment(`${slug}-abcd1234`, 'projectId')).not.toThrow();
  });

  it('normalizes latin names and strips unsafe path characters', () => {
    expect(createProjectSlug('My Great Book: Vol. 1')).toBe('my-great-book-vol-1');
    expect(() => assertSafeSegment('my-great-book-vol-1_abcd1234', 'projectId')).not.toThrow();
  });
});
