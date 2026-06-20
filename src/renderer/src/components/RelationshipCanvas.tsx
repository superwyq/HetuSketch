import { AimOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Checkbox, Empty, Select, Slider, Space, Switch, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectEntry } from '@shared/storageTypes';

export interface CharacterNode {
  id: string;
  name: string;
  avatar?: string;
  category: string;
  importance: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  metadata: ProjectEntry;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  directed: boolean;
}

interface RelationshipCanvasProps {
  characters: ProjectEntry[];
  onSelectCharacter: (entry: ProjectEntry) => void;
}

const categoryLabels: Record<string, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  other: '其他'
};

const categoryColors: Record<string, string> = {
  protagonist: '#d97706',
  supporting: '#2563eb',
  antagonist: '#dc2626',
  other: '#64748b'
};

export function RelationshipCanvas({ characters, onSelectCharacter }: RelationshipCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id?: string; pan?: { x: number; y: number; sx: number; sy: number }; box?: { x: number; y: number; sx: number; sy: number } }>({});
  const [nodes, setNodes] = useState<CharacterNode[]>([]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [running, setRunning] = useState(true);
  const [hoverId, setHoverId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [focusDegree, setFocusDegree] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string[]>(['protagonist', 'supporting', 'antagonist', 'other']);
  const [relationFilter, setRelationFilter] = useState<string>('all');
  const [nodeSize, setNodeSize] = useState(48);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number }>();

  const edges = useMemo<RelationshipEdge[]>(() => buildEdges(characters), [characters]);
  const relationTypes = useMemo(() => Array.from(new Set(edges.map((edge) => edge.type || '关联'))), [edges]);
  const visibleIds = useMemo(() => computeVisibleIds(characters, edges, categoryFilter, relationFilter, selectedId, focusDegree), [categoryFilter, characters, edges, focusDegree, relationFilter, selectedId]);
  const visibleNodes = nodes.filter((node) => visibleIds.has(node.id));
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target) && (relationFilter === 'all' || edge.type === relationFilter));
  const selectedNode = nodes.find((node) => node.id === selectedId);
  const neighborIds = useMemo(() => getNeighborIds(edges, hoverId ?? selectedId), [edges, hoverId, selectedId]);

  useEffect(() => {
    const centerX = 520;
    const centerY = 320;
    setNodes(characters.map((entry, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(characters.length, 1);
      return {
        id: entry.id,
        name: entry.title,
        avatar: entry.customFields['头像'] || entry.customFields.avatar || entry.customFields['海报'],
        category: entry.type === 'character' ? entry.role : 'other',
        importance: Math.max(1, entry.relations.length + entry.tags.length),
        x: centerX + Math.cos(angle) * (180 + index * 4),
        y: centerY + Math.sin(angle) * (160 + index * 3),
        vx: 0,
        vy: 0,
        metadata: entry
      };
    }));
  }, [characters]);

  useEffect(() => {
    if (!running || nodes.length > 220) return;
    let frame = 0;
    let raf = 0;
    const tick = (): void => {
      frame += 1;
      setNodes((current) => simulate(current, visibleEdges));
      if (frame < 420) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, visibleEdges, nodes.length]);

  const updateNode = (id: string, x: number, y: number): void => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, x, y, vx: 0, vy: 0 } : node));
  };

  const fitView = (): void => {
    if (!visibleNodes.length) return;
    const bounds = getBounds(visibleNodes);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScale = Math.max(0.35, Math.min(1.6, Math.min((rect.width - 120) / bounds.width, (rect.height - 120) / bounds.height)));
    setScale(nextScale);
    setOffset({ x: rect.width / 2 - (bounds.x + bounds.width / 2) * nextScale, y: rect.height / 2 - (bounds.y + bounds.height / 2) * nextScale });
  };

  const resetLayout = (): void => {
    setRunning(true);
    setNodes((current) => current.map((node, index) => ({ ...node, x: 520 + Math.cos(index) * 220, y: 320 + Math.sin(index) * 180, vx: 0, vy: 0 })));
  };

  if (!characters.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无角色节点，请先创建角色并添加关系" />;
  }

  return (
    <div className="graph-workspace">
      <aside className="graph-filter-panel">
        <Typography.Title level={5}>角色筛选</Typography.Title>
        <Checkbox.Group value={categoryFilter} onChange={(value) => setCategoryFilter(value as string[])}>
          <Space direction="vertical">
            {Object.entries(categoryLabels).map(([value, label]) => <Checkbox key={value} value={value}>{label}</Checkbox>)}
          </Space>
        </Checkbox.Group>
        <Typography.Title level={5}>关系类型</Typography.Title>
        <Select value={relationFilter} onChange={setRelationFilter} className="graph-control-select" options={[{ value: 'all', label: '全部关系' }, ...relationTypes.map((type) => ({ value: type, label: type }))]} />
        <Typography.Title level={5}>聚焦模式</Typography.Title>
        <Select value={focusDegree} onChange={setFocusDegree} className="graph-control-select" options={[{ value: 0, label: '显示全部' }, { value: 1, label: '一度关系' }, { value: 2, label: '二度关系' }]} />
        <Typography.Title level={5}>节点大小</Typography.Title>
        <Slider min={34} max={82} value={nodeSize} onChange={setNodeSize} />
      </aside>

      <div
        ref={canvasRef}
        className="graph-canvas"
        onWheel={(event) => {
          event.preventDefault();
          const next = Math.max(0.25, Math.min(2.5, scale + (event.deltaY > 0 ? -0.08 : 0.08)));
          setScale(next);
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          if (event.shiftKey) {
            dragRef.current.box = { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY };
            setSelectionBox({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY, width: 0, height: 0 });
          } else {
            dragRef.current.pan = { x: offset.x, y: offset.y, sx: event.clientX, sy: event.clientY };
          }
        }}
        onMouseMove={(event) => {
          const pan = dragRef.current.pan;
          if (pan) setOffset({ x: pan.x + event.clientX - pan.sx, y: pan.y + event.clientY - pan.sy });
          const box = dragRef.current.box;
          if (box) setSelectionBox({ x: Math.min(event.clientX, box.sx) - event.currentTarget.getBoundingClientRect().left, y: Math.min(event.clientY, box.sy) - event.currentTarget.getBoundingClientRect().top, width: Math.abs(event.clientX - box.sx), height: Math.abs(event.clientY - box.sy) });
        }}
        onMouseUp={() => { dragRef.current.pan = undefined; dragRef.current.box = undefined; setSelectionBox(undefined); }}
        onDoubleClick={(event) => {
          if ((event.target as Element).closest('.graph-node-button')) return;
          const name = window.prompt('新建角色名称');
          if (name) setNodes((current) => [...current, { id: `draft-${Date.now()}`, name, category: 'other', importance: 1, x: (event.nativeEvent.offsetX - offset.x) / scale, y: (event.nativeEvent.offsetY - offset.y) / scale, vx: 0, vy: 0, metadata: characters[0] }]);
        }}
      >
        <div className="graph-toolbar">
          <Button icon={<AimOutlined />} onClick={fitView}>适应视图</Button>
          <Button icon={<ReloadOutlined />} onClick={resetLayout}>重置布局</Button>
          <Button icon={<ZoomOutOutlined />} onClick={() => setScale((value) => Math.max(0.25, value - 0.12))} />
          <span>{Math.round(scale * 100)}%</span>
          <Button icon={<ZoomInOutlined />} onClick={() => setScale((value) => Math.min(2.5, value + 0.12))} />
          <Switch checked={running} onChange={setRunning} checkedChildren={<PlayCircleOutlined />} unCheckedChildren={<PauseOutlined />} />
        </div>
        <svg className="graph-svg">
          <defs>
            <marker id="graph-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#9a6a3a" />
            </marker>
          </defs>
          <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
            {visibleEdges.map((edge) => {
              const source = nodes.find((node) => node.id === edge.source);
              const target = nodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              const dimmed = hoverId && hoverId !== source.id && hoverId !== target.id && !neighborIds.has(source.id) && !neighborIds.has(target.id);
              return <g key={edge.id} className={`graph-edge-svg ${dimmed ? 'is-dimmed' : ''}`} onClick={() => setSelectedId(source.id)}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd={edge.directed ? 'url(#graph-arrow)' : undefined} strokeDasharray={edge.type.includes('敌') ? '8 7' : undefined} />
                <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8}>{edge.label}</text>
              </g>;
            })}
            {visibleNodes.map((node) => {
              const radius = nodeSize + Math.min(18, node.importance * 2);
              const dimmed = hoverId && hoverId !== node.id && !neighborIds.has(node.id);
              return <g key={node.id} className={`graph-node-group ${selectedId === node.id ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`} transform={`translate(${node.x},${node.y})`}>
                <circle r={radius / 2 + 9} fill={categoryColors[node.category] ?? categoryColors.other} opacity="0.18" />
                <foreignObject x={-radius / 2} y={-radius / 2} width={radius} height={radius + 42}>
                  <button
                    className="graph-node-button"
                    onMouseEnter={() => setHoverId(node.id)}
                    onMouseLeave={() => setHoverId(undefined)}
                    onMouseDown={(event) => { event.stopPropagation(); dragRef.current.id = node.id; }}
                    onMouseMove={(event) => {
                      if (dragRef.current.id === node.id) updateNode(node.id, (event.clientX - offset.x - (canvasRef.current?.getBoundingClientRect().left ?? 0)) / scale, (event.clientY - offset.y - (canvasRef.current?.getBoundingClientRect().top ?? 0)) / scale);
                    }}
                    onMouseUp={() => { dragRef.current.id = undefined; }}
                    onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); onSelectCharacter(node.metadata); }}
                  >
                    <span className="graph-avatar" style={{ borderColor: categoryColors[node.category] ?? categoryColors.other }}>{node.avatar ? <img src={node.avatar} alt={node.name} /> : <Avatar>{node.name.slice(0, 1)}</Avatar>}</span>
                    <span className="graph-node-name">{node.name}</span>
                  </button>
                </foreignObject>
              </g>;
            })}
          </g>
        </svg>
        {selectionBox && <div className="graph-selection-box" style={selectionBox} />}
        {nodes.length > 200 && <div className="graph-performance-hint">节点超过 200，已限制模拟强度以保持流畅</div>}
      </div>

      <aside className="graph-detail-panel">
        {selectedNode ? (
          <Card className="graph-detail-card">
            <Space direction="vertical" size="middle" className="full-width">
              <Avatar size={72} src={selectedNode.avatar}>{selectedNode.name.slice(0, 1)}</Avatar>
              <div>
                <Typography.Title level={4}>{selectedNode.name}</Typography.Title>
                <Tag color={categoryToAntColor(selectedNode.category)}>{categoryLabels[selectedNode.category] ?? '角色'}</Tag>
              </div>
              <Typography.Paragraph>{selectedNode.metadata.summary || selectedNode.metadata.content || '暂无角色简介'}</Typography.Paragraph>
              <Typography.Text type="secondary">直接关联：{Array.from(getNeighborIds(edges, selectedNode.id)).length} 个</Typography.Text>
              <Button type="primary" onClick={() => onSelectCharacter(selectedNode.metadata)}>查看详情</Button>
            </Space>
          </Card>
        ) : (
          <Card className="graph-detail-card"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击节点查看详情" /></Card>
        )}
      </aside>
    </div>
  );
}

function buildEdges(characters: ProjectEntry[]): RelationshipEdge[] {
  const ids = new Set(characters.map((entry) => entry.id));
  return characters.flatMap((entry) => entry.relations.filter((relation) => ids.has(relation.targetId)).map((relation, index) => ({
    id: `${entry.id}-${relation.targetId}-${index}`,
    source: entry.id,
    target: relation.targetId,
    type: relation.label || '关联',
    label: relation.label || '关联',
    directed: !relation.label?.includes('双向')
  })));
}

function simulate(nodes: CharacterNode[], edges: RelationshipEdge[]): CharacterNode[] {
  const next = nodes.map((node) => ({ ...node }));
  const map = new Map(next.map((node) => [node.id, node]));
  for (let i = 0; i < next.length; i += 1) {
    for (let j = i + 1; j < next.length; j += 1) {
      const a = next[i];
      const b = next[j];
      const dx = a.x - b.x || 1;
      const dy = a.y - b.y || 1;
      const distance = Math.max(40, Math.sqrt(dx * dx + dy * dy));
      const force = 900 / (distance * distance);
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  }
  for (const edge of edges) {
    const source = map.get(edge.source);
    const target = map.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const force = (distance - 180) * 0.004;
    source.vx += dx / distance * force;
    source.vy += dy / distance * force;
    target.vx -= dx / distance * force;
    target.vy -= dy / distance * force;
  }
  return next.map((node) => ({ ...node, x: node.x + node.vx, y: node.y + node.vy, vx: node.vx * 0.86, vy: node.vy * 0.86 }));
}

function getNeighborIds(edges: RelationshipEdge[], id?: string): Set<string> {
  const result = new Set<string>();
  if (!id) return result;
  for (const edge of edges) {
    if (edge.source === id) result.add(edge.target);
    if (edge.target === id) result.add(edge.source);
  }
  return result;
}

function computeVisibleIds(characters: ProjectEntry[], edges: RelationshipEdge[], categories: string[], relationType: string, selectedId?: string, degree = 0): Set<string> {
  const base = new Set(characters.filter((entry) => entry.type === 'character' && categories.includes(entry.role)).map((entry) => entry.id));
  if (!selectedId || degree === 0) return base;
  const visible = new Set<string>([selectedId]);
  let frontier = new Set<string>([selectedId]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Set<string>();
    for (const edge of edges) {
      if (relationType !== 'all' && edge.type !== relationType) continue;
      if (frontier.has(edge.source)) next.add(edge.target);
      if (frontier.has(edge.target)) next.add(edge.source);
    }
    for (const id of next) visible.add(id);
    frontier = next;
  }
  return new Set(Array.from(visible).filter((id) => base.has(id)));
}

function getBounds(nodes: CharacterNode[]): { x: number; y: number; width: number; height: number } {
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function categoryToAntColor(category: string): string {
  return ({ protagonist: 'volcano', supporting: 'blue', antagonist: 'red', other: 'default' } as Record<string, string>)[category] ?? 'default';
}
