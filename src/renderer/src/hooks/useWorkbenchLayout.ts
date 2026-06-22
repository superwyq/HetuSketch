import { useCallback, useEffect, useState } from 'react';

export interface WorkbenchLayoutState {
  primaryWidth: number;
  secondaryWidth: number;
  panelHeight: number;
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  editorSplit: 'single' | 'vertical' | 'grid';
  editorVerticalRatio: number;
  editorGridRowRatio: number;
  editorGridColumnRatio: number;
}

export const defaultWorkbenchLayout: WorkbenchLayoutState = {
  primaryWidth: 250,
  secondaryWidth: 250,
  panelHeight: 200,
  primaryVisible: true,
  secondaryVisible: false,
  panelVisible: true,
  editorSplit: 'single',
  editorVerticalRatio: 0.64,
  editorGridRowRatio: 0.52,
  editorGridColumnRatio: 0.5
};

export function useWorkbenchLayout(storageKey: string): {
  layout: WorkbenchLayoutState;
  updateLayout: (changes: Partial<WorkbenchLayoutState>) => void;
} {
  const [layout, setLayout] = useState<WorkbenchLayoutState>(() => readWorkbenchLayout(storageKey));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  }, [layout, storageKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setLayout((current) => ({ ...current, primaryVisible: !current.primaryVisible }));
      }
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setLayout((current) => ({ ...current, panelVisible: !current.panelVisible }));
      }
      if (event.key === '\\') {
        event.preventDefault();
        setLayout((current) => ({ ...current, editorSplit: current.editorSplit === 'single' ? 'vertical' : 'single' }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const updateLayout = useCallback((changes: Partial<WorkbenchLayoutState>): void => {
    setLayout((current) => ({ ...current, ...changes }));
  }, []);

  return { layout, updateLayout };
}

function readWorkbenchLayout(key: string): WorkbenchLayoutState {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...defaultWorkbenchLayout, ...JSON.parse(raw) } as WorkbenchLayoutState : defaultWorkbenchLayout;
  } catch {
    return defaultWorkbenchLayout;
  }
}
