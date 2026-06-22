import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import type { ProjectManifest } from '@shared/storageTypes';
import {
  listChapterNodesForProject,
  type ChapterNode
} from '../chapterStorage';

interface UseWritingStudioChaptersOptions {
  selectedProject?: ProjectManifest;
  locationSearch: string;
}

export function useWritingStudioChapters({ selectedProject, locationSearch }: UseWritingStudioChaptersOptions): {
  chapters: ChapterNode[];
  setChapters: React.Dispatch<React.SetStateAction<ChapterNode[]>>;
  activeId?: string;
  setActiveId: React.Dispatch<React.SetStateAction<string | undefined>>;
  activeChapter?: ChapterNode;
  reload: () => Promise<void>;
} {
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [activeId, setActiveId] = useState<string>();

  const reload = useCallback(async (): Promise<void> => {
    if (!selectedProject) {
      setChapters([]);
      setActiveId(undefined);
      return;
    }
    try {
      const next = await listChapterNodesForProject(selectedProject);
      const firstChapter = next.find((item) => item.kind === 'chapter');
      const book = next.find((item) => item.kind === 'book');
      setChapters(next);
      setActiveId((current) => current ?? firstChapter?.id ?? book?.id);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '加载章节失败');
    }
  }, [selectedProject]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const chapterId = new URLSearchParams(locationSearch).get('chapter');
    if (chapterId && chapters.some((item) => item.id === chapterId)) {
      setActiveId(chapterId);
    }
  }, [chapters, locationSearch]);

  const activeChapter = useMemo(() => chapters.find((item) => item.id === activeId), [activeId, chapters]);

  return { chapters, setChapters, activeId, setActiveId, activeChapter, reload };
}
