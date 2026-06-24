import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DragOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  ForkOutlined,
  PlusOutlined,
  RedoOutlined,
  RobotOutlined,
  SaveOutlined,
  SearchOutlined,
  UndoOutlined
} from '@ant-design/icons';
import { Button, Empty, Input, Modal, Progress, Select, Slider, Space, Spin, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import type {
  ChapterNode as PersistedChapterNode,
  Plotboard,
  PlotCard,
  PlotCardType,
  PlotLink,
  PlotLinkType,
  PlotboardGenerationMode,
  PlotboardGenerationResult,
  PlotboardValidationFinding,
  PlotboardValidationResult,
  ProjectEntry,
  SearchResultItem,
  StateDiff,
  StateDeltaOperator,
  StateOwnerType
} from '@shared/storageTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listChapterNodesForProject, type ChapterNode } from '../chapterStorage';
import { useAppStore } from '../store/appStore';

const CARD_WIDTH = 240;
const CARD_HEIGHT = 136;
type MaterialKind = 'character' | 'world' | 'plot' | 'chapter' | 'template';
const CARD_TYPES: PlotCardType[] = ['event', 'dialogue', 'battle', 'clue_setup', 'clue_reinforce', 'clue_payoff', 'transition', 'narration'];
const LINK_TYPES: PlotLinkType[] = ['sequence', 'causal', 'parallel', 'flashback', 'conditional'];
const STATE_OWNERS: StateOwnerType[] = ['character', 'world', 'plot', 'chapter'];
const STATE_OPERATORS: StateDeltaOperator[] = ['set', 'increase', 'decrease', 'append', 'remove'];
const VALIDATION_CATEGORY_LABEL: Record<PlotboardValidationFinding['category'], string> = {
  timeline: '时间线',
  'character-state': '角色状态',
  'behavior-redline': '行为红线',
  'world-rule': '世界规则',
  'plot-thread': '伏笔顺序',
  'chapter-continuity': '章节衔接'
};
const GENERATION_MODES: Array<{ value: PlotboardGenerationMode; label: string }> = [
  { value: 'single_card', label: '单卡' },
  { value: 'selection', label: '选区' },
  { value: 'full_chapter', label: '全章' },
  { value: 'continue', label: '续写' },
  { value: 'rewrite', label: '重写' }
];

const CARD_TYPE_LABEL: Record<PlotCardType, string> = {
  event: '事件',
  dialogue: '对话',
  battle: '战斗',
  clue_setup: '线索埋设',
  clue_reinforce: '线索强化',
  clue_payoff: '线索回收',
  transition: '转场',
  narration: '叙述'
};

const LINK_TYPE_LABEL: Record<PlotLinkType, string> = {
  sequence: '顺序',
  causal: '因果',
  parallel: '并行',
  flashback: '插叙',
  conditional: '条件'
};

type TemplateId = 'three_act' | 'mystery_reveal' | 'ensemble_cross';
type PlotClueUsage = 'setup' | 'reinforce' | 'payoff';

interface MaterialItem {
  id: string;
  kind: MaterialKind;
  title: string;
  excerpt?: string;
  metadata?: Record<string, string>;
}

interface DragMaterialPayload {
  kind: MaterialKind;
  id: string;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface SelectionBox {
  start: CanvasPoint;
  current: CanvasPoint;
}

interface DragState {
  cardIds: string[];
  startClient: CanvasPoint;
  originalCards: Record<string, CanvasPoint>;
  before: Plotboard;
}

interface PanState {
  startClient: CanvasPoint;
  startViewport: CanvasPoint;
}

interface MaterialLibraryState {
  character: MaterialItem[];
  world: MaterialItem[];
  plot: MaterialItem[];
  chapter: MaterialItem[];
  template: MaterialItem[];
}

interface PlotboardTemplate {
  id: TemplateId;
  title: string;
  cards: Array<Pick<PlotCard, 'title' | 'fact' | 'cardType' | 'x' | 'y'> & Partial<Pick<PlotCard, 'timecode' | 'narrativeTone' | 'stateDeltas' | 'generationInstruction'>>>;
  links: Array<{ sourceIndex: number; targetIndex: number; linkType: PlotLinkType; motivation?: string; condition?: string }>;
}

interface PovAxisGroup {
  povId: string;
  povName: string;
  cards: PlotCard[];
  changedFields: string[];
}

const PLOTBOARD_TEMPLATES: Record<TemplateId, PlotboardTemplate> = {
  three_act: {
    id: 'three_act',
    title: '三幕式推进',
    cards: [
      { title: '第一幕：诱因与目标', fact: '主角遭遇打破日常的诱因，明确本章节必须解决的目标。', cardType: 'event', timecode: 'Act 1', narrativeTone: ['铺垫', '牵引'], x: 0, y: 0 },
      { title: '第二幕：对抗升级', fact: '阻力出现并升级，主角的选择带来不可逆代价。', cardType: 'event', timecode: 'Act 2', narrativeTone: ['紧张', '推进'], x: 320, y: 0 },
      { title: '第三幕：转折与余波', fact: '核心冲突得到阶段性结果，并抛出下一章的余波或钩子。', cardType: 'transition', timecode: 'Act 3', narrativeTone: ['转折', '余韵'], x: 640, y: 0 }
    ],
    links: [
      { sourceIndex: 0, targetIndex: 1, linkType: 'sequence', motivation: '目标推动对抗升级' },
      { sourceIndex: 1, targetIndex: 2, linkType: 'causal', motivation: '代价触发结局转折' }
    ]
  },
  mystery_reveal: {
    id: 'mystery_reveal',
    title: '推理揭示链',
    cards: [
      { title: '异常现场', fact: '展示一个与常识不符的异常现象，提出本章谜题。', cardType: 'clue_setup', timecode: 'Reveal 1', narrativeTone: ['悬疑'], x: 0, y: 0 },
      { title: '误导证词', fact: '给出可信但不完整的证词或线索，让读者形成错误解释。', cardType: 'clue_reinforce', timecode: 'Reveal 2', narrativeTone: ['误导'], x: 300, y: -90 },
      { title: '关键证据', fact: '出现能推翻误导解释的关键证据，角色重新组织因果链。', cardType: 'clue_reinforce', timecode: 'Reveal 3', narrativeTone: ['冷静', '逼近真相'], x: 600, y: 0 },
      { title: '真相回收', fact: '揭示真正作案/冲突机制，并回收此前埋设的核心伏笔。', cardType: 'clue_payoff', timecode: 'Reveal 4', narrativeTone: ['反转', '释然'], x: 900, y: 0 }
    ],
    links: [
      { sourceIndex: 0, targetIndex: 1, linkType: 'sequence', motivation: '现场引出证词' },
      { sourceIndex: 1, targetIndex: 2, linkType: 'causal', motivation: '误导与证据矛盾' },
      { sourceIndex: 2, targetIndex: 3, linkType: 'causal', motivation: '关键证据推出真相' }
    ]
  },
  ensemble_cross: {
    id: 'ensemble_cross',
    title: '群像交叉线',
    cards: [
      { title: 'A 线：主动行动', fact: '角色 A 为自己的目标独立行动，制造第一条剧情压力。', cardType: 'event', timecode: 'Line A', narrativeTone: ['行动'], x: 0, y: -130 },
      { title: 'B 线：隐秘选择', fact: '角色 B 在另一地点做出隐秘选择，改变局势变量。', cardType: 'event', timecode: 'Line B', narrativeTone: ['克制'], x: 0, y: 130 },
      { title: '交叉影响', fact: 'A 线与 B 线的信息或后果发生交叉，角色意识到彼此行动的影响。', cardType: 'dialogue', timecode: 'Cross', narrativeTone: ['碰撞'], x: 360, y: 0 },
      { title: '群像汇合', fact: '多名角色在同一结果前汇合，形成新的同盟、裂痕或共同危机。', cardType: 'transition', timecode: 'Converge', narrativeTone: ['群像', '收束'], x: 700, y: 0 }
    ],
    links: [
      { sourceIndex: 0, targetIndex: 2, linkType: 'parallel', motivation: 'A 线与 B 线同步推进' },
      { sourceIndex: 1, targetIndex: 2, linkType: 'parallel', motivation: '隐秘选择影响交叉点' },
      { sourceIndex: 2, targetIndex: 3, linkType: 'causal', motivation: '交叉后果迫使众人汇合' }
    ]
  }
};

const EMPTY_MATERIALS: MaterialLibraryState = {
  character: [],
  world: [],
  plot: [],
  chapter: [],
  template: [
    { id: 'three_act', kind: 'template', title: PLOTBOARD_TEMPLATES.three_act.title, excerpt: '起势、对抗、转折，适合从零搭建章节节奏。' },
    { id: 'mystery_reveal', kind: 'template', title: PLOTBOARD_TEMPLATES.mystery_reveal.title, excerpt: '误导、证据、反转、回收，适合悬疑章节。' },
    { id: 'ensemble_cross', kind: 'template', title: PLOTBOARD_TEMPLATES.ensemble_cross.title, excerpt: '多角色并行行动后汇合，适合群像叙事。' }
  ]
};

function clonePlotboard(plotboard: Plotboard): Plotboard {
  return JSON.parse(JSON.stringify(plotboard)) as Plotboard;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createCard(input: Partial<PlotCard> & Pick<PlotCard, 'x' | 'y'>): PlotCard {
  const now = nowIso();
  return {
    cardId: input.cardId ?? `card-${crypto.randomUUID()}`,
    title: input.title ?? '新的剧情卡',
    fact: input.fact ?? '',
    cardType: input.cardType ?? 'event',
    timecode: input.timecode,
    povCharacterId: input.povCharacterId,
    locationWorldEntryId: input.locationWorldEntryId ?? '',
    characterIds: input.characterIds ?? [],
    worldEntryIds: input.worldEntryIds ?? [],
    plotEntryIds: input.plotEntryIds ?? [],
    stateDeltas: input.stateDeltas ?? [],
    narrativeTone: input.narrativeTone ?? [],
    detailLevel: input.detailLevel ?? 3,
    generationInstruction: input.generationInstruction,
    x: input.x,
    y: input.y,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

export function PlotboardPage(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const refreshSidebar = useAppStore((state) => state.refreshSidebar);
  const chapterId = new URLSearchParams(location.search).get('chapter') ?? undefined;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [plotboard, setPlotboard] = useState<Plotboard>();
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [materials, setMaterials] = useState<MaterialLibraryState>(EMPTY_MATERIALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialTab, setMaterialTab] = useState<MaterialKind>('character');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string>();
  const [past, setPast] = useState<Plotboard[]>([]);
  const [future, setFuture] = useState<Plotboard[]>([]);
  const [dragState, setDragState] = useState<DragState>();
  const [panState, setPanState] = useState<PanState>();
  const [selectionBox, setSelectionBox] = useState<SelectionBox>();
  const [linkSourceCardId, setLinkSourceCardId] = useState<string>();
  const [generationMode, setGenerationMode] = useState<PlotboardGenerationMode>('full_chapter');
  const [generationInstruction, setGenerationInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationOutput, setGenerationOutput] = useState('');
  const [generationResult, setGenerationResult] = useState<PlotboardGenerationResult>();
  const [pendingDiffs, setPendingDiffs] = useState<StateDiff[]>([]);
  const [validationResult, setValidationResult] = useState<PlotboardValidationResult>();
  const [validating, setValidating] = useState(false);
  const [highlightCardId, setHighlightCardId] = useState<string>();
  const cancelGenerationRef = useRef(false);

  const activeChapter = useMemo(() => chapters.find((item) => item.id === chapterId), [chapterId, chapters]);
  const selectedCard = useMemo(() => plotboard?.cards.find((card) => selectedCardIds.length === 1 && card.cardId === selectedCardIds[0]), [plotboard?.cards, selectedCardIds]);
  const selectedLink = useMemo(() => plotboard?.links.find((link) => link.linkId === selectedLinkId), [plotboard?.links, selectedLinkId]);
  const propagationHighlightIds = useMemo(() => plotboard ? findCausalPropagationTargets(plotboard, selectedCardIds) : new Set<string>(), [plotboard, selectedCardIds]);
  const materialNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of Object.values(materials)) {
      for (const item of group) map.set(item.id, item.title);
    }
    return map;
  }, [materials]);
  const validationFindingsByCard = useMemo(() => {
    const map = new Map<string, PlotboardValidationFinding[]>();
    for (const finding of validationResult?.findings ?? []) {
      const ids = new Set([finding.cardId, ...(finding.relatedCardIds ?? [])].filter((id): id is string => Boolean(id)));
      for (const id of ids) map.set(id, [...(map.get(id) ?? []), finding]);
    }
    return map;
  }, [validationResult]);
  const selectedCardFindings = useMemo(() => selectedCard ? validationFindingsByCard.get(selectedCard.cardId) ?? [] : [], [selectedCard, validationFindingsByCard]);
  const unresolvedClueCount = useMemo(() => validationResult?.clueStatusHints.filter((hint) => !hint.payoffCardIds.length).length ?? 0, [validationResult]);

  const pushHistory = useCallback((before: Plotboard): void => {
    setPast((current) => [...current.slice(-39), clonePlotboard(before)]);
    setFuture([]);
    setDirty(true);
  }, []);

  const updatePlotboard = useCallback((updater: (current: Plotboard) => Plotboard): void => {
    setPlotboard((current) => {
      if (!current) return current;
      const before = clonePlotboard(current);
      const next = { ...updater(clonePlotboard(current)), updatedAt: nowIso() };
      pushHistory(before);
      return next;
    });
  }, [pushHistory]);

  const savePlotboard = useCallback(async (): Promise<void> => {
    if (!plotboard) return;
    setSaving(true);
    try {
      const saved = await window.hetuSketch.plotboards.save(plotboard);
      setPlotboard(saved);
      setDirty(false);
      refreshSidebar();
      void window.hetuSketch.plotboards.syncIndex(saved.bookId).catch(() => undefined);
      message.success('剧情画布已保存');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存剧情画布失败');
    } finally {
      setSaving(false);
    }
  }, [plotboard, refreshSidebar]);

  useEffect(() => {
    if (!selectedProject || !chapterId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void Promise.all([
      window.hetuSketch.plotboards.open(selectedProject.id, chapterId).catch(() =>
        window.hetuSketch.plotboards.create({ bookId: selectedProject.id, chapterId, projectId: selectedProject.id })
      ),
      listChapterNodesForProject(selectedProject),
      loadMaterials(selectedProject.id)
    ]).then(([loadedPlotboard, loadedChapters, loadedMaterials]) => {
      if (!alive) return;
      setPlotboard(loadedPlotboard);
      setChapters(loadedChapters);
      setMaterials({ ...EMPTY_MATERIALS, ...loadedMaterials, template: EMPTY_MATERIALS.template });
      setSelectedCardIds([]);
      setSelectedLinkId(undefined);
      setPast([]);
      setFuture([]);
      setDirty(false);
    }).catch((reason) => {
      if (alive) message.error(reason instanceof Error ? reason.message : '打开剧情画布失败');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [chapterId, selectedProject]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void savePlotboard();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        redo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const undo = (): void => {
    setPast((currentPast) => {
      if (!plotboard || currentPast.length === 0) return currentPast;
      const previous = currentPast[currentPast.length - 1];
      setFuture((currentFuture) => [clonePlotboard(plotboard), ...currentFuture.slice(0, 39)]);
      setPlotboard(previous);
      setDirty(true);
      return currentPast.slice(0, -1);
    });
  };

  const redo = (): void => {
    setFuture((currentFuture) => {
      if (!plotboard || currentFuture.length === 0) return currentFuture;
      const next = currentFuture[0];
      setPast((currentPast) => [...currentPast.slice(-39), clonePlotboard(plotboard)]);
      setPlotboard(next);
      setDirty(true);
      return currentFuture.slice(1);
    });
  };

  const screenToWorld = (clientX: number, clientY: number): CanvasPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !plotboard) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - plotboard.viewport.x) / plotboard.viewport.zoom,
      y: (clientY - rect.top - plotboard.viewport.y) / plotboard.viewport.zoom
    };
  };

  const addCardAt = (point: CanvasPoint, material?: MaterialItem): void => {
    if (material?.kind === 'template') {
      insertTemplate(material.id as TemplateId, point);
      return;
    }
    const seed = material ? seedCardByMaterial(point, material) : createCard({ x: point.x, y: point.y });
    updatePlotboard((current) => ({ ...current, cards: [...current.cards, seed] }));
    setSelectedCardIds([seed.cardId]);
    setSelectedLinkId(undefined);
  };

  const insertTemplate = (templateId: TemplateId, point?: CanvasPoint): void => {
    const template = PLOTBOARD_TEMPLATES[templateId];
    if (!plotboard || !template) return;
    const basePoint = point ?? { x: (120 - plotboard.viewport.x) / plotboard.viewport.zoom, y: (120 - plotboard.viewport.y) / plotboard.viewport.zoom };
    const createdCards = template.cards.map((templateCard) => createCard({
      ...templateCard,
      cardId: `card-${templateId}-${crypto.randomUUID()}`,
      x: basePoint.x + templateCard.x,
      y: basePoint.y + templateCard.y,
      generationInstruction: templateCard.generationInstruction ?? `来自画布模板：${template.title}`,
      templateIds: [templateId]
    } as Partial<PlotCard> & Pick<PlotCard, 'x' | 'y'>));
    const createdLinks = template.links.map((link) => ({
      linkId: `link-${templateId}-${crypto.randomUUID()}`,
      sourceCardId: createdCards[link.sourceIndex].cardId,
      targetCardId: createdCards[link.targetIndex].cardId,
      linkType: link.linkType,
      motivation: link.motivation,
      condition: link.condition
    } satisfies PlotLink));
    updatePlotboard((current) => ({ ...current, cards: [...current.cards, ...createdCards], links: [...current.links, ...createdLinks] }));
    setSelectedCardIds(createdCards.map((card) => card.cardId));
    setSelectedLinkId(undefined);
    message.success(`已插入“${template.title}”模板`);
  };

  const updateCard = (cardId: string, changes: Partial<PlotCard>): void => {
    updatePlotboard((current) => ({
      ...current,
      cards: current.cards.map((card) => card.cardId === cardId ? { ...card, ...changes, updatedAt: nowIso() } : card)
    }));
  };

  const updateLink = (linkId: string, changes: Partial<PlotLink>): void => {
    updatePlotboard((current) => ({
      ...current,
      links: current.links.map((link) => link.linkId === linkId ? { ...link, ...changes } : link)
    }));
  };

  const deleteSelection = (): void => {
    if (!plotboard || (selectedCardIds.length === 0 && !selectedLinkId)) return;
    const selectedCards = new Set(selectedCardIds);
    updatePlotboard((current) => ({
      ...current,
      cards: current.cards.filter((card) => !selectedCards.has(card.cardId)),
      links: current.links.filter((link) => !selectedCards.has(link.sourceCardId) && !selectedCards.has(link.targetCardId) && link.linkId !== selectedLinkId)
    }));
    setSelectedCardIds([]);
    setSelectedLinkId(undefined);
  };

  const createLink = (sourceCardId: string, targetCardId: string): void => {
    if (!plotboard || sourceCardId === targetCardId) return;
    const exists = plotboard.links.some((link) => link.sourceCardId === sourceCardId && link.targetCardId === targetCardId);
    if (exists) {
      message.info('这两张剧情卡之间已经存在连线');
      return;
    }
    const link: PlotLink = {
      linkId: `link-${crypto.randomUUID()}`,
      sourceCardId,
      targetCardId,
      linkType: 'sequence',
      motivation: ''
    };
    updatePlotboard((current) => ({ ...current, links: [...current.links, link] }));
    setSelectedCardIds([]);
    setSelectedLinkId(link.linkId);
  };

  const bindMaterialToCard = (cardId: string, material: MaterialItem): void => {
    if (material.kind === 'template') {
      updateCard(cardId, { templateIds: appendUnique(asStringArray(plotboard?.cards.find((card) => card.cardId === cardId)?.templateIds), material.id) } as Partial<PlotCard>);
      return;
    }
    const card = plotboard?.cards.find((item) => item.cardId === cardId);
    if (!card) return;
    if (material.kind === 'character') {
      updateCard(cardId, { characterIds: appendUnique(card.characterIds, material.id) });
      return;
    }
    if (material.kind === 'chapter') {
      updateCard(cardId, { chapterIds: appendUnique(asStringArray(card.chapterIds), material.id) } as Partial<PlotCard>);
      return;
    }
    if (material.kind === 'world') {
      const bindWorld = (setAsLocation: boolean): void => {
        updateCard(cardId, {
          worldEntryIds: appendUnique(card.worldEntryIds, material.id),
          locationWorldEntryId: setAsLocation ? material.id : card.locationWorldEntryId
        });
      };
      if (material.metadata?.category === 'geography' || !card.locationWorldEntryId) {
        Modal.confirm({
          rootClassName: 'theme-aware-modal',
          title: '绑定世界观地理条目',
          content: `是否将“${material.title}”同时设为本剧情卡的地点？`,
          okText: '绑定并设为地点',
          cancelText: '仅绑定条目',
          onOk: () => bindWorld(true),
          onCancel: () => bindWorld(false)
        });
      } else {
        bindWorld(false);
      }
      return;
    }
    if (material.kind === 'plot') {
      Modal.confirm({
        rootClassName: 'theme-aware-modal',
        title: '选择线索使用方式',
        content: <ClueUsagePicker title={material.title} onPick={(usage) => bindPlotClue(cardId, material.id, usage)} />,
        okButtonProps: { style: { display: 'none' } },
        cancelText: '取消'
      });
    }
  };

  const bindPlotClue = (cardId: string, plotId: string, usage: PlotClueUsage): void => {
    const card = plotboard?.cards.find((item) => item.cardId === cardId);
    if (!card) return;
    const usageMap = { ...(card.plotClueUsages as Record<string, PlotClueUsage> | undefined), [plotId]: usage };
    updateCard(cardId, {
      plotEntryIds: appendUnique(card.plotEntryIds, plotId),
      plotClueUsages: usageMap,
      cardType: usage === 'setup' ? 'clue_setup' : usage === 'reinforce' ? 'clue_reinforce' : 'clue_payoff'
    } as Partial<PlotCard>);
    Modal.destroyAll();
  };

  const onCardMouseDown = (event: React.MouseEvent, card: PlotCard): void => {
    if (!plotboard || (event.target as HTMLElement).closest('button, input, textarea, .plotboard-card-anchor')) return;
    event.stopPropagation();
    const nextSelected = event.shiftKey
      ? selectedCardIds.includes(card.cardId) ? selectedCardIds.filter((id) => id !== card.cardId) : [...selectedCardIds, card.cardId]
      : selectedCardIds.includes(card.cardId) ? selectedCardIds : [card.cardId];
    setSelectedCardIds(nextSelected);
    setSelectedLinkId(undefined);
    const draggedCards = plotboard.cards.filter((item) => nextSelected.includes(item.cardId));
    setDragState({
      cardIds: nextSelected,
      startClient: { x: event.clientX, y: event.clientY },
      originalCards: Object.fromEntries(draggedCards.map((item) => [item.cardId, { x: item.x, y: item.y }])),
      before: clonePlotboard(plotboard)
    });
  };

  const onCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!plotboard || event.target !== event.currentTarget) return;
    const world = screenToWorld(event.clientX, event.clientY);
    setSelectedCardIds([]);
    setSelectedLinkId(undefined);
    if (event.shiftKey) {
      setSelectionBox({ start: world, current: world });
    } else {
      setPanState({ startClient: { x: event.clientX, y: event.clientY }, startViewport: { x: plotboard.viewport.x, y: plotboard.viewport.y } });
    }
  };

  const onCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!plotboard) return;
    if (dragState) {
      const dx = (event.clientX - dragState.startClient.x) / plotboard.viewport.zoom;
      const dy = (event.clientY - dragState.startClient.y) / plotboard.viewport.zoom;
      setPlotboard((current) => current ? {
        ...current,
        cards: current.cards.map((card) => dragState.cardIds.includes(card.cardId)
          ? { ...card, x: dragState.originalCards[card.cardId].x + dx, y: dragState.originalCards[card.cardId].y + dy, updatedAt: nowIso() }
          : card)
      } : current);
      setDirty(true);
    }
    if (panState) {
      setPlotboard((current) => current ? {
        ...current,
        viewport: {
          ...current.viewport,
          x: panState.startViewport.x + event.clientX - panState.startClient.x,
          y: panState.startViewport.y + event.clientY - panState.startClient.y
        }
      } : current);
      setDirty(true);
    }
    if (selectionBox) {
      setSelectionBox({ ...selectionBox, current: screenToWorld(event.clientX, event.clientY) });
    }
  };

  const finishPointerAction = (): void => {
    if (dragState) {
      setPast((current) => [...current.slice(-39), dragState.before]);
      setFuture([]);
      setDragState(undefined);
    }
    if (selectionBox && plotboard) {
      const rect = normalizeSelection(selectionBox.start, selectionBox.current);
      setSelectedCardIds(plotboard.cards.filter((card) => rectContains(rect, { x: card.x + CARD_WIDTH / 2, y: card.y + CARD_HEIGHT / 2 })).map((card) => card.cardId));
      setSelectionBox(undefined);
    }
    setPanState(undefined);
  };

  const onCanvasWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (!plotboard) return;
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const oldZoom = plotboard.viewport.zoom;
    const nextZoom = Math.min(1.8, Math.max(0.35, oldZoom * (event.deltaY > 0 ? 0.92 : 1.08)));
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const worldX = (cx - plotboard.viewport.x) / oldZoom;
    const worldY = (cy - plotboard.viewport.y) / oldZoom;
    setPlotboard({
      ...plotboard,
      viewport: { zoom: nextZoom, x: cx - worldX * nextZoom, y: cy - worldY * nextZoom },
      updatedAt: nowIso()
    });
    setDirty(true);
  };

  const onDropOnCanvas = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const material = getMaterialFromDrag(event, materials);
    if (!material) return;
    addCardAt(screenToWorld(event.clientX, event.clientY), material);
  };

  const runPlotboardGeneration = async (): Promise<void> => {
    if (!plotboard) return;
    if ((generationMode === 'single_card' || generationMode === 'selection' || generationMode === 'rewrite' || generationMode === 'continue') && selectedCardIds.length === 0) {
      message.warning('请先选择至少一张剧情卡');
      return;
    }
    cancelGenerationRef.current = false;
    setGenerating(true);
    setGenerationProgress(8);
    setGenerationOutput('');
    setGenerationResult(undefined);
    setPendingDiffs([]);
    try {
      const request = {
        bookId: plotboard.bookId,
        chapterId: plotboard.chapterId,
        settings: {
          mode: generationMode,
          selectedCardIds,
          userInstruction: generationInstruction,
          rewriteStrategy: generationMode === 'rewrite' ? 'mark_stale_and_append' as const : generationMode === 'continue' ? 'append' as const : 'replace_all' as const
        }
      };
      const result = await window.hetuSketch.plotboards.streamGenerate(request, (chunk) => {
        if (cancelGenerationRef.current) return;
        if (chunk.type === 'delta' && chunk.content) {
          setGenerationOutput((prev) => prev + chunk.content);
          setGenerationProgress((prev) => Math.min(95, prev + 18));
        }
        if (chunk.type === 'error') message.error(chunk.error ?? '生成失败');
      });
      if (cancelGenerationRef.current) {
        message.info('已取消本次生成，画布内容未写入章节');
        return;
      }
      setGenerationResult(result);
      setGenerationOutput(result.markdown);
      setPendingDiffs(result.stateDiffs);
      setGenerationProgress(100);
      if (result.warnings.length) message.warning(result.warnings[0]);
      await window.hetuSketch.plotboards.writeGeneratedMarkdown({ bookId: plotboard.bookId, chapterId: plotboard.chapterId, markdown: result.markdown, preserveSnapshot: true });
      message.success('已生成 Markdown 正文并写入章节，生成前正文快照已保留');
      refreshSidebar();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '剧情画布生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const cancelGeneration = (): void => {
    cancelGenerationRef.current = true;
    setGenerating(false);
  };

  const updatePendingDiff = (diffId: string, changes: Partial<StateDiff>): void => {
    setPendingDiffs((items) => items.map((item) => item.diffId === diffId ? { ...item, ...changes } : item));
  };

  const settleDiffs = async (): Promise<void> => {
    if (!plotboard || pendingDiffs.length === 0) return;
    try {
      const result = await window.hetuSketch.plotboards.settleDiffs({ bookId: plotboard.bookId, chapterId: plotboard.chapterId, diffs: pendingDiffs });
      setPendingDiffs([]);
      message.success(`状态快照已结算：写入 ${result.appliedDiffIds.length} 条，拒绝 ${result.rejectedDiffIds.length} 条`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '状态快照结算失败');
    }
  };

  const runPlotboardValidation = async (): Promise<void> => {
    if (!plotboard) return;
    setValidating(true);
    try {
      const result = await window.hetuSketch.plotboards.validate({ bookId: plotboard.bookId, chapterId: plotboard.chapterId, markdown: generationOutput || generationResult?.markdown });
      setValidationResult(result);
      if (result.ok) message.success('画布逻辑校验通过');
      else message.warning(`发现 ${result.summary.errorCount} 个错误、${result.summary.warningCount} 个警告`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '剧情画布校验失败');
    } finally {
      setValidating(false);
    }
  };

  const jumpToCard = (cardId?: string): void => {
    if (!cardId) return;
    const card = plotboard?.cards.find((item) => item.cardId === cardId);
    if (!card) return;
    setSelectedCardIds([cardId]);
    setSelectedLinkId(undefined);
    setPlotboard((current) => current ? { ...current, viewport: { ...current.viewport, x: 360 - card.x * current.viewport.zoom, y: 220 - card.y * current.viewport.zoom } } : current);
    setHighlightCardId(cardId);
    window.setTimeout(() => setHighlightCardId((current) => current === cardId ? undefined : current), 1600);
  };

  const resolvePlotEntry = async (plotEntryId: string): Promise<void> => {
    if (!plotboard) return;
    try {
      await window.hetuSketch.entries.update({ projectId: plotboard.projectId ?? plotboard.bookId, type: 'plot', entryId: plotEntryId, changes: { status: 'resolved' } });
      setValidationResult((current) => current ? { ...current, clueStatusHints: current.clueStatusHints.map((hint) => hint.plotEntryId === plotEntryId ? { ...hint, status: 'resolved', shouldResolve: false } : hint) } : current);
      message.success('线索状态已更新为已回收');
      refreshSidebar();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '更新线索状态失败');
    }
  };

  const exportMarkdownOutline = async (): Promise<void> => {
    if (!plotboard) return;
    try {
      const markdown = await window.hetuSketch.plotboards.exportOutline(plotboard.bookId, plotboard.chapterId);
      downloadTextFile(markdown, `plotboard-${plotboard.chapterId}-outline.md`, 'text/markdown;charset=utf-8');
      message.success('Markdown 大纲已导出');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '导出 Markdown 大纲失败');
    }
  };

  const exportCanvasImage = (): void => {
    if (!plotboard) return;
    const svg = buildPlotboardSvg(plotboard, materialNameMap);
    downloadTextFile(svg, `plotboard-${plotboard.chapterId}-image.svg`, 'image/svg+xml;charset=utf-8');
    message.success('画布图片已导出为 SVG');
  };

  if (!selectedProject) {
    return <Empty description="请先选择作品，再打开剧情画布" />;
  }
  if (!chapterId) {
    return <Empty description="缺少章节参数，请从创作工作台选择章节后进入剧情画布" />;
  }
  if (loading || !plotboard) {
    return <div className="plotboard-loading"><Spin /> <span>正在打开剧情画布…</span></div>;
  }

  const selectionRect = selectionBox ? normalizeSelection(selectionBox.start, selectionBox.current) : undefined;

  return (
    <div className="plotboard-page">
      <header className="plotboard-toolbar">
        <div className="plotboard-toolbar-title">
          <strong>剧情画布</strong>
          <span>{activeChapter?.title ?? chapterId}</span>
          {dirty ? <Tag color="orange">未保存</Tag> : <Tag color="green">已保存</Tag>}
        </div>
        <Space wrap size={4}>
          <Button size="small" icon={<SaveOutlined />} type="primary" loading={saving} onClick={() => void savePlotboard()}>保存</Button>
          <Button size="small" icon={<UndoOutlined />} disabled={past.length === 0} onClick={undo}>撤销</Button>
          <Button size="small" icon={<RedoOutlined />} disabled={future.length === 0} onClick={redo}>重做</Button>
          <Select size="small" value={generationMode} options={GENERATION_MODES} onChange={setGenerationMode} style={{ width: 86 }} />
          <Input size="small" value={generationInstruction} onChange={(event) => setGenerationInstruction(event.target.value)} placeholder="生成说明" style={{ width: 160 }} allowClear />
          <Button size="small" icon={<RobotOutlined />} loading={generating} onClick={() => void runPlotboardGeneration()}>生成正文</Button>
          {generating ? <Button size="small" danger icon={<CloseCircleOutlined />} onClick={cancelGeneration}>取消</Button> : null}
          <Button size="small" icon={<CheckCircleOutlined />} loading={validating} onClick={() => void runPlotboardValidation()}>逻辑校验</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => void exportMarkdownOutline()}>导出大纲</Button>
          <Button size="small" icon={<FileImageOutlined />} onClick={exportCanvasImage}>图片导出</Button>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/workspace/editor?chapter=${encodeURIComponent(chapterId)}`)}>返回章节</Button>
        </Space>
      </header>

      <div className="plotboard-shell">
        <MaterialLibrary
          materials={materials}
          keyword={materialKeyword}
          activeTab={materialTab}
          onKeywordChange={setMaterialKeyword}
          onTabChange={setMaterialTab}
          onSelect={(item) => selectedCard ? bindMaterialToCard(selectedCard.cardId, item) : addCardAt({ x: 80 - plotboard.viewport.x, y: 80 - plotboard.viewport.y }, item)}
        />

        <main className="plotboard-canvas-wrap">
          <PovStateAxis groups={buildPovAxisGroups(plotboard.cards, materialNameMap)} onJump={jumpToCard} />
          <div
            ref={canvasRef}
            className={`plotboard-canvas ${panState ? 'is-panning' : ''}`}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={finishPointerAction}
            onMouseLeave={finishPointerAction}
            onDoubleClick={(event) => {
              if (event.target === event.currentTarget) addCardAt(screenToWorld(event.clientX, event.clientY));
            }}
            onWheel={onCanvasWheel}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDropOnCanvas}
          >
            {plotboard.cards.length === 0 && (
              <div className="plotboard-empty-guide">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={(
                    <span>
                      双击空白处创建第一张剧情卡，或从左侧素材库拖入角色、世界观、线索、章节与模板。<br />
                      用卡片记录“谁在何时何地因为什么做了什么”，AI 后续只负责把你确定的事件链写成正文。
                    </span>
                  )}
                />
              </div>
            )}
            <div
              className="plotboard-world"
              style={{ transform: `translate(${plotboard.viewport.x}px, ${plotboard.viewport.y}px) scale(${plotboard.viewport.zoom})` }}
            >
              <svg className="plotboard-links" width="4000" height="2600" viewBox="0 0 4000 2600" aria-hidden="true">
                <defs>
                  <marker id="plotboard-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                </defs>
                {plotboard.links.map((link) => {
                  const source = plotboard.cards.find((card) => card.cardId === link.sourceCardId);
                  const target = plotboard.cards.find((card) => card.cardId === link.targetCardId);
                  if (!source || !target) return null;
                  const path = linkPath(source, target);
                  return (
                    <g key={link.linkId} className={`plotboard-link ${selectedLinkId === link.linkId ? 'is-selected' : ''} link-${link.linkType}`} onClick={(event) => { event.stopPropagation(); setSelectedLinkId(link.linkId); setSelectedCardIds([]); }}>
                      <path className="plotboard-link-hit" d={path} />
                      <path className="plotboard-link-line" d={path} markerEnd="url(#plotboard-arrow)" />
                      <text x={(source.x + target.x + CARD_WIDTH) / 2} y={(source.y + target.y + CARD_HEIGHT) / 2 - 8}>{LINK_TYPE_LABEL[link.linkType]}</text>
                    </g>
                  );
                })}
              </svg>
              {plotboard.cards.map((card) => (
                <PlotCardNode
                  key={card.cardId}
                  card={card}
                  selected={selectedCardIds.includes(card.cardId)}
                  linking={linkSourceCardId === card.cardId}
                  materialNameMap={materialNameMap}
                  findings={validationFindingsByCard.get(card.cardId) ?? []}
                  highlighted={highlightCardId === card.cardId}
                  propagationHighlighted={propagationHighlightIds.has(card.cardId)}
                  onMouseDown={(event) => onCardMouseDown(event, card)}
                  onSelect={() => { setSelectedCardIds([card.cardId]); setSelectedLinkId(undefined); }}
                  onLinkStart={(event) => { event.stopPropagation(); setLinkSourceCardId(card.cardId); }}
                  onLinkEnd={() => {
                    if (linkSourceCardId) createLink(linkSourceCardId, card.cardId);
                    setLinkSourceCardId(undefined);
                  }}
                  onDropMaterial={(item) => bindMaterialToCard(card.cardId, item)}
                  materials={materials}
                />
              ))}
              {selectionRect && <div className="plotboard-selection-box" style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.width, height: selectionRect.height }} />}
            </div>
          </div>
        </main>

        <PropertyPanel
          card={selectedCard}
          link={selectedLink}
          selectedCount={selectedCardIds.length}
          materials={materials}
          materialNameMap={materialNameMap}
          validationFindings={selectedCardFindings}
          onUpdateCard={updateCard}
          onUpdateLink={updateLink}
          onDelete={deleteSelection}
          onBindMaterial={bindMaterialToCard}
        />
      </div>

      <GenerationPanel
        progress={generationProgress}
        generating={generating}
        output={generationOutput}
        result={generationResult}
        diffs={pendingDiffs}
        onUpdateDiff={updatePendingDiff}
        onSettle={() => void settleDiffs()}
      />

      <ValidationPanel
        result={validationResult}
        materialNameMap={materialNameMap}
        onJumpToCard={jumpToCard}
        onResolvePlotEntry={(plotEntryId) => void resolvePlotEntry(plotEntryId)}
      />

      <footer className="plotboard-statusbar">
        <span>卡片 {plotboard.cards.length}</span>
        <span>连线 {plotboard.links.length}</span>
        <span>冲突 {validationResult?.findings.length ?? 0}</span>
        <span>未回收线索 {unresolvedClueCount}</span>
        <span>选中 {selectedCardIds.length || (selectedLink ? 1 : 0)}</span>
        <span>缩放 {Math.round(plotboard.viewport.zoom * 100)}%</span>
        <span>Ctrl+S 保存，Shift+拖拽框选，滚轮缩放，拖拽空白处平移</span>
      </footer>
    </div>
  );
}

function PovStateAxis({ groups, onJump }: { groups: PovAxisGroup[]; onJump: (cardId?: string) => void }): React.JSX.Element | null {
  if (groups.length === 0) return null;
  return (
    <section className="plotboard-pov-axis" aria-label="多 POV 状态轴">
      <div className="plotboard-pov-axis-title">多 POV 状态轴</div>
      <div className="plotboard-pov-axis-scroll">
        {groups.map((group) => (
          <div key={group.povId} className="plotboard-pov-lane">
            <div className="plotboard-pov-name">{group.povName}</div>
            <div className="plotboard-pov-cards">
              {group.cards.map((card) => (
                <button key={card.cardId} type="button" onClick={() => onJump(card.cardId)} title={card.fact}>
                  <span>{card.timecode || '未设时间'}</span>
                  <strong>{card.title}</strong>
                </button>
              ))}
            </div>
            <div className="plotboard-pov-fields">
              {group.changedFields.length ? group.changedFields.slice(0, 5).map((field) => <Tag key={field}>{field}</Tag>) : <Tag>无状态变更</Tag>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValidationPanel({ result, materialNameMap, onJumpToCard, onResolvePlotEntry }: {
  result?: PlotboardValidationResult;
  materialNameMap: Map<string, string>;
  onJumpToCard: (cardId?: string) => void;
  onResolvePlotEntry: (plotEntryId: string) => void;
}): React.JSX.Element | null {
  if (!result) return null;
  return (
    <section className="plotboard-validation-panel">
      <div className="plotboard-panel-header">
        <strong>逻辑校验与线索回收</strong>
        <Space size={6} wrap>
          <Tag color={result.summary.errorCount ? 'red' : 'green'}>错误 {result.summary.errorCount}</Tag>
          <Tag color={result.summary.warningCount ? 'orange' : 'green'}>警告 {result.summary.warningCount}</Tag>
          <Tag>正文定位 {result.findings.filter((item) => item.markdownLocation).length}</Tag>
        </Space>
      </div>
      {result.findings.length ? (
        <div className="plotboard-validation-list">
          {result.findings.map((finding) => (
            <button key={finding.id} type="button" className={`plotboard-validation-item severity-${finding.severity}`} onClick={() => onJumpToCard(finding.cardId ?? finding.relatedCardIds?.[0])}>
              <Tag color={finding.severity === 'error' ? 'red' : finding.severity === 'warning' ? 'orange' : 'blue'}>{VALIDATION_CATEGORY_LABEL[finding.category]}</Tag>
              <span>{finding.message}</span>
              {finding.markdownLocation ? <small>正文段落 #{finding.markdownLocation.paragraphIndex + 1}：{finding.markdownLocation.excerpt}</small> : null}
              {finding.suggestion ? <small>{finding.suggestion}</small> : null}
            </button>
          ))}
        </div>
      ) : <Typography.Text type="secondary">未发现阻断性问题。</Typography.Text>}
      {result.clueStatusHints.length ? (
        <div className="plotboard-clue-status-panel">
          <Typography.Text strong>线索状态提示</Typography.Text>
          {result.clueStatusHints.map((hint) => (
            <div key={hint.plotEntryId} className="plotboard-clue-status-row">
              <span>{hint.title ?? materialNameMap.get(hint.plotEntryId) ?? hint.plotEntryId}</span>
              <Tag color={hint.setupCardIds.length ? 'blue' : 'default'}>埋设 {hint.setupCardIds.length}</Tag>
              <Tag color={hint.reinforceCardIds.length ? 'purple' : 'default'}>强化 {hint.reinforceCardIds.length}</Tag>
              <Tag color={hint.payoffCardIds.length ? 'green' : 'default'}>回收 {hint.payoffCardIds.length}</Tag>
              {hint.shouldResolve ? <Button size="small" type="link" onClick={() => onResolvePlotEntry(hint.plotEntryId)}>已回收，更新为 resolved</Button> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function GenerationPanel({ progress, generating, output, result, diffs, onUpdateDiff, onSettle }: {
  progress: number;
  generating: boolean;
  output: string;
  result?: PlotboardGenerationResult;
  diffs: StateDiff[];
  onUpdateDiff: (diffId: string, changes: Partial<StateDiff>) => void;
  onSettle: () => void;
}): React.JSX.Element | null {
  if (!generating && !output && diffs.length === 0 && !result) return null;
  return (
    <section className="plotboard-generation-panel">
      <div className="plotboard-panel-header">
        <strong>AI 生成与状态结算</strong>
        {result ? <Tag color={result.status === 'ok' ? 'green' : 'orange'}>{result.status === 'ok' ? 'AI 已生成' : '本地降级生成'}</Tag> : null}
      </div>
      {generating ? <Progress percent={progress} size="small" status="active" /> : null}
      {output ? <Input.TextArea rows={5} value={output} readOnly /> : null}
      {diffs.length ? (
        <div className="plotboard-diff-list">
          <Typography.Text strong>State Diff 建议</Typography.Text>
          {diffs.map((diff) => (
            <div key={diff.diffId} className="plotboard-diff-row">
              <Tag>{diff.targetType}:{diff.targetId}</Tag>
              <Input size="small" value={diff.fieldName} onChange={(event) => onUpdateDiff(diff.diffId, { fieldName: event.target.value, status: 'modified' })} />
              <Input size="small" value={String(diff.to ?? '')} onChange={(event) => onUpdateDiff(diff.diffId, { to: event.target.value, status: 'modified' })} />
              <Input size="small" value={diff.reason} onChange={(event) => onUpdateDiff(diff.diffId, { reason: event.target.value, status: 'modified' })} />
              <Select size="small" value={diff.status ?? 'suggested'} options={[{ value: 'suggested', label: '待定' }, { value: 'accepted', label: '确认' }, { value: 'modified', label: '修改确认' }, { value: 'rejected', label: '拒绝' }]} onChange={(status) => onUpdateDiff(diff.diffId, { status })} />
            </div>
          ))}
          <Button size="small" type="primary" onClick={onSettle}>写入已确认 Diff 到章节快照</Button>
        </div>
      ) : null}
    </section>
  );
}

function MaterialLibrary({ materials, keyword, activeTab, onKeywordChange, onTabChange, onSelect }: {
  materials: MaterialLibraryState;
  keyword: string;
  activeTab: MaterialKind;
  onKeywordChange: (value: string) => void;
  onTabChange: (value: MaterialKind) => void;
  onSelect: (item: MaterialItem) => void;
}): React.JSX.Element {
  const filtered = materials[activeTab].filter((item) => `${item.title} ${item.excerpt ?? ''}`.toLowerCase().includes(keyword.trim().toLowerCase()));
  return (
    <aside className="plotboard-materials">
      <div className="plotboard-panel-header">
        <strong>素材库</strong>
        <Typography.Text type="secondary">拖拽或点击绑定引用 ID</Typography.Text>
      </div>
      <Input size="small" prefix={<SearchOutlined />} value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索角色、地点、线索…" allowClear />
      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={(key) => onTabChange(key as MaterialKind)}
        items={[
          { key: 'character', label: '角色' },
          { key: 'world', label: '世界观' },
          { key: 'plot', label: '线索' },
          { key: 'chapter', label: '章节' },
          { key: 'template', label: '模板' }
        ].map((tab) => ({ ...tab, children: null }))}
      />
      <div className="plotboard-material-list">
        {filtered.map((item) => (
          <button
            key={`${item.kind}-${item.id}`}
            className="plotboard-material-item"
            type="button"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('application/x-hetusketch-material', JSON.stringify({ kind: item.kind, id: item.id } satisfies DragMaterialPayload))}
            onClick={() => onSelect(item)}
          >
            <span className={`plotboard-material-kind kind-${item.kind}`}>{materialKindLabel(item.kind)}</span>
            <strong>{item.title}</strong>
            {item.excerpt ? <span>{item.excerpt}</span> : null}
          </button>
        ))}
        {filtered.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配素材" />}
      </div>
    </aside>
  );
}

function PlotCardNode({ card, selected, linking, materialNameMap, findings, highlighted, propagationHighlighted, onMouseDown, onSelect, onLinkStart, onLinkEnd, onDropMaterial, materials }: {
  card: PlotCard;
  selected: boolean;
  linking: boolean;
  materialNameMap: Map<string, string>;
  findings: PlotboardValidationFinding[];
  highlighted: boolean;
  propagationHighlighted: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
  onSelect: () => void;
  onLinkStart: (event: React.MouseEvent) => void;
  onLinkEnd: () => void;
  onDropMaterial: (item: MaterialItem) => void;
  materials: MaterialLibraryState;
}): React.JSX.Element {
  const boundNames = [...card.characterIds, ...card.worldEntryIds, ...card.plotEntryIds].slice(0, 4).map((id) => materialNameMap.get(id) ?? id.slice(0, 8));
  const maxSeverity = findings.some((finding) => finding.severity === 'error') ? 'error' : findings.some((finding) => finding.severity === 'warning') ? 'warning' : undefined;
  return (
    <article
      className={`plotboard-card card-${card.cardType} ${selected ? 'is-selected' : ''} ${highlighted ? 'is-highlighted' : ''} ${propagationHighlighted ? 'is-propagation-highlighted' : ''} ${maxSeverity ? `has-validation-${maxSeverity}` : ''}`}
      style={{ left: card.x, top: card.y, width: CARD_WIDTH, minHeight: CARD_HEIGHT } as CSSProperties}
      onMouseDown={onMouseDown}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onMouseUp={onLinkEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const material = getMaterialFromDrag(event, materials);
        if (material) onDropMaterial(material);
      }}
    >
      <div className="plotboard-card-topline">
        <Tag color="blue">{CARD_TYPE_LABEL[card.cardType]}</Tag>
        {card.timecode ? <span>{card.timecode}</span> : <span>未设时间</span>}
        {findings.length ? <Tooltip title={findings[0].message}><Tag color={maxSeverity === 'error' ? 'red' : 'orange'} icon={<ExclamationCircleOutlined />}>{findings.length}</Tag></Tooltip> : null}
      </div>
      <h3>{card.title}</h3>
      <p>{card.fact || '未填写客观事件事实。'}</p>
      <div className="plotboard-card-bindings">
        {boundNames.map((name) => <Tag key={name}>{name}</Tag>)}
        {boundNames.length === 0 ? <span>可拖入素材建立引用</span> : null}
      </div>
      <Tooltip title="按住并拖到另一张卡片创建连线">
        <button className={`plotboard-card-anchor ${linking ? 'is-linking' : ''}`} type="button" onMouseDown={onLinkStart} aria-label="创建连线">
          <ForkOutlined />
        </button>
      </Tooltip>
      <DragOutlined className="plotboard-card-drag-hint" />
    </article>
  );
}

function PropertyPanel({ card, link, selectedCount, materials, materialNameMap, validationFindings, onUpdateCard, onUpdateLink, onDelete, onBindMaterial }: {
  card?: PlotCard;
  link?: PlotLink;
  selectedCount: number;
  materials: MaterialLibraryState;
  materialNameMap: Map<string, string>;
  validationFindings: PlotboardValidationFinding[];
  onUpdateCard: (cardId: string, changes: Partial<PlotCard>) => void;
  onUpdateLink: (linkId: string, changes: Partial<PlotLink>) => void;
  onDelete: () => void;
  onBindMaterial: (cardId: string, item: MaterialItem) => void;
}): React.JSX.Element {
  if (link) {
    return (
      <aside className="plotboard-properties">
        <div className="plotboard-panel-header"><strong>连线属性</strong><Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>删除</Button></div>
        <Labeled label="关系类型">
          <Select value={link.linkType} options={LINK_TYPES.map((value) => ({ value, label: LINK_TYPE_LABEL[value] }))} onChange={(linkType) => onUpdateLink(link.linkId, { linkType })} />
        </Labeled>
        <Labeled label="连接动机">
          <Input.TextArea rows={4} value={link.motivation} onChange={(event) => onUpdateLink(link.linkId, { motivation: event.target.value })} placeholder="解释为什么下一件事会发生" />
        </Labeled>
        <Labeled label="条件说明">
          <Input.TextArea rows={3} value={link.condition} onChange={(event) => onUpdateLink(link.linkId, { condition: event.target.value })} placeholder="conditional 关系必填，其他关系可选" />
        </Labeled>
      </aside>
    );
  }
  if (!card) {
    return (
      <aside className="plotboard-properties">
        <div className="plotboard-panel-header"><strong>属性面板</strong></div>
        {selectedCount > 1 ? <Empty description={`已框选 ${selectedCount} 张剧情卡，Delete 可批量删除。`} /> : <Empty description="选择一张剧情卡或连线后编辑属性" />}
      </aside>
    );
  }

  const clueUsages = (card.plotClueUsages as Record<string, PlotClueUsage> | undefined) ?? {};
  const chapterIds = asStringArray(card.chapterIds);
  const templateIds = asStringArray(card.templateIds);

  return (
    <aside className="plotboard-properties">
      <div className="plotboard-panel-header"><strong>剧情卡属性</strong><Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>删除</Button></div>
      {validationFindings.length ? (
        <div className="plotboard-inline-validation">
          {validationFindings.slice(0, 3).map((finding) => <Tag key={finding.id} color={finding.severity === 'error' ? 'red' : 'orange'}>{VALIDATION_CATEGORY_LABEL[finding.category]}：{finding.message}</Tag>)}
        </div>
      ) : null}
      <Labeled label="标题"><Input value={card.title} onChange={(event) => onUpdateCard(card.cardId, { title: event.target.value })} /></Labeled>
      <Labeled label="客观事件事实"><Input.TextArea rows={4} value={card.fact} onChange={(event) => onUpdateCard(card.cardId, { fact: event.target.value })} placeholder="谁在什么时间、什么地点、因为什么做了什么事" /></Labeled>
      <div className="plotboard-property-grid">
        <Labeled label="卡片类型"><Select value={card.cardType} options={CARD_TYPES.map((value) => ({ value, label: CARD_TYPE_LABEL[value] }))} onChange={(cardType) => onUpdateCard(card.cardId, { cardType })} /></Labeled>
        <Labeled label="故事内时间"><Input value={card.timecode} onChange={(event) => onUpdateCard(card.cardId, { timecode: event.target.value })} placeholder="Day 3 / 18:00" /></Labeled>
      </div>
      <Labeled label="POV 角色"><Select allowClear value={card.povCharacterId || undefined} options={materials.character.map((item) => ({ value: item.id, label: item.title }))} onChange={(povCharacterId) => onUpdateCard(card.cardId, { povCharacterId })} /></Labeled>
      <Labeled label="地点（世界观地理条目）"><Select allowClear value={card.locationWorldEntryId || undefined} options={materials.world.map((item) => ({ value: item.id, label: item.title }))} onChange={(locationWorldEntryId) => onUpdateCard(card.cardId, { locationWorldEntryId: locationWorldEntryId ?? '' })} /></Labeled>
      <BoundTags title="角色" ids={card.characterIds} materialNameMap={materialNameMap} onRemove={(id) => onUpdateCard(card.cardId, { characterIds: card.characterIds.filter((item) => item !== id) })} />
      <BoundTags title="世界观" ids={card.worldEntryIds} materialNameMap={materialNameMap} onRemove={(id) => onUpdateCard(card.cardId, { worldEntryIds: card.worldEntryIds.filter((item) => item !== id), locationWorldEntryId: card.locationWorldEntryId === id ? '' : card.locationWorldEntryId })} />
      <BoundTags title="章节引用" ids={chapterIds} materialNameMap={materialNameMap} onRemove={(id) => onUpdateCard(card.cardId, { chapterIds: chapterIds.filter((item) => item !== id) } as Partial<PlotCard>)} />
      <BoundTags title="模板引用" ids={templateIds} materialNameMap={materialNameMap} onRemove={(id) => onUpdateCard(card.cardId, { templateIds: templateIds.filter((item) => item !== id) } as Partial<PlotCard>)} />
      <Labeled label="线索与使用方式">
        <div className="plotboard-clue-list">
          {card.plotEntryIds.map((id) => (
            <div key={id} className="plotboard-clue-row">
              <Tag closable onClose={(event) => { event.preventDefault(); const nextUsages = { ...clueUsages }; delete nextUsages[id]; onUpdateCard(card.cardId, { plotEntryIds: card.plotEntryIds.filter((item) => item !== id), plotClueUsages: nextUsages } as Partial<PlotCard>); }}>{materialNameMap.get(id) ?? id}</Tag>
              <Select size="small" value={clueUsages[id] ?? 'setup'} options={clueUsageOptions()} onChange={(usage) => onUpdateCard(card.cardId, { plotClueUsages: { ...clueUsages, [id]: usage } } as Partial<PlotCard>)} />
            </div>
          ))}
          {card.plotEntryIds.length === 0 ? <Typography.Text type="secondary">从左侧线索库点击或拖拽绑定</Typography.Text> : null}
        </div>
      </Labeled>
      <Labeled label="快速绑定素材">
        <Select
          showSearch
          placeholder="搜索并点击绑定"
          options={[...materials.character, ...materials.world, ...materials.plot, ...materials.chapter, ...materials.template].map((item) => ({ value: `${item.kind}:${item.id}`, label: `${materialKindLabel(item.kind)} · ${item.title}` }))}
          onSelect={(value) => {
            const [kind, id] = String(value).split(':') as [MaterialKind, string];
            const item = materials[kind].find((candidate) => candidate.id === id);
            if (item) onBindMaterial(card.cardId, item);
          }}
          value={undefined}
          filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </Labeled>
      <Labeled label="情感基调"><Select mode="tags" value={card.narrativeTone} onChange={(narrativeTone) => onUpdateCard(card.cardId, { narrativeTone })} placeholder="紧张、温柔、诡异…" /></Labeled>
      <Labeled label={`生成详略：${card.detailLevel ?? 3}`}><Slider min={1} max={5} value={card.detailLevel ?? 3} onChange={(detailLevel) => onUpdateCard(card.cardId, { detailLevel })} /></Labeled>
      <Labeled label="AI 生成补充说明"><Input.TextArea rows={3} value={card.generationInstruction} onChange={(event) => onUpdateCard(card.cardId, { generationInstruction: event.target.value })} /></Labeled>
      <Labeled label="场景状态增量（L3）">
        <StateDeltaEditor card={card} onChange={(stateDeltas) => onUpdateCard(card.cardId, { stateDeltas })} />
      </Labeled>
    </aside>
  );
}

function StateDeltaEditor({ card, onChange }: { card: PlotCard; onChange: (stateDeltas: PlotCard['stateDeltas']) => void }): React.JSX.Element {
  return (
    <div className="plotboard-state-deltas">
      {card.stateDeltas.map((delta, index) => (
        <div key={index} className="plotboard-state-delta-row">
          <Select size="small" value={delta.ownerType} options={STATE_OWNERS.map((value) => ({ value, label: value }))} onChange={(ownerType) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, ownerType } : item))} />
          <Input size="small" value={delta.ownerId} onChange={(event) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, ownerId: event.target.value } : item))} placeholder="对象 ID" />
          <Input size="small" value={delta.fieldName} onChange={(event) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, fieldName: event.target.value } : item))} placeholder="字段" />
          <Select size="small" value={delta.operator} options={STATE_OPERATORS.map((value) => ({ value, label: value }))} onChange={(operator) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, operator } : item))} />
          <Input size="small" value={String(delta.value ?? '')} onChange={(event) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="值" />
          <Input size="small" value={delta.reason} onChange={(event) => onChange(card.stateDeltas.map((item, i) => i === index ? { ...item, reason: event.target.value } : item))} placeholder="原因" />
          <Button size="small" danger onClick={() => onChange(card.stateDeltas.filter((_, i) => i !== index))}>删</Button>
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...card.stateDeltas, { ownerType: 'character', ownerId: '', fieldName: '', operator: 'set', value: '' }])}>添加状态增量</Button>
    </div>
  );
}

function BoundTags({ title, ids, materialNameMap, onRemove }: { title: string; ids: string[]; materialNameMap: Map<string, string>; onRemove: (id: string) => void }): React.JSX.Element {
  return (
    <Labeled label={title}>
      <div className="plotboard-bound-tags">
        {ids.map((id) => <Tag key={id} closable onClose={(event) => { event.preventDefault(); onRemove(id); }}>{materialNameMap.get(id) ?? id}</Tag>)}
        {ids.length === 0 ? <Typography.Text type="secondary">未绑定</Typography.Text> : null}
      </div>
    </Labeled>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return <label className="plotboard-field"><span>{label}</span>{children}</label>;
}

function ClueUsagePicker({ title, onPick }: { title: string; onPick: (usage: PlotClueUsage) => void }): React.JSX.Element {
  return (
    <Space direction="vertical" className="full-width">
      <Typography.Text>线索“{title}”在这张剧情卡中的使用方式：</Typography.Text>
      <Space wrap>
        {clueUsageOptions().map((option) => <Button key={option.value} onClick={() => onPick(option.value)}>{option.label}</Button>)}
      </Space>
    </Space>
  );
}

async function loadMaterials(projectId: string): Promise<MaterialLibraryState> {
  const [characters, worlds, plots, tree] = await Promise.all([
    window.hetuSketch.entries.list({ projectId, type: 'character', limit: 500 }).catch(() => []),
    window.hetuSketch.entries.list({ projectId, type: 'world', limit: 500 }).catch(() => []),
    window.hetuSketch.entries.list({ projectId, type: 'plot', limit: 500 }).catch(() => []),
    window.hetuSketch.chapters.listTree(projectId).catch(() => undefined)
  ]);
  return {
    character: characters.map((item) => searchResultToMaterial(item, 'character')),
    world: await enrichWorldMaterials(projectId, worlds.map((item) => searchResultToMaterial(item, 'world'))),
    plot: plots.map((item) => searchResultToMaterial(item, 'plot')),
    chapter: (tree?.chapters ?? []).map((chapter) => chapterToMaterial(chapter)),
    template: EMPTY_MATERIALS.template
  };
}

async function enrichWorldMaterials(projectId: string, worlds: MaterialItem[]): Promise<MaterialItem[]> {
  return Promise.all(worlds.map(async (item) => {
    if (item.metadata?.category) return item;
    try {
      const detail = await window.hetuSketch.entries.get(projectId, 'world', item.id) as ProjectEntry;
      if (detail.type === 'world') {
        return { ...item, metadata: { ...item.metadata, category: detail.category } };
      }
    } catch {
      // ignore: summary-only material remains usable
    }
    return item;
  }));
}

function searchResultToMaterial(item: SearchResultItem, kind: Extract<MaterialKind, 'character' | 'world' | 'plot'>): MaterialItem {
  return { id: item.id, kind, title: item.title, excerpt: item.excerpt, metadata: item.metadata };
}

function chapterToMaterial(chapter: PersistedChapterNode): MaterialItem {
  return { id: chapter.id, kind: 'chapter', title: chapter.title, excerpt: chapter.summary ?? chapter.content.slice(0, 80) };
}

function seedCardByMaterial(point: CanvasPoint, material: MaterialItem): PlotCard {
  const baseTitle = material.kind === 'template' ? `套用模板：${material.title}` : `围绕 ${material.title}`;
  const card = createCard({ x: point.x, y: point.y, title: baseTitle, fact: material.excerpt ? `参考素材：${material.excerpt}` : '' });
  if (material.kind === 'character') return { ...card, characterIds: [material.id] };
  if (material.kind === 'world') return { ...card, worldEntryIds: [material.id], locationWorldEntryId: material.metadata?.category === 'geography' ? material.id : '' };
  if (material.kind === 'plot') return { ...card, plotEntryIds: [material.id], plotClueUsages: { [material.id]: 'setup' }, cardType: 'clue_setup' } as PlotCard;
  if (material.kind === 'chapter') return { ...card, chapterIds: [material.id] } as PlotCard;
  return { ...card, templateIds: [material.id], fact: templateFact(material.id as TemplateId) } as PlotCard;
}

function getMaterialFromDrag(event: React.DragEvent, materials: MaterialLibraryState): MaterialItem | undefined {
  try {
    const raw = event.dataTransfer.getData('application/x-hetusketch-material');
    if (!raw) return undefined;
    const payload = JSON.parse(raw) as DragMaterialPayload;
    return materials[payload.kind]?.find((item) => item.id === payload.id);
  } catch {
    return undefined;
  }
}

function linkPath(source: PlotCard, target: PlotCard): string {
  const sx = source.x + CARD_WIDTH;
  const sy = source.y + CARD_HEIGHT / 2;
  const tx = target.x;
  const ty = target.y + CARD_HEIGHT / 2;
  const mid = Math.max(80, Math.abs(tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + mid} ${sy}, ${tx - mid} ${ty}, ${tx} ${ty}`;
}

function normalizeSelection(start: CanvasPoint, current: CanvasPoint): { x: number; y: number; width: number; height: number } {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return { x, y, width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) };
}

function rectContains(rect: { x: number; y: number; width: number; height: number }, point: CanvasPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function appendUnique(items: string[], id: string): string[] {
  return items.includes(id) ? items : [...items, id];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function materialKindLabel(kind: MaterialKind): string {
  return ({ character: '角色', world: '世界观', plot: '线索', chapter: '章节', template: '模板' } as const)[kind];
}

function clueUsageOptions(): Array<{ value: PlotClueUsage; label: string }> {
  return [
    { value: 'setup', label: '埋设' },
    { value: 'reinforce', label: '强化' },
    { value: 'payoff', label: '回收' }
  ];
}

function templateFact(id: TemplateId): string {
  return ({
    three_act: '按“起势—对抗—转折”拆分本章节关键事件，并补齐主角行动目标。',
    mystery_reveal: '安排线索误导、证据揭示与伏笔回收，保证读者可回溯推理链。',
    ensemble_cross: '让多名角色在不同地点并行行动，并在章节末端汇合或产生交叉影响。'
  } as const)[id];
}

function stateDeltaKey(delta: PlotCard['stateDeltas'][number]): string {
  return `${delta.ownerType}:${delta.ownerId}:${delta.fieldName}`;
}

function findCausalPropagationTargets(plotboard: Plotboard, selectedCardIds: string[]): Set<string> {
  const changedKeys = new Set(plotboard.cards.filter((card) => selectedCardIds.includes(card.cardId)).flatMap((card) => (card.stateDeltas ?? []).map(stateDeltaKey)));
  if (changedKeys.size === 0) return new Set();
  const outgoing = new Map<string, PlotLink[]>();
  for (const link of plotboard.links) {
    if (link.linkType === 'sequence' || link.linkType === 'causal') {
      outgoing.set(link.sourceCardId, [...(outgoing.get(link.sourceCardId) ?? []), link]);
    }
  }
  const result = new Set<string>();
  const visited = new Set(selectedCardIds);
  const queue = [...selectedCardIds];
  while (queue.length) {
    const sourceId = queue.shift();
    if (!sourceId) continue;
    for (const link of outgoing.get(sourceId) ?? []) {
      if (visited.has(link.targetCardId)) continue;
      visited.add(link.targetCardId);
      const target = plotboard.cards.find((card) => card.cardId === link.targetCardId);
      if (!target) continue;
      const touchesChangedState = (target.stateDeltas ?? []).some((delta) => changedKeys.has(stateDeltaKey(delta)));
      if (link.linkType === 'causal' || touchesChangedState) result.add(target.cardId);
      queue.push(target.cardId);
    }
  }
  return result;
}

function buildPovAxisGroups(cards: PlotCard[], materialNameMap: Map<string, string>): PovAxisGroup[] {
  const groups = new Map<string, PlotCard[]>();
  for (const card of [...cards].sort(compareCardsForAxis)) {
    const key = card.povCharacterId || 'unknown-pov';
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.entries()].map(([povId, groupCards]) => ({
    povId,
    povName: povId === 'unknown-pov' ? '未指定 POV' : materialNameMap.get(povId) ?? povId,
    cards: groupCards,
    changedFields: Array.from(new Set(groupCards.flatMap((card) => (card.stateDeltas ?? []).map((delta) => `${delta.ownerId}.${delta.fieldName}`))))
  }));
}

function compareCardsForAxis(a: PlotCard, b: PlotCard): number {
  const timeCompare = String(a.timecode ?? '').localeCompare(String(b.timecode ?? ''));
  return timeCompare || a.x - b.x || a.y - b.y;
}

function buildPlotboardSvg(plotboard: Plotboard, materialNameMap: Map<string, string>): string {
  const bounds = getPlotboardBounds(plotboard.cards);
  const lines = plotboard.links.map((link) => {
    const source = plotboard.cards.find((card) => card.cardId === link.sourceCardId);
    const target = plotboard.cards.find((card) => card.cardId === link.targetCardId);
    if (!source || !target) return '';
    return `<path d="${linkPath({ ...source, x: source.x - bounds.x + 40, y: source.y - bounds.y + 60 }, { ...target, x: target.x - bounds.x + 40, y: target.y - bounds.y + 60 })}" fill="none" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrow)"/><text x="${(source.x + target.x - bounds.x * 2 + CARD_WIDTH) / 2 + 40}" y="${(source.y + target.y - bounds.y * 2 + CARD_HEIGHT) / 2 + 48}" fill="#475569" font-size="12">${escapeXml(LINK_TYPE_LABEL[link.linkType])}</text>`;
  }).join('\n');
  const cards = plotboard.cards.map((card) => {
    const x = card.x - bounds.x + 40;
    const y = card.y - bounds.y + 60;
    const bindings = [...card.characterIds, ...card.worldEntryIds, ...card.plotEntryIds].slice(0, 3).map((id) => materialNameMap.get(id) ?? id).join('、');
    return `<g transform="translate(${x} ${y})"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="14" fill="#f8fafc" stroke="#334155"/><text x="14" y="26" fill="#2563eb" font-size="12" font-weight="700">${escapeXml(CARD_TYPE_LABEL[card.cardType])} · ${escapeXml(card.timecode || '未设时间')}</text><text x="14" y="54" fill="#0f172a" font-size="16" font-weight="700">${escapeXml(truncateText(card.title, 16))}</text><text x="14" y="80" fill="#475569" font-size="12">${escapeXml(truncateText(card.fact || '未填写客观事件事实。', 28))}</text><text x="14" y="108" fill="#64748b" font-size="11">${escapeXml(truncateText(bindings || '未绑定素材', 30))}</text></g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}" role="img" aria-label="剧情画布图片导出"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b"/></marker></defs><rect width="100%" height="100%" fill="#eef2f7"/><text x="40" y="34" fill="#0f172a" font-size="20" font-weight="800">剧情画布图片导出 · ${escapeXml(plotboard.chapterId)}</text>${lines}${cards}</svg>`;
}

function getPlotboardBounds(cards: PlotCard[]): { x: number; y: number; width: number; height: number } {
  if (cards.length === 0) return { x: 0, y: 0, width: 960, height: 540 };
  const minX = Math.min(...cards.map((card) => card.x));
  const minY = Math.min(...cards.map((card) => card.y));
  const maxX = Math.max(...cards.map((card) => card.x + CARD_WIDTH));
  const maxY = Math.max(...cards.map((card) => card.y + CARD_HEIGHT));
  return { x: minX, y: minY, width: Math.max(960, maxX - minX + 80), height: Math.max(540, maxY - minY + 110) };
}

function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char] ?? char));
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
