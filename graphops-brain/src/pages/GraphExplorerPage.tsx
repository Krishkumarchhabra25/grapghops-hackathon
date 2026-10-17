import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeftRight, ArrowRight, ArrowUpRight,
  BarChart3, Crosshair, Focus, GitBranch, Loader2, Minus,
  Network, Play, Plus, RefreshCw, Search, Target, Users, X, Zap, FileSearch,
} from 'lucide-react';
import { PageTitle } from '../components/ui/PageTitle';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../contexts/ToastContext';
import { useFetch } from '../lib/hooks';
import { graphApi } from '../lib/api';
import { cx } from '../lib/utils';

// ============================================================
// Types
// ============================================================
type GraphNode = { id: string; type: string; name: string; status: string };
type GraphEdge = { source: string; target: string; type: string };

type SubgraphResponse = {
  center: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
};

type PathNode = { label: string; id: string };
type PathResponse = { path: PathNode[]; rels: string[] };

type BlastRadiusItem = { service: string; name?: string | null; hops: number };
type BlastRadiusResponse = { root: string; affected: BlastRadiusItem[] };

type CriticalityItem = { service: string; score: number };
type CriticalityResponse = { services: CriticalityItem[] };

type CommunityItem = { community: string; services: string[] };
type CommunitiesResponse = { communities: CommunityItem[] };

type TemplateRow = Record<string, unknown>;
type TemplateResponse = { query_id: string; rows: TemplateRow[]; count: number };

// ============================================================
// Visual config
// ============================================================
const NODE_COLORS: Record<string, string> = {
  Service:        '#b9f56a',
  Dependency:     '#f4a261',
  Deployment:     '#a78bfa',
  Incident:       '#ff9eaa',
  ErrorSignature: '#8bc9ff',
  Fix:            '#6ee7b7',
  Outcome:        '#57e0b0',
  Person:         '#8bc9ff',
  Team:           '#f4a261',
  Document:       '#8bc9ff',
  Decision:       '#f4a261',
  Memory:         '#c4b5fd',
  AgentRun:       '#57e0b0',
  Finding:        '#f4a261',
  Action:         '#b9f56a',
  Approval:       '#f4a261',
  RunEvent:       '#94a3b8',
  AuditEvent:     '#64748b',
};

function colorForType(type: string): string {
  return NODE_COLORS[type] || '#94a3b8';
}

const NODE_TYPES = [
  'All', 'Service', 'Dependency', 'Deployment', 'Incident', 'Person',
  'Team', 'Document', 'Memory', 'AgentRun', 'Finding', 'Fix',
];

// ============================================================
// Layout — concentric rings by BFS hop distance, generous spacing
// ============================================================
const VIEW_W = 1400;
const VIEW_H = 800;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  center: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  // BFS from center
  const hopMap = new Map<string, number>();
  if (adj.has(center)) {
    hopMap.set(center, 0);
    const q: string[] = [center];
    while (q.length) {
      const cur = q.shift()!;
      const d = hopMap.get(cur)!;
      for (const nb of adj.get(cur) ?? []) {
        if (!hopMap.has(nb)) {
          hopMap.set(nb, d + 1);
          q.push(nb);
        }
      }
    }
  }
  // Orphans fall back to hop 1
  for (const n of nodes) if (!hopMap.has(n.id)) hopMap.set(n.id, 1);

  // Group by hop
  const byHop = new Map<number, string[]>();
  for (const n of nodes) {
    const d = hopMap.get(n.id)!;
    if (!byHop.has(d)) byHop.set(d, []);
    byHop.get(d)!.push(n.id);
  }

  const midX = VIEW_W / 2;
  const midY = VIEW_H / 2;

  // Generous ring spacing — scales with hop count so we always have room.
  const maxHop = Math.max(...hopMap.values(), 1);
  const baseRadius = 140;
  const ringSpacing = Math.min(190, (Math.min(VIEW_W, VIEW_H) / 2 - baseRadius - 60) / Math.max(1, maxHop));

  for (const [hop, ids] of byHop) {
    if (hop === 0) {
      for (const id of ids) positions.set(id, { x: midX, y: midY });
      continue;
    }
    const r = baseRadius + (hop - 1) * ringSpacing;
    const count = ids.length;
    // Distribute around the circle starting from the top (-π/2).
    // Add a small angle offset per hop so rings don't line up radially.
    const offset = (hop % 2) * (Math.PI / Math.max(1, count));
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + offset - Math.PI / 2;
      positions.set(ids[i], {
        x: midX + Math.cos(angle) * r,
        y: midY + Math.sin(angle) * r,
      });
    }
  }

  return positions;
}

// ============================================================
// Page
// ============================================================
export function GraphExplorerPage() {
  const { notify } = useToast();

  // Canvas controls
  const [center, setCenter] = useState('svc-checkout');
  const [hops, setHops] = useState(2);
  const [nodeSearch, setNodeSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  // Pan/zoom transform (in viewBox units)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    startX: number; startY: number; tx: number; ty: number; scale: number; moved: boolean;
  } | null>(null);
  // Used to swallow the click that follows a drag
  const justDraggedRef = useRef(false);

  // Evidence path
  const [pathFrom, setPathFrom] = useState('deploy-42');
  const [pathTo, setPathTo] = useState('inc-2481');
  const [pathResult, setPathResult] = useState<PathResponse | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  // Right tab
  const [rightTab, setRightTab] = useState<'entity' | 'blast' | 'criticality' | 'communities' | 'templates'>('entity');

  // ---------- Fetches ----------
  const subgraph = useFetch(
    () => graphApi.subgraph(center, hops) as Promise<SubgraphResponse>,
    [center, hops],
  );
  const criticality = useFetch(
    () => graphApi.criticality() as Promise<CriticalityResponse>,
  );
  const communities = useFetch(
    () => graphApi.communities() as Promise<CommunitiesResponse>,
  );
  const blast = useFetch(
    () => selectedId?.startsWith('svc-')
      ? graphApi.blastRadius(selectedId, 3) as Promise<BlastRadiusResponse>
      : Promise.resolve(null),
    [selectedId],
  );

  // ---------- Derived ----------
  const nodes = subgraph.data?.nodes ?? [];
  const edges = subgraph.data?.edges ?? [];

  const layout = useMemo(
    () => computeLayout(nodes, edges, center),
    [nodes, edges, center],
  );

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedId) || null,
    [nodes, selectedId],
  );

  // Whether the <svg> is actually mounted (it's conditionally rendered)
  const canvasVisible = !subgraph.loading && !subgraph.error && nodes.length > 0;

  // Set of node IDs that should stay bright. Everything else dims.
  const { brightIds, hiddenIds } = useMemo(() => {
    const bright = new Set<string>();
    const hidden = new Set<string>();

    const passFilter = (n: GraphNode) => {
      if (typeFilter !== 'All' && n.type !== typeFilter) return false;
      const s = nodeSearch.trim().toLowerCase();
      if (s && !`${n.id} ${n.name}`.toLowerCase().includes(s)) return false;
      return true;
    };

    if (!selectedId) {
      for (const n of nodes) if (passFilter(n)) bright.add(n.id);
      return { brightIds: bright, hiddenIds: hidden };
    }

    const selected = selectedId;
    const neighbors = new Set<string>([selected]);
    for (const e of edges) {
      if (e.source === selected) neighbors.add(e.target);
      if (e.target === selected) neighbors.add(e.source);
    }

    if (focusMode) {
      for (const n of nodes) {
        if (neighbors.has(n.id) && passFilter(n)) bright.add(n.id);
        else hidden.add(n.id);
      }
    } else {
      for (const n of nodes) {
        if (neighbors.has(n.id) && passFilter(n)) bright.add(n.id);
        else if (!passFilter(n)) hidden.add(n.id);
      }
    }
    return { brightIds: bright, hiddenIds: hidden };
  }, [nodes, edges, selectedId, focusMode, nodeSearch, typeFilter]);

  // ---------- Coordinate helper ----------
  // Convert a client (screen) point into SVG viewBox coordinates.
  // Uses the real screen CTM so letterboxing (preserveAspectRatio) is handled correctly.
  const clientToView = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // ---------- Wheel zoom (native, NON-passive so preventDefault works) ----------
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      // Stop the page from scrolling while the cursor is over the canvas
      e.preventDefault();
      e.stopPropagation();

      const p = clientToView(e.clientX, e.clientY);
      if (!p) return;

      // Normalize delta across mouse wheels / trackpads / line-mode devices
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= 400;
      delta = Math.max(-120, Math.min(120, delta));

      setTransform(prev => {
        const factor = Math.exp(-delta * 0.0018);
        const nextK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.k * factor));
        if (nextK === prev.k) return prev;
        // Keep the world point under the cursor fixed
        const wx = (p.x - prev.x) / prev.k;
        const wy = (p.y - prev.y) / prev.k;
        return { k: nextK, x: p.x - wx * nextK, y: p.y - wy * nextK };
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [canvasVisible, clientToView]);

  // ---------- Pan handlers ----------
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Don't start a pan when pressing on a node — that's a click.
    const target = e.target as Element;
    if (target.closest('[data-node]')) return;

    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tx: transform.x,
      ty: transform.y,
      scale: ctm.a || 1, // screen px per viewBox unit
      moved: false,
    };
  }, [transform.x, transform.y]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (!d.moved && Math.abs(dxPx) + Math.abs(dyPx) > 3) d.moved = true;
    const dx = dxPx / d.scale;
    const dy = dyPx / d.scale;
    setTransform(prev => ({ ...prev, x: d.tx + dx, y: d.ty + dy }));
  }, []);

  const endDrag = useCallback(() => {
    if (dragRef.current?.moved) {
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
    }
    dragRef.current = null;
  }, []);

  // Clicking empty canvas (not after a drag) clears selection
  const onCanvasClick = useCallback(() => {
    if (justDraggedRef.current) return;
    setSelectedId(null);
  }, []);

  const resetView = () => {
    setTransform({ x: 0, y: 0, k: 1 });
    setSelectedId(null);
    notify('View reset');
  };

  const zoomBy = (factor: number) => {
    setTransform(prev => {
      const nextK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.k * factor));
      if (nextK === prev.k) return prev;
      const midX = VIEW_W / 2, midY = VIEW_H / 2;
      const wx = (midX - prev.x) / prev.k;
      const wy = (midY - prev.y) / prev.k;
      return { k: nextK, x: midX - wx * nextK, y: midY - wy * nextK };
    });
  };

  const recenter = (id: string) => {
    setCenter(id);
    setSelectedId(id);
    setTransform({ x: 0, y: 0, k: 1 });
    notify(`Centered on ${id}`);
  };

  // ---------- Evidence path ----------
  const loadPath = useCallback(async (from: string, to: string) => {
    setPathLoading(true);
    setPathError(null);
    try {
      const res = await graphApi.path(from, to) as PathResponse;
      setPathResult(res);
    } catch (e: any) {
      setPathError(e?.message || 'No path found');
      setPathResult(null);
    } finally {
      setPathLoading(false);
    }
  }, []);

  const swapPath = () => {
    const a = pathFrom, b = pathTo;
    setPathFrom(b); setPathTo(a);
    if (pathResult) loadPath(b, a);
  };

  // ---------- Node click ----------
  const onNodeClick = (id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  };

  const onNodeDoubleClick = (id: string) => {
    recenter(id);
  };

  return (
    <>
      <PageTitle
        eyebrow="Intelligence / Context"
        title="Graph explorer"
        description="Traverse the connected context that powers agent reasoning. Drag to pan, scroll to zoom, click a node to focus."
        actions={
          <button
            className="btn-secondary"
            onClick={() => { subgraph.refetch(); criticality.refetch(); communities.refetch(); }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* Stat row */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Nodes in view"
          value={nodes.length}
          icon={Network}
          accent="violet"
          description={subgraph.data?.truncated ? 'Truncated at 100 paths' : undefined}
        />
        <StatCard label="Relationships" value={edges.length} icon={GitBranch} />
        <StatCard
          label="Critical services"
          value={criticality.data?.services.length ?? 0}
          icon={BarChart3}
          accent="blue"
        />
        <StatCard
          label="Communities"
          value={communities.data?.communities.length ?? 0}
          icon={Users}
          accent="lime"
        />
      </div>

      {/* Evidence path panel */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-[#33472f] bg-gradient-to-br from-[#17251b] to-[#111820]">
        <div className="border-b border-[#2a3a2c] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime/10 text-lime">
                <Target size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Evidence path</h2>
                <p className="mt-1 text-[11px] text-slate-400">
                  Shortest undirected path between two nodes — proves the causal chain.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                className="rounded-full border border-line bg-[#0e141c] px-2.5 py-1 text-[10px] text-slate-400 hover:border-lime/40 hover:text-lime"
                onClick={() => { setPathFrom('deploy-42'); setPathTo('inc-2481'); loadPath('deploy-42', 'inc-2481'); }}
              >
                deploy-42 → inc-2481
              </button>
              <button
                className="rounded-full border border-line bg-[#0e141c] px-2.5 py-1 text-[10px] text-slate-400 hover:border-lime/40 hover:text-lime"
                onClick={() => { setPathFrom('inc-2481'); setPathTo('fix-rollback-sdk-3-1-8'); loadPath('inc-2481', 'fix-rollback-sdk-3-1-8'); }}
              >
                inc-2481 → fix
              </button>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">FROM</span>
              <input
                className="input !pl-14 font-mono text-xs"
                value={pathFrom}
                onChange={e => setPathFrom(e.target.value)}
                placeholder="deploy-42"
              />
            </div>
            <button
              onClick={swapPath}
              className="self-center rounded-lg border border-line bg-[#0e141c] p-2 text-slate-400 hover:border-lime/40 hover:text-lime"
              title="Swap"
            >
              <ArrowLeftRight size={14} />
            </button>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">TO</span>
              <input
                className="input !pl-10 font-mono text-xs"
                value={pathTo}
                onChange={e => setPathTo(e.target.value)}
                placeholder="inc-2481"
              />
            </div>
            <button
              className="btn-primary !py-2.5"
              onClick={() => loadPath(pathFrom, pathTo)}
              disabled={pathLoading || !pathFrom.trim() || !pathTo.trim()}
            >
              {pathLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Find path
            </button>
          </div>

          {pathError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] text-amber-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <div>{pathError}</div>
            </div>
          )}

          {pathResult && (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                {pathResult.path.map((node, i) => (
                  <div key={`${node.id}-${i}`} className="flex items-center gap-2">
                    <button
                      onClick={() => recenter(node.id)}
                      className="group flex flex-col items-center rounded-xl border px-3 py-2 transition-colors hover:border-lime/60"
                      style={{ borderColor: `${colorForType(node.label)}44`, background: `${colorForType(node.label)}12` }}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: colorForType(node.label) }}>
                        {node.label}
                      </span>
                      <span className="mt-1 font-mono text-[10px] text-slate-200 group-hover:text-lime">{node.id}</span>
                    </button>
                    {i < pathResult.path.length - 1 && (
                      <div className="flex flex-col items-center">
                        <ArrowRight size={14} className="text-slate-600" />
                        <span className="mt-0.5 font-mono text-[8px] text-slate-500">{pathResult.rels[i]}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                {pathResult.path.length} nodes · {pathResult.rels.length} relationships
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Canvas + side panel */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {/* LEFT: canvas */}
        <div className="card overflow-hidden">
          {/* Controls */}
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input !w-[170px] !py-2 !pl-8 text-[11px]"
                  placeholder="Find node..."
                  value={nodeSearch}
                  onChange={e => setNodeSearch(e.target.value)}
                />
              </div>
              <select
                className="input !w-auto !py-2 text-[11px]"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                {NODE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-[#0e141c] px-2 py-1">
                <span className="text-[10px] text-slate-500">Hops</span>
                <input
                  type="range" min="1" max="3"
                  value={hops}
                  onChange={e => setHops(Number(e.target.value))}
                  className="w-14 accent-[#b9f56a]"
                />
                <span className="w-3 font-mono text-[10px] text-lime">{hops}</span>
              </div>
              <button
                onClick={() => setFocusMode(v => !v)}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors',
                  focusMode
                    ? 'border-lime/40 bg-lime/10 text-lime'
                    : 'border-line bg-[#0e141c] text-slate-400 hover:border-slate-600',
                )}
                title="When ON, only the selected node and its neighbors are visible."
              >
                <Focus size={12} />
                Focus
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-2 font-mono text-[10px] text-slate-500">center: {center}</span>
              <button className="btn-ghost !p-1.5" onClick={() => zoomBy(0.8)} title="Zoom out">
                <Minus size={14} />
              </button>
              <span className="w-10 text-center font-mono text-[10px] text-slate-400">
                {Math.round(transform.k * 100)}%
              </span>
              <button className="btn-ghost !p-1.5" onClick={() => zoomBy(1.25)} title="Zoom in">
                <Plus size={14} />
              </button>
              <button className="btn-ghost !p-1.5" onClick={resetView} title="Reset view">
                <Crosshair size={14} />
              </button>
            </div>
          </div>

          {/* Canvas */}
          {subgraph.loading ? (
            <div className="h-[600px]">
              <LoadingSpinner label="Loading graph…" />
            </div>
          ) : subgraph.error ? (
            <div className="h-[600px]">
              <EmptyState
                icon={AlertTriangle}
                title="Couldn't load subgraph"
                description={subgraph.error.message}
                action={<button className="btn-secondary" onClick={subgraph.refetch}>Retry</button>}
              />
            </div>
          ) : nodes.length === 0 ? (
            <div className="h-[600px]">
              <EmptyState
                icon={Network}
                title={`No neighborhood around ${center}`}
                description="Try a different center node, or increase the hops."
              />
            </div>
          ) : (
            <div
              className="relative overflow-hidden bg-[#0b1118]"
              style={{ overscrollBehavior: 'contain' }}
            >
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="h-[600px] w-full cursor-grab select-none active:cursor-grabbing"
                style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onClick={onCanvasClick}
              >
                <defs>
                  <pattern id="dotgrid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="#313a46" opacity=".3" />
                  </pattern>
                </defs>
                <rect width={VIEW_W} height={VIEW_H} fill="url(#dotgrid)" />

                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                  {/* Edges — drawn first, so nodes sit on top */}
                  {edges.map((e, i) => {
                    const a = layout.get(e.source);
                    const b = layout.get(e.target);
                    if (!a || !b) return null;
                    if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) return null;

                    const isFocusedEdge =
                      selectedId !== null &&
                      (e.source === selectedId || e.target === selectedId);

                    const isBright =
                      brightIds.has(e.source) && brightIds.has(e.target);

                    const opacity = isFocusedEdge ? 1 : isBright ? 0.5 : 0.12;
                    const stroke = isFocusedEdge ? '#a8e85e' : '#445260';
                    const width = isFocusedEdge ? 2.2 : 1.1;

                    return (
                      <g key={`${e.source}-${e.target}-${e.type}-${i}`} opacity={opacity} pointerEvents="none">
                        <line
                          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={stroke}
                          strokeWidth={width}
                        />
                        {(isFocusedEdge || isBright) && (
                          <text
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2 - 4}
                            fill={isFocusedEdge ? '#b9f56a' : '#6b7b8e'}
                            fontSize="9"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {e.type}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map(n => {
                    if (hiddenIds.has(n.id)) return null;
                    const p = layout.get(n.id);
                    if (!p) return null;

                    const isSelected = selectedId === n.id;
                    const isCenter = n.id === center;
                    const isBright = brightIds.has(n.id);
                    const isNeighborOfSelection =
                      selectedId !== null &&
                      edges.some(e =>
                        (e.source === selectedId && e.target === n.id) ||
                        (e.target === selectedId && e.source === n.id),
                      );

                    const r = isSelected ? 20 : isCenter ? 18 : isNeighborOfSelection ? 14 : 12;
                    const color = colorForType(n.type);

                    const nodeOpacity = isBright ? 1 : selectedId ? 0.15 : 1;

                    const showLabel =
                      isSelected ||
                      isCenter ||
                      isNeighborOfSelection ||
                      (selectedId === null && !nodeSearch);

                    return (
                      <g
                        key={n.id}
                        data-node={n.id}
                        onClick={(e) => { e.stopPropagation(); onNodeClick(n.id); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onNodeDoubleClick(n.id); }}
                        style={{ cursor: 'pointer' }}
                        opacity={nodeOpacity}
                      >
                        {/* Selection halo */}
                        {(isSelected || isNeighborOfSelection) && (
                          <circle
                            cx={p.x} cy={p.y}
                            r={r + (isSelected ? 14 : 8)}
                            fill={isSelected ? color : '#a8e85e'}
                            opacity={isSelected ? 0.2 : 0.08}
                          />
                        )}
                        {/* Ring */}
                        <circle
                          cx={p.x} cy={p.y}
                          r={r}
                          fill="#111821"
                          stroke={color}
                          strokeWidth={isSelected ? 3 : isNeighborOfSelection ? 2.4 : isCenter ? 2.4 : 1.6}
                        />
                        {/* Core */}
                        <circle cx={p.x} cy={p.y} r={r * 0.4} fill={color} />

                        {isCenter && (
                          <text
                            x={p.x} y={p.y - r - 8}
                            fill="#b9f56a"
                            fontSize="9"
                            fontWeight="700"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            CENTER
                          </text>
                        )}

                        {showLabel && (
                          <text
                            x={p.x} y={p.y + r + 16}
                            fill={isSelected ? '#f0f5fb' : isCenter ? '#dbe6f2' : '#9aa8b8'}
                            fontSize={isSelected ? '12' : isCenter ? '11' : '10'}
                            fontWeight={isSelected || isCenter ? '700' : '500'}
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {n.name.length > 22 ? n.name.slice(0, 20) + '…' : n.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Floating hints */}
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 rounded-lg border border-line bg-[#111821]/95 px-3 py-2 text-[9px] text-slate-500 backdrop-blur">
                <span>🖱️ drag to pan</span>
                <span className="text-slate-700">·</span>
                <span>scroll to zoom</span>
                <span className="text-slate-700">·</span>
                <span>click to focus</span>
                <span className="text-slate-700">·</span>
                <span>double-click to recenter</span>
              </div>

              {/* Legend */}
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-line bg-[#111821]/95 p-2.5 backdrop-blur">
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                  Node types in view
                </div>
                <div className="flex max-w-[300px] flex-wrap gap-x-3 gap-y-1">
                  {[...new Set(nodes.map(n => n.type))].sort().map(t => (
                    <span key={t} className="flex items-center gap-1.5 text-[9px] text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorForType(t) }} />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Focus mode indicator */}
              {focusMode && selectedId && (
                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-lg border border-lime/30 bg-lime/10 px-3 py-1.5 text-[10px] font-semibold text-lime">
                  <Focus size={12} />
                  Focus: {selectedId}
                  <button
                    onClick={() => setSelectedId(null)}
                    className="ml-1 rounded p-0.5 text-lime/70 hover:text-lime"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}

              {subgraph.data?.truncated && !focusMode && (
                <div className="absolute right-4 top-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-200">
                  Truncated at 100 paths
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[10px] text-slate-600">
            <span>
              {selectedId
                ? `Selected ${selectedId} · ${brightIds.size} node${brightIds.size === 1 ? '' : 's'} in focus`
                : `${brightIds.size} of ${nodes.length} nodes visible`}
            </span>
            <span>Double-click a node to re-center the graph on it</span>
          </div>
        </div>

        {/* RIGHT: tabs */}
        <div className="card overflow-hidden">
          <div className="flex gap-3 overflow-x-auto border-b border-line px-3">
            {(
              [
                ['entity', 'Entity', Network],
                ['blast', 'Blast', Zap],
                ['criticality', 'Rank', BarChart3],
                ['communities', 'Clusters', Users],
                ['templates', 'Queries', FileSearch],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={cx(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 py-3 text-[11px] font-semibold transition-colors',
                  rightTab === key ? 'border-lime text-lime' : 'border-transparent text-slate-500 hover:text-slate-300',
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {rightTab === 'entity' && (
              <EntityPanel
                node={selectedNode}
                edges={edges}
                allNodes={nodes}
                onRecenter={recenter}
                onSelect={setSelectedId}
              />
            )}
            {rightTab === 'blast' && (
              <BlastPanel
                loading={blast.loading}
                error={blast.error}
                data={blast.data}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            {rightTab === 'criticality' && (
              <CriticalityPanel
                loading={criticality.loading}
                error={criticality.error}
                data={criticality.data}
                onSelect={setSelectedId}
                onRecenter={recenter}
              />
            )}
            {rightTab === 'communities' && (
              <CommunitiesPanel
                loading={communities.loading}
                error={communities.error}
                data={communities.data}
                onSelect={setSelectedId}
              />
            )}
            {rightTab === 'templates' && (
              <TemplatesPanel />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Entity panel
// ============================================================
function EntityPanel({
  node, edges, allNodes, onRecenter, onSelect,
}: {
  node: GraphNode | null;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onRecenter: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (!node) {
    return (
      <EmptyState
        icon={Network}
        title="No node selected"
        description="Click any node to inspect it, and its neighbors will stay bright while the rest of the graph fades out."
      />
    );
  }

  const related = edges
    .filter(e => e.source === node.id || e.target === node.id)
    .map(e => ({
      other: e.source === node.id ? e.target : e.source,
      type: e.type,
      direction: e.source === node.id ? 'out' : 'in',
    }));

  const color = colorForType(node.type);

  const route =
    node.id.startsWith('svc-') ? `/services/${node.id}` :
    node.id.startsWith('inc-') ? `/incidents/${node.id}` :
    node.id.startsWith('run-') ? `/runs/${node.id}` :
    node.id.startsWith('doc-') ? `/knowledge` :
    node.id.startsWith('usr-') ? `/team` :
    '/graph';

  return (
    <>
      <div
        className="mb-4 rounded-xl border p-3"
        style={{ borderColor: `${color}44`, background: `${color}0d` }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>
            <Network size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{node.type}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-100">{node.name}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{node.id}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {node.status && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Status</span>
            <span className="text-slate-300">{node.status}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">Connections</span>
          <span className="font-mono text-slate-300">{related.length}</span>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button className="btn-secondary flex-1 !py-2 text-[11px]" onClick={() => onRecenter(node.id)}>
          <Target size={12} /> Re-center
        </button>
        <Link to={route} className="btn-secondary !py-2 text-[11px]">
          <ArrowUpRight size={12} />
        </Link>
      </div>

      {related.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Connections</p>
          <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
            {related.map((r, i) => {
              const other = allNodes.find(n => n.id === r.other);
              const oc = other ? colorForType(other.type) : '#94a3b8';
              return (
                <button
                  key={`${r.other}-${r.type}-${i}`}
                  onClick={() => onSelect(r.other)}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-[#0e141c] px-2 py-1.5 text-left hover:border-lime/40"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: oc }} />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">
                    {other?.name || r.other}
                  </span>
                  <span className="font-mono text-[8px] text-slate-600">
                    {r.direction === 'out' ? '→' : '←'} {r.type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Blast radius panel
// ============================================================
function BlastPanel({
  loading, error, data, selectedId, onSelect,
}: {
  loading: boolean;
  error: Error | null;
  data: BlastRadiusResponse | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!selectedId || !selectedId.startsWith('svc-')) {
    return (
      <EmptyState
        icon={Zap}
        title="Select a Service"
        description="Blast radius shows which services depend on the selected one."
      />
    );
  }
  if (loading) return <LoadingSpinner label="Computing blast radius…" />;
  if (error) return <div className="rounded-lg border border-rose-900/50 bg-[#28181d] p-3 text-[11px] text-rose-200">{error.message}</div>;
  if (!data || data.affected.length === 0) {
    return <EmptyState icon={Zap} title="No downstream services" description={`Nothing depends on ${selectedId}.`} />;
  }
  return (
    <>
      <p className="mb-3 text-[11px] text-slate-400">
        If <span className="font-mono text-lime">{selectedId}</span> fails:
      </p>
      <div className="space-y-1.5">
        {data.affected.map(a => (
          <button
            key={a.service}
            onClick={() => onSelect(a.service)}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-[#0e141c] px-3 py-2 text-left hover:border-lime/40"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-400/10 text-rose-300">
              <Zap size={12} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] text-slate-200">{a.service}</p>
              {a.name && <p className="mt-0.5 truncate text-[10px] text-slate-500">{a.name}</p>}
            </div>
            <span className="rounded-full bg-[#202a35] px-2 py-0.5 font-mono text-[9px] text-slate-400">
              {a.hops} hop{a.hops === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ============================================================
// Criticality panel
// ============================================================
function CriticalityPanel({
  loading, error, data, onSelect, onRecenter,
}: {
  loading: boolean;
  error: Error | null;
  data: CriticalityResponse | null;
  onSelect: (id: string) => void;
  onRecenter: (id: string) => void;
}) {
  if (loading) return <LoadingSpinner label="Running PageRank…" />;
  if (error) return <div className="rounded-lg border border-rose-900/50 bg-[#28181d] p-3 text-[11px] text-rose-200">{error.message}</div>;
  if (!data || data.services.length === 0) return <EmptyState icon={BarChart3} title="No criticality data" />;

  const max = Math.max(...data.services.map(s => s.score), 0.0001);
  return (
    <>
      <p className="mb-3 text-[11px] text-slate-400">
        PageRank over <span className="font-mono text-slate-300">DEPENDS_ON</span>.
      </p>
      <div className="space-y-2">
        {data.services.map((s, i) => (
          <button
            key={s.service}
            onClick={() => { onSelect(s.service); onRecenter(s.service); }}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-[#0e141c] px-3 py-2 text-left hover:border-lime/40"
          >
            <span className={cx(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold',
              i === 0 ? 'bg-lime/20 text-lime' : 'bg-[#202a35] text-slate-500',
            )}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[11px] text-slate-200">{s.service}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#28313d]">
                <div className="h-full rounded-full bg-lime" style={{ width: `${(s.score / max) * 100}%` }} />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[9px] text-slate-400">
              {s.score.toFixed(3)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ============================================================
// Communities panel
// ============================================================
function CommunitiesPanel({
  loading, error, data, onSelect,
}: {
  loading: boolean;
  error: Error | null;
  data: CommunitiesResponse | null;
  onSelect: (id: string) => void;
}) {
  if (loading) return <LoadingSpinner label="Detecting communities…" />;
  if (error) return <div className="rounded-lg border border-rose-900/50 bg-[#28181d] p-3 text-[11px] text-rose-200">{error.message}</div>;
  if (!data || data.communities.length === 0) return <EmptyState icon={Users} title="No communities found" />;

  return (
    <>
      <p className="mb-3 text-[11px] text-slate-400">
        Weakly-connected components. Services in the same cluster fail together.
      </p>
      <div className="space-y-2">
        {data.communities.map((c, i) => (
          <div key={c.community} className="rounded-lg border border-line bg-[#0e141c] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cluster {i + 1}</span>
              <span className="font-mono text-[9px] text-slate-500">{c.services.length} service{c.services.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {c.services.map(s => (
                <button
                  key={s}
                  onClick={() => onSelect(s)}
                  className="rounded border border-line bg-[#18212b] px-1.5 py-1 font-mono text-[9px] text-slate-400 hover:border-lime/40 hover:text-lime"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
// Templates panel
// ============================================================
const TEMPLATES = [
  { id: 'Q01', label: 'Blast radius', params: ['service_id'] },
  { id: 'Q03', label: 'Related incidents', params: ['incident_id'] },
  { id: 'Q04', label: 'Historical fixes', params: ['incident_id'] },
  { id: 'Q06', label: 'Owners + runbooks', params: ['service_id'] },
  { id: 'Q07b', label: 'Generic path (from/to)', params: ['from', 'to'] },
  { id: 'Q13', label: 'Who knows', params: ['service_id'] },
];

function TemplatesPanel() {
  const { notify } = useToast();
  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = TEMPLATES.find(t => t.id === template);
    if (t) {
      const initial: Record<string, string> = {};
      for (const p of t.params) initial[p] = '';
      setParams(initial); setResult(null); setError(null);
    }
  }, [template]);

  const run = async () => {
    const t = TEMPLATES.find(t => t.id === template);
    if (!t) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await graphApi.query(template, params) as TemplateResponse;
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Query failed');
    } finally {
      setLoading(false);
    }
  };

  const currentTemplate = TEMPLATES.find(t => t.id === template);

  return (
    <>
      <p className="mb-3 text-[11px] text-slate-400">Run any allow-listed query directly. No raw Cypher.</p>
      <label className="mb-3 block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Template</span>
        <select className="input !py-2 text-xs" value={template} onChange={e => setTemplate(e.target.value)}>
          {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.id} · {t.label}</option>)}
        </select>
      </label>
      {currentTemplate && currentTemplate.params.map(p => (
        <label key={p} className="mb-3 block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">{p}</span>
          <input
            className="input !py-2 font-mono text-xs"
            value={params[p] || ''}
            onChange={e => setParams({ ...params, [p]: e.target.value })}
            placeholder={
              p === 'service_id' ? 'svc-checkout' :
              p === 'incident_id' ? 'inc-2481' :
              p === 'from' ? 'deploy-42' :
              p === 'to' ? 'inc-2481' : ''
            }
          />
        </label>
      ))}
      <button onClick={run} disabled={loading || !currentTemplate} className="btn-primary w-full !py-2 text-[11px]">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        Run template
      </button>
      {error && (
        <div className="mt-3 rounded-lg border border-rose-900/50 bg-[#28181d] p-2.5 text-[10px] text-rose-200">{error}</div>
      )}
      {result && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>{result.count} row{result.count === 1 ? '' : 's'}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2)); notify('Rows copied'); }}
              className="hover:text-slate-300"
            >
              Copy JSON
            </button>
          </div>
          {result.count === 0 ? (
            <p className="text-[10px] text-slate-500">No rows returned.</p>
          ) : (
            <div className="max-h-[240px] overflow-auto rounded-lg border border-line bg-[#0b1118]">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-[#111821]">
                  <tr className="border-b border-line">
                    {Object.keys(result.rows[0]).slice(0, 3).map(k => (
                      <th key={k} className="px-2 py-1.5 font-bold uppercase tracking-wider text-slate-600">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-[#1c242e] last:border-0 hover:bg-[#141c26]">
                      {Object.keys(result.rows[0]).slice(0, 3).map(k => (
                        <td key={k} className="px-2 py-1.5 font-mono text-slate-400">
                          {typeof row[k] === 'object' ? JSON.stringify(row[k]).slice(0, 40) : String(row[k] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}