import type { ProjectManifest } from '@shared/storageTypes';

export type ChapterStatus = 'not_started' | 'drafting' | 'done' | 'revision' | 'locked';
export interface SettingSet {
  id: string;
  name: string;
  summary: string;
  cover?: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChapterNode {
  id: string;
  projectId: string;
  parentId?: string;
  kind: 'book' | 'volume' | 'chapter';
  title: string;
  status: ChapterStatus;
  content: string;
  order: number;
  targetWords?: number;
  plotIds: string[];
  updatedAt: string;
}

const SETTING_SETS_KEY = 'hetusketch.iteration.settingSets';
const CHAPTERS_KEY = 'hetusketch.iteration.chapters';

export function listSettingSets(): SettingSet[] {
  return readJson<SettingSet[]>(SETTING_SETS_KEY, []);
}

export function saveSettingSets(items: SettingSet[]): void {
  writeJson(SETTING_SETS_KEY, items);
}

export function upsertSettingSet(input: Partial<SettingSet> & Pick<SettingSet, 'name'>): SettingSet {
  const now = new Date().toISOString();
  const items = listSettingSets();
  const existing = input.id ? items.find((item) => item.id === input.id) : undefined;
  const next: SettingSet = {
    id: existing?.id ?? `set-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    summary: input.summary?.trim() ?? existing?.summary ?? '',
    cover: input.cover ?? existing?.cover,
    projectIds: input.projectIds ?? existing?.projectIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  saveSettingSets([next, ...items.filter((item) => item.id !== next.id)]);
  return next;
}

export function removeSettingSet(id: string): void {
  saveSettingSets(listSettingSets().filter((item) => item.id !== id));
}

export function assignProjectToSet(setId: string, projectId: string): SettingSet | undefined {
  const items = listSettingSets();
  const next = items.map((item) => item.id === setId ? { ...item, projectIds: Array.from(new Set([...item.projectIds, projectId])), updatedAt: new Date().toISOString() } : item);
  saveSettingSets(next);
  return next.find((item) => item.id === setId);
}

export function getProjectSettingSet(projectId?: string): SettingSet | undefined {
  if (!projectId) return undefined;
  return listSettingSets().find((item) => item.projectIds.includes(projectId));
}

export function listChapters(projectId?: string): ChapterNode[] {
  const items = readJson<ChapterNode[]>(CHAPTERS_KEY, []);
  if (projectId) repairChapterTree(projectId);
  return (projectId ? readJson<ChapterNode[]>(CHAPTERS_KEY, []).filter((item) => item.projectId === projectId) : items).sort((a, b) => a.order - b.order);
}

export function upsertChapter(input: Partial<ChapterNode> & Pick<ChapterNode, 'projectId' | 'kind' | 'title'>): ChapterNode {
  const now = new Date().toISOString();
  const items = listChapters();
  const existing = input.id ? items.find((item) => item.id === input.id) : undefined;
  const kind = input.kind ?? existing?.kind ?? 'chapter';
  const parentId = resolveParentId(items, input.projectId, kind, input.parentId ?? existing?.parentId);
  const siblings = items.filter((item) => item.projectId === input.projectId && item.parentId === parentId && item.id !== existing?.id);
  const next: ChapterNode = {
    id: existing?.id ?? `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    projectId: input.projectId,
    parentId,
    kind,
    title: input.title.trim(),
    status: input.status ?? existing?.status ?? 'not_started',
    content: input.content ?? existing?.content ?? '',
    order: input.order ?? existing?.order ?? siblings.length,
    targetWords: input.targetWords ?? existing?.targetWords,
    plotIds: input.plotIds ?? existing?.plotIds ?? [],
    updatedAt: now
  };
  writeJson(CHAPTERS_KEY, [next, ...items.filter((item) => item.id !== next.id)]);
  return next;
}

function resolveParentId(items: ChapterNode[], projectId: string, kind: ChapterNode['kind'], requestedParentId?: string): string | undefined {
  const book = items.find((item) => item.projectId === projectId && item.kind === 'book');
  if (kind === 'book') return undefined;
  if (kind === 'volume') return book?.id;
  const volumes = items.filter((item) => item.projectId === projectId && item.kind === 'volume').sort((a, b) => a.order - b.order);
  if (!volumes.length) return book?.id;
  const requested = requestedParentId ? items.find((item) => item.id === requestedParentId) : undefined;
  if (requested?.kind === 'volume') return requested.id;
  return volumes[volumes.length - 1]?.id ?? book?.id;
}

function repairChapterTree(projectId: string): void {
  const items = readJson<ChapterNode[]>(CHAPTERS_KEY, []);
  const projectItems = items.filter((item) => item.projectId === projectId);
  let book = projectItems.find((item) => item.kind === 'book');
  if (!book) {
    book = { id: `book-${crypto.randomUUID().slice(0, 8)}`, projectId, kind: 'book', title: '默认书目', status: 'drafting', content: '', order: 0, plotIds: [], updatedAt: new Date().toISOString() };
    items.push(book);
  }

  const volumeIds = new Set(projectItems.filter((item) => item.kind === 'volume').map((item) => item.id));
  let defaultVolume = projectItems.find((item) => item.kind === 'volume');
  if (!defaultVolume) {
    defaultVolume = { id: `volume-${crypto.randomUUID().slice(0, 8)}`, projectId, parentId: book.id, kind: 'volume', title: '第一卷', status: 'drafting', content: '', order: 0, plotIds: [], updatedAt: new Date().toISOString() };
    items.push(defaultVolume);
    volumeIds.add(defaultVolume.id);
  }

  const next = items.map((item) => {
    if (item.projectId !== projectId) return item;
    if (item.kind === 'volume' && item.parentId !== book.id) {
      return { ...item, parentId: book.id, updatedAt: new Date().toISOString() };
    }
    if (item.kind === 'chapter' && (!item.parentId || !volumeIds.has(item.parentId))) {
      return { ...item, parentId: defaultVolume!.id, updatedAt: new Date().toISOString() };
    }
    return item;
  });

  // Reassign orders within each parent group.
  const grouped = new Map<string | undefined, ChapterNode[]>();
  for (const item of next.filter((item) => item.projectId === projectId)) {
    const list = grouped.get(item.parentId) ?? [];
    list.push(item);
    grouped.set(item.parentId, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.order - b.order);
  }
  const repaired = next.map((item) => {
    if (item.projectId !== projectId) return item;
    const list = grouped.get(item.parentId) ?? [];
    const order = list.findIndex((i) => i.id === item.id);
    return { ...item, order };
  });

  writeJson(CHAPTERS_KEY, repaired);
}

export function removeChapter(id: string): void {
  const items = listChapters();
  const descendantIds = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && descendantIds.has(item.parentId) && !descendantIds.has(item.id)) {
        descendantIds.add(item.id);
        changed = true;
      }
    }
  }
  writeJson(CHAPTERS_KEY, items.filter((item) => !descendantIds.has(item.id)));
}

export function moveChapter(id: string, direction: 'up' | 'down'): ChapterNode[] {
  const items = listChapters();
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  const siblings = items.filter((item) => item.projectId === current.projectId && item.parentId === current.parentId).sort((a, b) => a.order - b.order);
  const index = siblings.findIndex((item) => item.id === id);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= siblings.length) return items;
  const target = siblings[targetIndex];
  const next = items.map((item) => {
    if (item.id === current.id) return { ...item, order: target.order, updatedAt: new Date().toISOString() };
    if (item.id === target.id) return { ...item, order: current.order, updatedAt: new Date().toISOString() };
    return item;
  });
  writeJson(CHAPTERS_KEY, next);
  return listChapters(current.projectId);
}

export function reorderChapter(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): ChapterNode[] {
  const items = listChapters();
  const source = items.find((item) => item.id === sourceId);
  const target = items.find((item) => item.id === targetId);
  if (!source || !target || source.id === target.id) return listChapters(source?.projectId ?? target?.projectId);

  // Enforce strict hierarchy: book -> volume -> chapter.
  if (source.kind === 'chapter') {
    if (position === 'inside') {
      if (target.kind !== 'volume') return listChapters(source.projectId);
    } else {
      if (target.kind !== 'chapter') return listChapters(source.projectId);
    }
  }
  if (source.kind === 'volume') {
    if (position === 'inside') return listChapters(source.projectId);
    if (target.kind !== 'volume' && target.kind !== 'book') return listChapters(source.projectId);
  }

  // Prevent dropping a node into its own descendant.
  if (position === 'inside' && isDescendant(items, target.id, source.id)) return listChapters(source.projectId);

  const oldParentId = source.parentId;
  let newParentId: string | undefined = target.parentId;
  if (position === 'inside') {
    newParentId = target.id;
  }
  if (source.kind === 'volume' && target.kind === 'book') {
    newParentId = target.id;
  }

  // Remove source from its old parent and reassign orders there.
  const oldSiblings = items.filter((item) => item.projectId === source.projectId && item.parentId === oldParentId && item.id !== source.id)
    .sort((a, b) => a.order - b.order);

  // Build new siblings in target parent and insert source at the right position.
  const newSiblings = items.filter((item) => item.projectId === source.projectId && item.parentId === newParentId && item.id !== source.id)
    .sort((a, b) => a.order - b.order);

  let insertIndex = newSiblings.findIndex((item) => item.id === targetId);
  if (position === 'before') {
    // keep insertIndex as is
  } else if (position === 'after') {
    insertIndex += 1;
  } else {
    insertIndex = newSiblings.length;
  }
  newSiblings.splice(insertIndex, 0, source);

  const updates = new Map<string, { parentId?: string; order: number }>();
  updates.set(source.id, { parentId: newParentId, order: newSiblings.findIndex((s) => s.id === source.id) });
  for (const item of newSiblings) {
    if (item.id === source.id) continue;
    updates.set(item.id, { parentId: newParentId, order: newSiblings.findIndex((s) => s.id === item.id) });
  }
  if (oldParentId !== newParentId) {
    for (const item of oldSiblings) {
      updates.set(item.id, { parentId: oldParentId, order: oldSiblings.findIndex((s) => s.id === item.id) });
    }
  }

  const next = items.map((item) => {
    const update = updates.get(item.id);
    if (!update) return item;
    return { ...item, parentId: update.parentId, order: update.order, updatedAt: new Date().toISOString() };
  });

  writeJson(CHAPTERS_KEY, next);
  return listChapters(source.projectId);
}

function isDescendant(items: ChapterNode[], ancestorId: string, descendantId: string): boolean {
  const children = items.filter((item) => item.parentId === ancestorId);
  if (children.some((item) => item.id === descendantId)) return true;
  return children.some((item) => isDescendant(items, item.id, descendantId));
}

export function ensureDefaultBook(project: ProjectManifest): ChapterNode {
  const chapters = listChapters(project.id);
  const book = chapters.find((item) => item.kind === 'book');
  if (book) return book;
  return upsertChapter({ projectId: project.id, kind: 'book', title: project.name, status: 'drafting' });
}

export function ensureDefaultVolume(project: ProjectManifest, bookId?: string): ChapterNode {
  const chapters = listChapters(project.id);
  const volume = chapters.find((item) => item.kind === 'volume');
  if (volume) return volume;
  const book = bookId ? chapters.find((item) => item.id === bookId) : chapters.find((item) => item.kind === 'book');
  return upsertChapter({ projectId: project.id, kind: 'volume', title: '第一卷', parentId: book?.id, status: 'drafting' });
}

export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[a-zA-Z0-9_]+/g) ?? []).length;
  return cjk + words;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
