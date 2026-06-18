import { create } from 'zustand';
import type { ProjectManifest } from '@shared/storageTypes';

export type ThemeMode = 'light' | 'dark';

export interface AppState {
  themeMode: ThemeMode;
  selectedProject?: ProjectManifest;
  searchKeyword: string;
  sidebarCollapsed: boolean;
  mainPinned: boolean;
  guideDismissed: boolean;
  setThemeMode: (themeMode: ThemeMode) => void;
  setSelectedProject: (project?: ProjectManifest) => void;
  setSearchKeyword: (keyword: string) => void;
  setMainPinned: (pinned: boolean) => void;
  dismissGuide: () => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  themeMode: 'light',
  selectedProject: undefined,
  searchKeyword: '',
  sidebarCollapsed: false,
  mainPinned: false,
  guideDismissed: false,
  setThemeMode: (themeMode) => set({ themeMode }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setSearchKeyword: (searchKeyword) => set({ searchKeyword }),
  setMainPinned: (mainPinned) => set({ mainPinned }),
  dismissGuide: () => set({ guideDismissed: true }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}));
