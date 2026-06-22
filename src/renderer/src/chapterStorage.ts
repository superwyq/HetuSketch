import type {
  BookManifest,
  BookStatus,
  BookTree,
  ChapterNode as PersistedChapterNode,
  ChapterStatus,
  ProjectManifest,
  VolumeNode,
  VolumeStatus
} from '@shared/storageTypes';

export type { ChapterStatus } from '@shared/storageTypes';

export type ChapterKind = 'book' | 'volume' | 'chapter';

export interface ChapterNode {
  id: string;
  projectId: string;
  bookId: string;
  parentId?: string;
  volumeId?: string;
  kind: ChapterKind;
  title: string;
  status: ChapterStatus;
  content: string;
  order: number;
  targetWords?: number;
  plotIds: string[];
  updatedAt: string;
  createdAt?: string;
  actualWords?: number;
}

interface LegacyChapterNode {
  id: string;
  projectId: string;
  parentId?: string;
  kind: ChapterKind;
  title: string;
  status?: ChapterStatus;
  content?: string;
  order?: number;
  targetWords?: number;
  plotIds?: string[];
  updatedAt?: string;
}

interface ProjectLike {
  id: string;
  name: string;
  type?: ProjectManifest['type'];
  summary?: string;
}

export interface LegacyChapterMigrationResult {
  migrated: boolean;
  projectCount: number;
  volumeCount: number;
  chapterCount: number;
}

const LEGACY_CHAPTERS_KEY = 'hetusketch.iteration.chapters';
const MIGRATION_VERSION_KEY = 'hetusketch.iteration.chapters.migrated.v1';
const MIGRATION_VERSION = '1';

export async function migrateLegacyChapters(projects: ProjectManifest[] = []): Promise<LegacyChapterMigrationResult> {
  if (localStorage.getItem(MIGRATION_VERSION_KEY) === MIGRATION_VERSION) {
    return { migrated: false, projectCount: 0, volumeCount: 0, chapterCount: 0 };
  }

  const legacyChapters = readLegacyChapters();
  if (legacyChapters.length === 0) {
    localStorage.setItem(MIGRATION_VERSION_KEY, MIGRATION_VERSION);
    return { migrated: false, projectCount: 0, volumeCount: 0, chapterCount: 0 };
  }

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map<string, LegacyChapterNode[]>();
  for (const item of legacyChapters) {
    if (!item.projectId || !item.id || !item.title || !item.kind) continue;
    grouped.set(item.projectId, [...(grouped.get(item.projectId) ?? []), item]);
  }

  let volumeCount = 0;
  let chapterCount = 0;

  for (const [projectId, items] of grouped) {
    const legacyBook = items.find((item) => item.kind === 'book');
    const project = projectsById.get(projectId) ?? {
      id: projectId,
      name: legacyBook?.title ?? projectId,
      type: 'original' as const,
      summary: ''
    };
    await ensureBookForProject(project, legacyBook?.title);
    const initialTree = await window.hetuSketch.chapters.listTree(projectId);
    const existingVolumeIds = new Set(initialTree.volumes.map((volume) => volume.id));
    const existingChapterIds = new Set(initialTree.chapters.map((chapter) => chapter.id));

    const legacyVolumes = items
      .filter((item) => item.kind === 'volume')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const volume of legacyVolumes) {
      const input = {
        bookId: projectId,
        id: volume.id,
        title: volume.title,
        order: normalizePersistedOrder(volume.order),
        targetWords: volume.targetWords,
        status: toVolumeStatus(volume.status)
      };
      if (existingVolumeIds.has(volume.id)) {
        await window.hetuSketch.chapters.updateVolume(input);
      } else {
        await window.hetuSketch.chapters.createVolume(input);
        existingVolumeIds.add(volume.id);
      }
      volumeCount += 1;
    }

    let tree = await window.hetuSketch.chapters.listTree(projectId);
    let fallbackVolume = tree.volumes[0];
    if (!fallbackVolume) {
      fallbackVolume = await window.hetuSketch.chapters.createVolume({ bookId: projectId, title: '第一卷', status: 'drafting', order: 1 });
      volumeCount += 1;
    }

    const volumeIds = new Set((await window.hetuSketch.chapters.listTree(projectId)).volumes.map((volume) => volume.id));
    const legacyChaptersOnly = items
      .filter((item) => item.kind === 'chapter')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const chapter of legacyChaptersOnly) {
      const volumeId = chapter.parentId && volumeIds.has(chapter.parentId) ? chapter.parentId : fallbackVolume.id;
      const input = {
        bookId: projectId,
        id: chapter.id,
        volumeId,
        title: chapter.title,
        content: chapter.content ?? '',
        order: normalizePersistedOrder(chapter.order),
        targetWords: chapter.targetWords,
        status: chapter.status ?? 'not_started',
        relatedPlotIds: chapter.plotIds ?? []
      };
      if (existingChapterIds.has(chapter.id)) {
        await window.hetuSketch.chapters.updateChapter(input);
      } else {
        await window.hetuSketch.chapters.createChapter(input);
        existingChapterIds.add(chapter.id);
      }
      chapterCount += 1;
    }

    tree = await window.hetuSketch.chapters.listTree(projectId);
    await ensureTreeHasDefaultVolume(projectId, tree);
  }

  localStorage.setItem(MIGRATION_VERSION_KEY, MIGRATION_VERSION);
  return { migrated: true, projectCount: grouped.size, volumeCount, chapterCount };
}

export async function listChapterNodesForProject(project: ProjectLike): Promise<ChapterNode[]> {
  await ensureBookForProject(project);
  const tree = await ensureTreeHasDefaultVolume(project.id, await window.hetuSketch.chapters.listTree(project.id));
  return toChapterNodes(tree, project.id);
}

export async function createVolumeNode(project: ProjectLike, title: string): Promise<ChapterNode> {
  await ensureBookForProject(project);
  const tree = await window.hetuSketch.chapters.listTree(project.id);
  const volume = await window.hetuSketch.chapters.createVolume({
    bookId: project.id,
    title,
    status: 'drafting',
    order: tree.volumes.length + 1
  });
  return toVolumeChapterNode(volume, tree.book.id);
}

export async function createChapterNode(project: ProjectLike, title: string, volumeId?: string): Promise<ChapterNode> {
  await ensureBookForProject(project);
  const tree = await ensureTreeHasDefaultVolume(project.id, await window.hetuSketch.chapters.listTree(project.id));
  const targetVolume = tree.volumes.find((volume) => volume.id === volumeId) ?? tree.volumes[tree.volumes.length - 1];
  if (!targetVolume) {
    throw new Error('创建章节失败：缺少分卷');
  }
  const siblings = tree.chapters.filter((chapter) => chapter.volumeId === targetVolume.id);
  const chapter = await window.hetuSketch.chapters.createChapter({
    bookId: project.id,
    volumeId: targetVolume.id,
    title,
    status: 'drafting',
    order: siblings.length + 1
  });
  return toPersistedChapterNode(chapter, project.id);
}

export async function updateChapterNode(node: ChapterNode, changes: Partial<ChapterNode>): Promise<ChapterNode> {
  if (node.kind === 'book') {
    const book = await window.hetuSketch.books.update({
      id: node.bookId,
      title: changes.title,
      targetWords: changes.targetWords,
      status: changes.status ? toBookStatus(changes.status) : undefined
    });
    return toBookChapterNode(book, node.projectId);
  }

  if (node.kind === 'volume') {
    const volume = await window.hetuSketch.chapters.updateVolume({
      bookId: node.bookId,
      id: node.id,
      title: changes.title,
      order: changes.order,
      targetWords: changes.targetWords,
      status: changes.status ? toVolumeStatus(changes.status) : undefined
    });
    return toVolumeChapterNode(volume, node.projectId);
  }

  const chapter = await window.hetuSketch.chapters.updateChapter({
    bookId: node.bookId,
    id: node.id,
    volumeId: changes.volumeId ?? changes.parentId,
    title: changes.title,
    content: changes.content,
    order: changes.order,
    targetWords: changes.targetWords,
    status: changes.status,
    relatedPlotIds: changes.plotIds
  });
  return toPersistedChapterNode(chapter, node.projectId);
}

export async function deleteChapterNode(node: ChapterNode): Promise<void> {
  if (node.kind === 'book') {
    await window.hetuSketch.books.delete(node.bookId);
    return;
  }
  if (node.kind === 'volume') {
    await window.hetuSketch.chapters.deleteVolume(node.bookId, node.id);
    return;
  }
  await window.hetuSketch.chapters.deleteChapter(node.bookId, node.id);
}

export async function reorderChapterNode(bookId: string, nodes: ChapterNode[], sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<ChapterNode[]> {
  const source = nodes.find((item) => item.id === sourceId);
  const target = nodes.find((item) => item.id === targetId);
  if (!source || !target || source.id === target.id) return nodes;

  if (source.kind === 'chapter') {
    if (position === 'inside' && target.kind !== 'volume') return nodes;
    if (position !== 'inside' && target.kind !== 'chapter') return nodes;
    await reorderPersistedChapter(source, target, position);
    return listChapterNodesForProject({ id: bookId, name: bookId });
  }

  if (source.kind === 'volume') {
    if (position === 'inside' || (target.kind !== 'volume' && target.kind !== 'book')) return nodes;
    await reorderPersistedVolume(source, target, nodes, position);
    return listChapterNodesForProject({ id: bookId, name: bookId });
  }

  return nodes;
}

export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[a-zA-Z0-9_]+/g) ?? []).length;
  return cjk + words;
}

async function reorderPersistedChapter(source: ChapterNode, target: ChapterNode, position: 'before' | 'after' | 'inside'): Promise<void> {
  const tree = await window.hetuSketch.chapters.listTree(source.bookId);
  const sourceChapter = tree.chapters.find((chapter) => chapter.id === source.id);
  if (!sourceChapter) return;

  const newVolumeId = position === 'inside' ? target.id : target.volumeId ?? target.parentId;
  if (!newVolumeId) return;

  const newSiblings = tree.chapters
    .filter((chapter) => chapter.volumeId === newVolumeId && chapter.id !== source.id)
    .sort((a, b) => a.order - b.order);
  let insertIndex = position === 'inside' ? newSiblings.length : newSiblings.findIndex((chapter) => chapter.id === target.id);
  if (position === 'after') insertIndex += 1;
  if (insertIndex < 0) insertIndex = newSiblings.length;
  newSiblings.splice(insertIndex, 0, { ...sourceChapter, volumeId: newVolumeId });

  const oldSiblings = sourceChapter.volumeId === newVolumeId
    ? []
    : tree.chapters.filter((chapter) => chapter.volumeId === sourceChapter.volumeId && chapter.id !== source.id).sort((a, b) => a.order - b.order);

  await Promise.all([
    ...newSiblings.map((chapter, index) => window.hetuSketch.chapters.updateChapter({ bookId: source.bookId, id: chapter.id, volumeId: newVolumeId, order: index + 1 })),
    ...oldSiblings.map((chapter, index) => window.hetuSketch.chapters.updateChapter({ bookId: source.bookId, id: chapter.id, volumeId: sourceChapter.volumeId, order: index + 1 }))
  ]);
}

async function reorderPersistedVolume(source: ChapterNode, target: ChapterNode, nodes: ChapterNode[], position: 'before' | 'after' | 'inside'): Promise<void> {
  const siblings = nodes.filter((item) => item.kind === 'volume' && item.id !== source.id).sort((a, b) => a.order - b.order);
  let insertIndex = target.kind === 'book' ? siblings.length : siblings.findIndex((item) => item.id === target.id);
  if (position === 'after' && target.kind !== 'book') insertIndex += 1;
  if (insertIndex < 0) insertIndex = siblings.length;
  siblings.splice(insertIndex, 0, source);

  await Promise.all(siblings.map((volume, index) => window.hetuSketch.chapters.updateVolume({
    bookId: source.bookId,
    id: volume.id,
    order: index + 1
  })));
}

async function ensureBookForProject(project: ProjectLike, fallbackTitle?: string): Promise<BookManifest> {
  try {
    return await window.hetuSketch.books.get(project.id);
  } catch {
    return window.hetuSketch.books.create({
      id: project.id,
      title: fallbackTitle?.trim() || project.name,
      type: project.type ?? 'original',
      summary: project.summary ?? '',
      status: 'drafting'
    });
  }
}

async function ensureTreeHasDefaultVolume(bookId: string, tree: BookTree): Promise<BookTree> {
  if (tree.volumes.length > 0) return tree;
  await window.hetuSketch.chapters.createVolume({ bookId, title: '第一卷', status: 'drafting', order: 1 });
  return window.hetuSketch.chapters.listTree(bookId);
}

function toChapterNodes(tree: BookTree, projectId: string): ChapterNode[] {
  return [
    toBookChapterNode(tree.book, projectId),
    ...tree.volumes.map((volume) => toVolumeChapterNode(volume, projectId)),
    ...tree.chapters.map((chapter) => toPersistedChapterNode(chapter, projectId))
  ].sort((a, b) => a.order - b.order);
}

function toBookChapterNode(book: BookManifest, projectId: string): ChapterNode {
  return {
    id: book.id,
    projectId,
    bookId: book.id,
    kind: 'book',
    title: book.title,
    status: fromBookStatus(book.status),
    content: '',
    order: 0,
    targetWords: book.targetWords,
    plotIds: [],
    createdAt: book.createdAt,
    updatedAt: book.updatedAt
  };
}

function toVolumeChapterNode(volume: VolumeNode, projectId: string): ChapterNode {
  return {
    id: volume.id,
    projectId,
    bookId: volume.bookId,
    parentId: volume.bookId,
    kind: 'volume',
    title: volume.title,
    status: fromVolumeStatus(volume.status),
    content: '',
    order: volume.order,
    targetWords: volume.targetWords,
    plotIds: [],
    createdAt: volume.createdAt,
    updatedAt: volume.updatedAt,
    actualWords: volume.actualWords
  };
}

function toPersistedChapterNode(chapter: PersistedChapterNode, projectId: string): ChapterNode {
  return {
    id: chapter.id,
    projectId,
    bookId: chapter.bookId,
    parentId: chapter.volumeId,
    volumeId: chapter.volumeId,
    kind: 'chapter',
    title: chapter.title,
    status: chapter.status,
    content: chapter.content,
    order: chapter.order,
    targetWords: chapter.targetWords,
    plotIds: chapter.relatedPlotIds,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
    actualWords: chapter.actualWords
  };
}

function toBookStatus(status: ChapterStatus): BookStatus {
  if (status === 'done') return 'completed';
  if (status === 'locked') return 'archived';
  if (status === 'not_started') return 'planning';
  return status;
}

function fromBookStatus(status: BookStatus): ChapterStatus {
  if (status === 'completed') return 'done';
  if (status === 'archived') return 'locked';
  if (status === 'planning') return 'not_started';
  return status;
}

function toVolumeStatus(status?: ChapterStatus): VolumeStatus | undefined {
  if (!status) return undefined;
  if (status === 'done') return 'completed';
  if (status === 'not_started') return 'planning';
  return status;
}

function fromVolumeStatus(status: VolumeStatus): ChapterStatus {
  if (status === 'completed') return 'done';
  if (status === 'planning') return 'not_started';
  return status;
}

function normalizePersistedOrder(order?: number): number {
  return Math.max(1, (order ?? 0) + 1);
}

function readLegacyChapters(): LegacyChapterNode[] {
  try {
    const raw = localStorage.getItem(LEGACY_CHAPTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as LegacyChapterNode[] : [];
  } catch {
    return [];
  }
}
