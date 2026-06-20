import { create } from 'zustand';
import type { ProjectManifest } from '@shared/storageTypes';

export type ThemeMode = 'light' | 'dark';

export interface FontSettings {
  family: string;
  size: number;
  color: string;
}

export interface AppState {
  themeMode: ThemeMode;
  selectedProject?: ProjectManifest;
  searchKeyword: string;
  sidebarCollapsed: boolean;
  mainPinned: boolean;
  guideDismissed: boolean;
  sidebarFont: FontSettings;
  editorFont: FontSettings;
  systemFonts: string[];
  systemFontsLoaded: boolean;
  setThemeMode: (themeMode: ThemeMode) => void;
  setSelectedProject: (project?: ProjectManifest) => void;
  setSearchKeyword: (keyword: string) => void;
  setMainPinned: (pinned: boolean) => void;
  dismissGuide: () => void;
  toggleSidebar: () => void;
  setSidebarFont: (settings: FontSettings) => void;
  setEditorFont: (settings: FontSettings) => void;
  loadSystemFonts: () => void;
  sidebarRevision: number;
  refreshSidebar: () => void;
  tabNameMap: Record<string, string>;
  updateTabNameMap: (chapters: { id: string; title?: string }[], entries: { id: string; title?: string }[]) => void;
}

const FONT_STORAGE_KEY = 'hetusketch.workbench.fonts.v1';
const THEME_STORAGE_KEY = 'hetusketch.workbench.theme.v1';

const defaultFontSettings = readFontSettings();

function readThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // ignore
  }
  return 'light';
}

export const useAppStore = create<AppState>((set, get) => ({
  themeMode: readThemeMode(),
  selectedProject: undefined,
  searchKeyword: '',
  sidebarCollapsed: false,
  mainPinned: false,
  guideDismissed: false,
  sidebarFont: defaultFontSettings.sidebar,
  editorFont: defaultFontSettings.editor,
  systemFonts: [],
  systemFontsLoaded: false,
  sidebarRevision: 0,
  refreshSidebar: () => set((state) => ({ sidebarRevision: state.sidebarRevision + 1 })),
  tabNameMap: {},
  updateTabNameMap: (chapters, entries) => {
    const map: Record<string, string> = {};
    for (const chapter of chapters) {
      if (chapter.title) map[chapter.id] = chapter.title;
    }
    for (const entry of entries) {
      if (entry.title) map[entry.id] = entry.title;
    }
    set({ tabNameMap: map });
  },
  setThemeMode: (themeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // ignore
    }
    set({ themeMode });
  },
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
  setMainPinned: (mainPinned) => set({ mainPinned }),
  dismissGuide: () => set({ guideDismissed: true }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarFont: (sidebarFont) => {
    set({ sidebarFont });
    persistFontSettings({ ...get().editorFont }, sidebarFont);
  },
  setEditorFont: (editorFont) => {
    set({ editorFont });
    persistFontSettings(editorFont, { ...get().sidebarFont });
  },
  loadSystemFonts: () => {
    if (get().systemFontsLoaded) return;
    const api = typeof window !== 'undefined' ? window.hetuSketch : undefined;
    if (!api || !api.system || typeof api.system.fonts !== 'function') {
      set({ systemFonts: [], systemFontsLoaded: true });
      return;
    }
    void api.system.fonts()
      .then((fonts) => set({ systemFonts: fonts.slice(0, 300), systemFontsLoaded: true }))
      .catch(() => set({ systemFonts: [], systemFontsLoaded: true }));
  }
}));

function readFontSettings(): { sidebar: FontSettings; editor: FontSettings } {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { sidebar?: Partial<FontSettings>; editor?: Partial<FontSettings> }) : {};
    return {
      sidebar: { family: parsed.sidebar?.family ?? '"霞鹜文楷", "Microsoft YaHei", serif', size: parsed.sidebar?.size ?? 13, color: parsed.sidebar?.color ?? '#f8ead2' },
      editor: { family: parsed.editor?.family ?? '"霞鹜文楷", "Microsoft YaHei", serif', size: parsed.editor?.size ?? 16, color: parsed.editor?.color ?? '#2b2118' }
    };
  } catch {
    return {
      sidebar: { family: '"霞鹜文楷", "Microsoft YaHei", serif', size: 13, color: '#f8ead2' },
      editor: { family: '"霞鹜文楷", "Microsoft YaHei", serif', size: 16, color: '#2b2118' }
    };
  }
}

function persistFontSettings(editor: FontSettings, sidebar: FontSettings): void {
  localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ editor, sidebar }));
}
