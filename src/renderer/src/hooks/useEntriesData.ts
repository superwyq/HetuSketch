import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Form, message } from 'antd';
import type { EntryCreateInput, EntryType, PlotStatus, ProjectEntry, SearchResultItem } from '@shared/storageTypes';
import type { ProjectManifest } from '@shared/storageTypes';

interface UseEntriesDataOptions {
  type: EntryType;
  selectedProject?: ProjectManifest;
  sidebarKeyword: string;
  locationSearch: string;
  characterRoleFilter: string;
  worldCategoryFilter: string;
  plotStatusFilter: PlotStatus | 'all';
  buildPayload: (values: EntryCreateInput, type: EntryType) => EntryCreateInput;
  entryToForm: (entry: ProjectEntry) => Record<string, unknown>;
  onChanged: () => void;
}

export function useEntriesData({
  type,
  selectedProject,
  sidebarKeyword,
  locationSearch,
  characterRoleFilter,
  worldCategoryFilter,
  plotStatusFilter,
  buildPayload,
  entryToForm,
  onChanged
}: UseEntriesDataOptions): {
  form: ReturnType<typeof Form.useForm<EntryCreateInput>>[0];
  items: ProjectEntry[];
  activeEntry?: ProjectEntry;
  setActiveEntry: Dispatch<SetStateAction<ProjectEntry | undefined>>;
  editingEntry?: ProjectEntry;
  createOpen: boolean;
  setCreateOpen: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  saving: boolean;
  error?: string;
  filteredItems: ProjectEntry[];
  roleQuery: string;
  categoryQuery: string;
  statusQuery: PlotStatus | 'all';
  loadItems: () => Promise<void>;
  saveEntry: (values: EntryCreateInput) => Promise<void>;
  editEntry: (entry: ProjectEntry) => Promise<void>;
  cancelEdit: () => void;
  deleteEntry: (entry: ProjectEntry) => Promise<void>;
  markResolved: (entry: ProjectEntry) => Promise<void>;
} {
  const [form] = Form.useForm<EntryCreateInput>();
  const [items, setItems] = useState<ProjectEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<ProjectEntry>();
  const [editingEntry, setEditingEntry] = useState<ProjectEntry>();
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const query = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const roleQuery = query.get('role') ?? 'all';
  const categoryQuery = query.get('category') ?? 'all';
  const statusQuery = (query.get('status') as PlotStatus | null) ?? 'all';
  const entryQuery = query.get('entry');

  const loadItems = useCallback(async (): Promise<void> => {
    if (!selectedProject) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const summaries = await window.hetuSketch.entries.list({ projectId: selectedProject.id, type, limit: 100 });
      setItems(summaries.map((item) => summaryToEntry(item, type)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '条目加载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, type]);

  useEffect(() => {
    form.resetFields();
    setActiveEntry(undefined);
    setEditingEntry(undefined);
    void loadItems();
  }, [form, loadItems]);

  const hydrateEntry = useCallback(async (entry: ProjectEntry): Promise<ProjectEntry> => {
    if (entry.content || Object.keys(entry.customFields).length > 0 || entry.relations.length > 0) return entry;
    return window.hetuSketch.entries.get(entry.projectId, entry.type, entry.id);
  }, []);

  const saveEntry = useCallback(async (values: EntryCreateInput): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择或创建作品');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(values, type);
      if (editingEntry) {
        const updated = await window.hetuSketch.entries.update({
          projectId: selectedProject.id,
          type,
          entryId: editingEntry.id,
          changes: payload
        });
        setActiveEntry(updated);
        setEditingEntry(undefined);
        message.success('设定条目已更新');
      } else {
        await window.hetuSketch.entries.create({ ...payload, projectId: selectedProject.id, type });
        message.success('设定条目已保存');
      }
      form.resetFields();
      setCreateOpen(false);
      await loadItems();
      onChanged();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [buildPayload, editingEntry, form, loadItems, onChanged, selectedProject, type]);

  const editEntry = useCallback(async (entry: ProjectEntry): Promise<void> => {
    const fullEntry = await hydrateEntry(entry);
    setEditingEntry(fullEntry);
    setActiveEntry(fullEntry);
    setCreateOpen(true);
    form.setFieldsValue(entryToForm(fullEntry) as Partial<EntryCreateInput>);
  }, [entryToForm, form, hydrateEntry]);

  const cancelEdit = useCallback((): void => {
    setEditingEntry(undefined);
    form.resetFields();
  }, [form]);

  const deleteEntry = useCallback(async (entry: ProjectEntry): Promise<void> => {
    await window.hetuSketch.entries.delete(entry.projectId, type, entry.id);
    if (activeEntry?.id === entry.id) {
      setActiveEntry(undefined);
    }
    if (editingEntry?.id === entry.id) {
      cancelEdit();
    }
    message.success('条目已删除');
    await loadItems();
    onChanged();
  }, [activeEntry?.id, cancelEdit, editingEntry?.id, loadItems, onChanged, type]);

  const markResolved = useCallback(async (entry: ProjectEntry): Promise<void> => {
    if (entry.type !== 'plot') return;
    const updated = await window.hetuSketch.entries.update({ projectId: entry.projectId, type: 'plot', entryId: entry.id, changes: { status: 'resolved' } });
    setActiveEntry(updated);
    message.success('伏笔已标记为已回收');
    await loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!entryQuery) return;
    const nextActive = items.find((entry) => entry.id === entryQuery);
    if (nextActive) {
      void hydrateEntry(nextActive).then(setActiveEntry).catch(() => setActiveEntry(nextActive));
    }
  }, [entryQuery, hydrateEntry, items]);

  const filteredItems = useMemo(() => items.filter((entry) => {
    const keyword = sidebarKeyword.trim().toLowerCase();
    if (keyword && !`${entry.title} ${entry.summary ?? ''} ${entry.tags.join(' ')}`.toLowerCase().includes(keyword)) {
      return false;
    }
    const roleFilter = roleQuery !== 'all' ? roleQuery : characterRoleFilter;
    const categoryFilter = categoryQuery !== 'all' ? categoryQuery : worldCategoryFilter;
    const statusFilter = statusQuery !== 'all' ? statusQuery : plotStatusFilter;
    if (type === 'character' && roleFilter !== 'all') {
      return entry.type === 'character' && entry.role === roleFilter;
    }
    if (type === 'world' && categoryFilter !== 'all') {
      return entry.type === 'world' && entry.category === categoryFilter;
    }
    if (type === 'plot' && statusFilter !== 'all') {
      return entry.type === 'plot' && entry.status === statusFilter;
    }
    return true;
  }), [categoryQuery, characterRoleFilter, items, plotStatusFilter, roleQuery, sidebarKeyword, statusQuery, type, worldCategoryFilter]);

  const setHydratedActiveEntry: Dispatch<SetStateAction<ProjectEntry | undefined>> = useCallback((next) => {
    if (typeof next === 'function') {
      setActiveEntry((current) => next(current));
      return;
    }
    if (next) {
      void hydrateEntry(next).then(setActiveEntry).catch(() => setActiveEntry(next));
      return;
    }
    setActiveEntry(undefined);
  }, [hydrateEntry]);

  return {
    form,
    items,
    activeEntry,
    setActiveEntry: setHydratedActiveEntry,
    editingEntry,
    createOpen,
    setCreateOpen,
    loading,
    saving,
    error,
    filteredItems,
    roleQuery,
    categoryQuery,
    statusQuery,
    loadItems,
    saveEntry,
    editEntry,
    cancelEdit,
    deleteEntry,
    markResolved
  };
}

function summaryToEntry(item: SearchResultItem, type: EntryType): ProjectEntry {
  const base = {
    id: item.id,
    projectId: item.projectId,
    type,
    title: item.title,
    summary: item.excerpt,
    content: '',
    tags: [],
    relations: [],
    customFields: {},
    createdAt: item.updatedAt,
    updatedAt: item.updatedAt,
    format: 'json' as const
  };
  if (type === 'character') return { ...base, type: 'character', role: 'other', personalityTags: [], redLines: [] };
  if (type === 'world') return { ...base, type: 'world', category: 'other', rules: [] };
  return {
    ...base,
    type: 'plot',
    inspirationType: item.metadata?.inspirationType ?? 'plot_setting',
    relatedProjectIds: item.metadata?.relatedProjectIds ? item.metadata.relatedProjectIds.split(',').filter(Boolean) : [],
    status: 'open',
    relatedCharacters: []
  };
}
