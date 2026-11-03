import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityLogItem, type ActivityLog } from '../components/common/ActivityLogList';
import { NO_STATUS_KEY, NEUTRAL_CUSHION_COLOR } from '../lib/catFarmLayout';
import { useBoardStore } from '../store/useBoardStore';
import {
    ArrowUpRight,
    BarChart2,
    BarChart3,
    BatteryMedium,
    CalendarRange,
    Check,
    ChevronDown,
    Clock,
    Filter,
    GripVertical,
    Layers,
    LayoutGrid,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Star,
    Trash2,
    X
} from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../lib/supabase';
import { WorkspaceTimeline } from '../components/dashboard/WorkspaceTimeline';
import { useIsMobile } from '../hooks/useIsMobile';
import { tintLabel } from '../lib/labelTint';

const GRID_GAP = 20;

// Fixed size presets so widgets always align to clean, structured grid dimensions
// instead of arbitrary pixel heights.
const FIXED_HEIGHTS = [280, 380, 480] as const;
const HEIGHT_LABELS: Record<number, string> = {
    280: 'S',
    380: 'M',
    480: 'L'
};

const snapSpan = (raw: number): number => Math.min(3, Math.max(1, Math.round(raw)));
const snapHeight = (raw: number): number => {
    let best: number = FIXED_HEIGHTS[0];
    let minDiff = Math.abs(raw - best);
    for (const h of FIXED_HEIGHTS) {
        const diff = Math.abs(raw - h);
        if (diff < minDiff) {
            best = h;
            minDiff = diff;
        }
    }
    return best;
};

interface WidgetCatalogItem {
    id: string;
    title: string;
    description: string;
    defaultSpan: number;
    defaultHeight: number;
    icon: typeof BarChart2;
}

const WIDGET_CATALOG: WidgetCatalogItem[] = [
    {
        id: 'totalTasks',
        title: 'Total Work Task',
        description: 'Total task count, Done / Active breakdown, and quick board links.',
        defaultSpan: 1,
        defaultHeight: 280,
        icon: BarChart2
    },
    {
        id: 'totalStatus',
        title: 'Total Status',
        description: 'Overall completion percentage battery and status distribution.',
        defaultSpan: 1,
        defaultHeight: 280,
        icon: BatteryMedium
    },
    {
        id: 'boardsOverview',
        title: 'Boards Progress',
        description: 'Completion progress bars and task counts across boards.',
        defaultSpan: 1,
        defaultHeight: 280,
        icon: Layers
    },
    {
        id: 'workStatusChart',
        title: 'Work Status',
        description: 'Stacked workload chart by status and assigned team members.',
        defaultSpan: 2,
        defaultHeight: 380,
        icon: BarChart3
    },
    {
        id: 'boardUpdates',
        title: 'Board Updates',
        description: 'Live activity feed of changes across the workspace or selected board.',
        defaultSpan: 1,
        defaultHeight: 380,
        icon: Clock
    },
    {
        id: 'timeline',
        title: 'Timeline',
        description: 'Cross-board schedule timeline by Day, Month, or Year.',
        defaultSpan: 3,
        defaultHeight: 480,
        icon: CalendarRange
    }
];

const WIDGET_IDS = WIDGET_CATALOG.map(w => w.id);
const DEFAULT_SPAN: Record<string, number> = Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w.defaultSpan]));
const DEFAULT_HEIGHT: Record<string, number> = Object.fromEntries(WIDGET_CATALOG.map(w => [w.id, w.defaultHeight]));

const DraggableDashboardWidget = ({
    id,
    children,
    span,
    height,
    compact = false,
    fixed = false,
    isEditing = false,
    onResize,
    onRemove
}: {
    id: string;
    children: React.ReactNode;
    span: number;
    height: number;
    compact?: boolean;
    fixed?: boolean;
    isEditing?: boolean;
    onResize: (next: { span: number; height: number }) => void;
    onRemove: () => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, disabled: fixed || !isEditing });

    const [previewSize, setPreviewSize] = useState<{ span: number; height: number } | null>(null);

    const style = {
        transform: CSS.Translate.toString(transform),
        transition: transition ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
        willChange: transform ? 'transform' : undefined,
        zIndex: isDragging ? 100 : 1,
        position: 'relative' as const,
        opacity: isDragging ? 0.75 : 1,
        filter: isDragging ? 'drop-shadow(0 12px 24px rgba(15, 23, 42, 0.18))' : undefined,
        gridColumn: `span ${span}`,
        minWidth: 0,
        minHeight: compact ? 0 : `${height}px`,
        height: compact ? 'auto' : `${height}px`,
        touchAction: fixed || !isEditing ? undefined : 'none'
    };

    // Dragging the bottom-right corner snaps strictly to fixed grid columns (1, 2, 3)
    // and fixed height steps (280px S, 380px M, 480px L) so sizing is never loose.
    const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const handle = e.currentTarget;
        const widget = handle.closest('.dashboard-draggable-wrapper') as HTMLElement | null;
        const grid = widget?.parentElement;
        if (!widget || !grid) return;
        handle.setPointerCapture(e.pointerId);

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = widget.offsetWidth;
        const startH = widget.offsetHeight;
        const colW = (grid.clientWidth - 2 * GRID_GAP) / 3;

        let frame = 0;
        let latest = {
            span: snapSpan((startW + GRID_GAP) / (colW + GRID_GAP)),
            height: snapHeight(startH)
        };
        setPreviewSize(latest);

        const move = (ev: PointerEvent) => {
            const rawWidth = startW + ev.clientX - startX;
            const rawHeight = startH + ev.clientY - startY;
            latest = {
                span: snapSpan((rawWidth + GRID_GAP) / (colW + GRID_GAP)),
                height: snapHeight(rawHeight)
            };
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                widget.style.gridColumn = `span ${latest.span}`;
                if (!compact) {
                    widget.style.height = `${latest.height}px`;
                    widget.style.minHeight = `${latest.height}px`;
                }
                setPreviewSize({ ...latest });
            });
        };
        const end = () => {
            cancelAnimationFrame(frame);
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            widget.style.transition = prevTransition;
            document.body.style.userSelect = prevUserSelect;
            setPreviewSize(null);
            onResize(latest);
        };
        const prevTransition = widget.style.transition;
        const prevUserSelect = document.body.style.userSelect;
        widget.style.transition = 'none';
        document.body.style.userSelect = 'none';
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    const cycleWidth = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextSpan = span >= 3 ? 1 : span + 1;
        onResize({ span: nextSpan, height });
    };

    const cycleHeight = (e: React.MouseEvent) => {
        e.stopPropagation();
        const idx = FIXED_HEIGHTS.indexOf(height as typeof FIXED_HEIGHTS[number]);
        const nextHeight = FIXED_HEIGHTS[(idx + 1) % FIXED_HEIGHTS.length];
        onResize({ span, height: nextHeight });
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`dashboard-draggable-wrapper${isEditing && !fixed ? ' is-editing' : ''}`}
        >
            <div className="widget-drag-handle-container" style={{ position: 'relative', height: '100%', width: '100%' }}>
                {/* Drag Handle (shown only in Dashboard Edit mode) */}
                {!fixed && isEditing && (
                    <div
                        {...attributes}
                        {...listeners}
                        style={{
                            position: 'absolute',
                            top: '26px',
                            left: '10px',
                            transform: 'translateY(-50%)',
                            cursor: 'grab',
                            padding: '4px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.18s ease',
                            zIndex: 20,
                            color: 'hsl(var(--color-brand-primary))'
                        }}
                        className="grip-handle"
                        title="Drag to reorder"
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                {/* Edit-Mode Widget Controls: Fixed Width, Fixed Height & Delete Widget */}
                {!fixed && isEditing && (
                    <div
                        className="widget-edit-controls glass-chip"
                        style={{
                            position: 'absolute',
                            top: '12px',
                            right: '14px',
                            height: '28px',
                            padding: '0 4px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            zIndex: 25,
                            backgroundColor: 'hsl(var(--paper, #fff) / 0.96)',
                            boxShadow: '0 2px 8px rgba(21, 42, 0, 0.10)'
                        }}
                    >
                        <button
                            type="button"
                            onClick={cycleWidth}
                            title="Change fixed width (1, 2, or 3 columns)"
                            style={{
                                border: 'none',
                                background: 'transparent',
                                padding: '2px 7px',
                                borderRadius: '999px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: 'hsl(var(--color-text-secondary))',
                                cursor: 'pointer'
                            }}
                        >
                            {span}W
                        </button>
                        <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))' }} />
                        <button
                            type="button"
                            onClick={cycleHeight}
                            title="Change fixed height (S = 280px, M = 380px, L = 480px)"
                            style={{
                                border: 'none',
                                background: 'transparent',
                                padding: '2px 7px',
                                borderRadius: '999px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: 'hsl(var(--color-text-secondary))',
                                cursor: 'pointer'
                            }}
                        >
                            {HEIGHT_LABELS[height] || 'M'}
                        </button>
                        <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))' }} />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                            title="Remove widget from dashboard"
                            style={{
                                border: 'none',
                                background: 'transparent',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'hsl(var(--color-danger, 0 72% 50%))',
                                cursor: 'pointer'
                            }}
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {children}

                {/* Snap indicator badge while dragging corner */}
                {previewSize && (
                    <div
                        className="glass-chip"
                        style={{
                            position: 'absolute',
                            right: '28px',
                            bottom: '12px',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'hsl(var(--color-brand-primary))',
                            zIndex: 30,
                            pointerEvents: 'none'
                        }}
                    >
                        {previewSize.span} {previewSize.span === 1 ? 'col' : 'cols'} · {HEIGHT_LABELS[previewSize.height] || 'M'} ({previewSize.height}px)
                    </div>
                )}

                {!fixed && isEditing && (
                    <div
                        onPointerDown={startResize}
                        className="resize-handle"
                        title="Drag to snap size (Fixed columns & S/M/L height)"
                        style={{
                            position: 'absolute',
                            right: 6,
                            bottom: 6,
                            width: '18px',
                            height: '18px',
                            cursor: 'nwse-resize',
                            zIndex: 20,
                            touchAction: 'none',
                            background: 'linear-gradient(135deg, transparent 0 55%, hsl(var(--color-brand-primary)) 55% 62%, transparent 62% 72%, hsl(var(--color-brand-primary)) 72% 79%, transparent 79%)',
                            borderBottomRightRadius: '6px'
                        }}
                    />
                )}
            </div>

            <style>{`
                .grip-handle:hover {
                    background: hsl(var(--paper-head, #f1f5f9));
                    color: hsl(var(--color-text-primary)) !important;
                    transform: translateY(-50%) scale(1.08);
                }
                .grip-handle:active {
                    cursor: grabbing;
                    transform: translateY(-50%) scale(0.95);
                }
            `}</style>
        </div>
    );
};

interface StatusColumnOption {
    key: string;
    label: string;
    columnIds: Set<string>;
}

const StatusColumnFilter = ({ options, value, onChange, isOpen, onToggle, onClose }: {
    options: StatusColumnOption[];
    value: string | null;
    onChange: (key: string | null) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    if (options.length < 2) return null;

    const active = options.find(o => o.key === value);

    const menuPosition = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return { top: 0, left: 0 };
        const WIDTH = 220;
        const HEIGHT = 260;
        const top = rect.bottom + HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - HEIGHT - 6)
            : rect.bottom + 6;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
        return { top, left };
    };

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                ref={buttonRef}
                onClick={onToggle}
                title={active ? `Status column: ${active.label}` : 'Status column: All status columns'}
                style={{
                    background: value ? 'hsl(var(--color-brand-primary) / 0.1)' : 'hsl(var(--paper, var(--color-bg-surface)))',
                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                    height: '24px',
                    padding: '0 8px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                    transition: 'background-color 0.15s, color 0.15s'
                }}
            >
                <span style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {active ? active.label : 'All Status Cols'}
                </span>
                <ChevronDown size={11} />
            </button>

            {isOpen && createPortal(
                <>
                    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                    <div
                        className="glass-pop"
                        style={{
                            position: 'fixed',
                            ...menuPosition(),
                            minWidth: '220px',
                            borderRadius: '14px',
                            zIndex: 61,
                            overflow: 'hidden',
                            padding: '4px 0'
                        }}
                    >
                        <div style={{
                            padding: '8px 14px 6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: 'hsl(var(--color-text-tertiary))',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                        }}>
                            Status column
                        </div>
                        {[{ key: null as string | null, label: 'All status columns' }, ...options].map(option => (
                            <button
                                key={option.key ?? '__all__'}
                                onClick={() => { onChange(option.key); onClose(); }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 14px',
                                    border: 'none',
                                    background: option.key === value ? 'hsl(var(--color-brand-primary) / 0.08)' : 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '12.5px',
                                    color: option.key === value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))',
                                    fontWeight: option.key === value ? 600 : 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => { if (option.key !== value) e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.04)'; }}
                                onMouseLeave={(e) => { if (option.key !== value) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

type ScopeSelection = Record<string, string[] | null> | null;

interface ScopeGroup {
    id: string;
    title: string;
    color?: string;
}

const itemInScope = (item: { board_id: string; group_id?: string | null }, scope: ScopeSelection) => {
    if (!scope) return true;
    if (!(item.board_id in scope)) return false;
    const groups = scope[item.board_id];
    return groups === null || (!!item.group_id && groups.includes(item.group_id));
};

const parseStoredScope = (raw: string | null): ScopeSelection => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.length > 0 ? Object.fromEntries(parsed.map((id: string) => [id, null])) : null;
        }
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const sanitizeScope = (
    scope: ScopeSelection,
    boardIds: Set<string>,
    groupIdsByBoard: Map<string, Set<string>> | null
): ScopeSelection => {
    if (!scope) return null;
    const out: Record<string, string[] | null> = {};
    for (const [boardId, groups] of Object.entries(scope)) {
        if (!boardIds.has(boardId)) continue;
        if (groups === null || !groupIdsByBoard) {
            out[boardId] = groups;
            continue;
        }
        const known = groupIdsByBoard.get(boardId);
        const live = known ? groups.filter(id => known.has(id)) : groups;
        if (live.length > 0) out[boardId] = live;
    }
    return Object.keys(out).length > 0 ? out : null;
};

/**
 * Per-widget Workspace vs. Selected Board(s) filter.
 * Present on every widget so each widget can independently show the Workspace
 * total (`value === null`) or narrow to a single selected board (or group subset).
 */
const BoardGroupFilter = ({ boards, groupsByBoard, value, onChange, isOpen, onToggle, onClose, variant = 'icon' }: {
    boards: { id: string; title: string }[];
    groupsByBoard: Map<string, ScopeGroup[]>;
    value: ScopeSelection;
    onChange: (next: ScopeSelection) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    variant?: 'icon' | 'toolbar';
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!isOpen || !value) return;
        setExpanded(new Set(Object.entries(value).filter(([, groups]) => groups !== null).map(([boardId]) => boardId)));
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (boards.length === 0) return null;

    const everything = (): Record<string, string[] | null> => Object.fromEntries(boards.map(b => [b.id, null]));
    const boardState = (boardId: string): 'all' | 'some' | 'none' => {
        if (!value) return 'all';
        if (!(boardId in value)) return 'none';
        return value[boardId] === null ? 'all' : 'some';
    };
    const groupChecked = (boardId: string, groupId: string) => {
        if (!value) return true;
        if (!(boardId in value)) return false;
        const groups = value[boardId];
        return groups === null || groups.includes(groupId);
    };

    const commit = (next: Record<string, string[] | null>) => {
        if (Object.keys(next).length === 0) return;
        const allWhole = boards.length > 1 && boards.every(b => b.id in next && next[b.id] === null);
        onChange(allWhole ? null : next);
    };

    const selectSingleBoard = (boardId: string) => {
        onChange({ [boardId]: null });
        onClose();
    };

    const toggleBoard = (boardId: string) => {
        const next = { ...(value ?? everything()) };
        if (boardState(boardId) === 'all') delete next[boardId];
        else next[boardId] = null;
        commit(next);
    };

    const toggleGroup = (boardId: string, groupId: string) => {
        const next = { ...(value ?? everything()) };
        const allGroupIds = (groupsByBoard.get(boardId) || []).map(g => g.id);
        const current = !(boardId in next) ? [] : (next[boardId] ?? allGroupIds);
        const updated = current.includes(groupId) ? current.filter(id => id !== groupId) : [...current, groupId];

        if (updated.length === 0) delete next[boardId];
        else if (allGroupIds.length > 0 && allGroupIds.every(id => updated.includes(id))) next[boardId] = null;
        else next[boardId] = updated;
        commit(next);
    };

    const toggleExpanded = (boardId: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(boardId)) next.delete(boardId); else next.add(boardId);
            return next;
        });
    };

    const summary = (() => {
        if (!value) return null;
        const entries = Object.entries(value);
        if (entries.length > 1) return `${entries.length} boards`;
        const [boardId, groups] = entries[0];
        const boardTitle = boards.find(b => b.id === boardId)?.title ?? '1 board';
        if (groups === null) return boardTitle;
        if (groups.length === 1) return groupsByBoard.get(boardId)?.find(g => g.id === groups[0])?.title ?? `${boardTitle} · 1 group`;
        return `${boardTitle} · ${groups.length} groups`;
    })();

    const menuPosition = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return { top: 0, left: 0 };
        const WIDTH = 270;
        const HEIGHT = 420;
        const top = rect.bottom + HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - HEIGHT - 6)
            : rect.bottom + 6;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
        return { top, left };
    };

    const checkbox = (state: 'all' | 'some' | 'none') => (
        <span style={{
            width: '15px',
            height: '15px',
            flexShrink: 0,
            borderRadius: '4px',
            border: state === 'none' ? '1.5px solid var(--paper-edge, hsl(var(--color-border)))' : 'none',
            backgroundColor: state === 'all' ? 'hsl(var(--color-brand-primary))'
                : state === 'some' ? 'hsl(var(--color-brand-primary) / 0.65)'
                    : 'hsl(var(--paper, #fff))',
            color: '#FFEFD2',
            fontSize: '10px',
            lineHeight: '15px',
            textAlign: 'center',
            fontWeight: 700
        }}>
            {state === 'all' ? '✓' : state === 'some' ? '–' : ''}
        </span>
    );

    const rowStyle = (indent: number, active = false): React.CSSProperties => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        textAlign: 'left',
        padding: `7px 12px 7px ${indent}px`,
        border: 'none',
        background: active ? 'hsl(var(--color-brand-primary) / 0.08)' : 'transparent',
        cursor: 'pointer',
        fontSize: '12.5px',
        color: active ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))',
        fontWeight: active ? 600 : 500
    });
    const hover = {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.05)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'transparent'; }
    };
    const truncate: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                ref={buttonRef}
                onClick={onToggle}
                className={variant === 'toolbar' ? 'glass-chip' : undefined}
                title={value ? `Scope: ${summary} (Click to change)` : 'Scope: All Workspace (Click to filter by board)'}
                style={variant === 'toolbar' ? {
                    height: '30px',
                    padding: '0 12px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary))'
                } : {
                    background: value ? 'hsl(var(--color-brand-primary) / 0.1)' : 'hsl(var(--paper, var(--color-bg-surface)))',
                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                    height: '24px',
                    padding: '0 8px',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))'
                }}
            >
                <Filter size={12} />
                <span style={{ maxWidth: variant === 'toolbar' ? '150px' : '115px', ...truncate }}>
                    {summary ?? 'All Workspace'}
                </span>
                <ChevronDown size={11} />
            </button>

            {isOpen && createPortal(
                <>
                    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                    <div
                        className="glass-pop"
                        style={{
                            position: 'fixed',
                            ...menuPosition(),
                            width: '270px',
                            borderRadius: '14px',
                            zIndex: 61,
                            overflow: 'hidden',
                            padding: '4px 0'
                        }}
                    >
                        <div style={{
                            padding: '8px 14px 6px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: 'hsl(var(--color-text-tertiary))',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                        }}>
                            Scope: Workspace or Board
                        </div>
                        <button
                            onClick={() => { onChange(null); onClose(); }}
                            style={{ ...rowStyle(14, !value), borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))' }}
                            {...hover}
                        >
                            {checkbox(!value ? 'all' : 'none')}
                            <span style={{ flex: 1 }}>All Workspace (Total)</span>
                        </button>

                        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                            {boards.map(board => {
                                const groups = groupsByBoard.get(board.id) || [];
                                const isExpanded = expanded.has(board.id);
                                const isOnlyThisBoard = !!value && Object.keys(value).length === 1 && value[board.id] === null;
                                return (
                                    <div key={board.id}>
                                        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px' }}>
                                            <button
                                                onClick={() => toggleExpanded(board.id)}
                                                disabled={groups.length === 0}
                                                title={groups.length === 0 ? 'No groups' : isExpanded ? 'Hide groups' : 'Show groups'}
                                                style={{
                                                    width: '24px',
                                                    alignSelf: 'stretch',
                                                    flexShrink: 0,
                                                    border: 'none',
                                                    background: 'transparent',
                                                    cursor: groups.length === 0 ? 'default' : 'pointer',
                                                    color: groups.length === 0 ? 'transparent' : 'hsl(var(--color-text-tertiary))',
                                                    fontSize: '10px',
                                                    padding: '0 0 0 6px'
                                                }}
                                            >
                                                {isExpanded ? '▼' : '▶'}
                                            </button>
                                            <button
                                                onClick={() => boards.length === 1 ? selectSingleBoard(board.id) : toggleBoard(board.id)}
                                                style={{ ...rowStyle(4, isOnlyThisBoard), flex: 1, minWidth: 0 }}
                                                {...hover}
                                            >
                                                {checkbox(boardState(board.id))}
                                                <span style={truncate}>{board.title}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => selectSingleBoard(board.id)}
                                                title={`Show only "${board.title}"`}
                                                style={{
                                                    flexShrink: 0,
                                                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                    background: isOnlyThisBoard ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--paper-head, #f5f0e6))',
                                                    color: isOnlyThisBoard ? '#FFEFD2' : 'hsl(var(--color-text-secondary))',
                                                    borderRadius: '999px',
                                                    padding: '2px 7px',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Only
                                            </button>
                                        </div>

                                        {isExpanded && groups.map(group => (
                                            <button key={group.id} onClick={() => toggleGroup(board.id, group.id)} style={rowStyle(38)} {...hover}>
                                                {checkbox(groupChecked(board.id, group.id) ? 'all' : 'none')}
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: group.color || '#cbd5e1' }} />
                                                <span style={truncate}>{group.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

interface DashboardLayout {
    version?: number;
    order: string[];
    sizes: Record<string, { span: number; height: number }>;
}
const DEFAULT_LAYOUT: DashboardLayout = { version: 2, order: WIDGET_IDS, sizes: {} };

// Preserves user-deleted widgets when version === 2, migrates legacy catFarm
// to boardsOverview, and snaps any stored height to the fixed height presets.
const parseStoredLayout = (raw: string | null): DashboardLayout => {
    if (!raw) return DEFAULT_LAYOUT;
    try {
        const parsed = JSON.parse(raw);
        const isV2 = parsed?.version === 2;
        const rawOrder: unknown[] = Array.isArray(parsed?.order) ? parsed.order : WIDGET_IDS;
        const mappedOrder = rawOrder
            .map(id => (id === 'catFarm' ? 'boardsOverview' : id))
            .filter((id): id is string => typeof id === 'string' && WIDGET_IDS.includes(id));

        const uniqueOrder = [...new Set(mappedOrder)];
        const order = isV2 ? uniqueOrder : [...new Set([...uniqueOrder, ...WIDGET_IDS])];

        const sizes: DashboardLayout['sizes'] = {};
        if (parsed?.sizes && typeof parsed.sizes === 'object') {
            for (const id of WIDGET_IDS) {
                const size = parsed.sizes[id];
                if (size && Number.isFinite(size.span) && Number.isFinite(size.height)) {
                    sizes[id] = {
                        span: snapSpan(size.span),
                        height: snapHeight(size.height)
                    };
                }
            }
        }
        return { version: 2, order, sizes };
    } catch {
        return DEFAULT_LAYOUT;
    }
};

export const WorkspaceDashboardPage = () => {
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    const allBoards = useBoardStore(state => state.boards);

    const layoutKey = `dashboardLayout:${activeWorkspaceId || 'none'}`;
    const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
    const [remoteReady, setRemoteReady] = useState(false);
    const remoteLayouts = useRef<Record<string, unknown> | null>(null);
    const userIdRef = useRef<string | null>(null);
    const touchedLayout = useRef(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user || cancelled) return;
            userIdRef.current = auth.user.id;
            const { data } = await supabase.from('profiles').select('dashboard_layouts').eq('id', auth.user.id).single();
            if (cancelled || !data) return;
            remoteLayouts.current = (data.dashboard_layouts && typeof data.dashboard_layouts === 'object') ? data.dashboard_layouts : {};
            setRemoteReady(true);
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const remote = remoteLayouts.current?.[activeWorkspaceId || 'none'];
        if (remote && !touchedLayout.current) {
            setLayout(parseStoredLayout(JSON.stringify(remote)));
            return;
        }
        try {
            setLayout(parseStoredLayout(localStorage.getItem(layoutKey)));
        } catch {
            setLayout(DEFAULT_LAYOUT);
        }
        touchedLayout.current = false;
    }, [layoutKey, remoteReady]); // eslint-disable-line react-hooks/exhaustive-deps

    const updateLayout = (change: (current: DashboardLayout) => DashboardLayout) => {
        const next = { ...change(layout), version: 2 };
        setLayout(next);
        touchedLayout.current = true;
        try { localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* private mode */ }

        const workspaceKey = activeWorkspaceId || 'none';
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            const all = remoteLayouts.current;
            const userId = userIdRef.current;
            if (!all || !userId) return;
            all[workspaceKey] = next;
            supabase.from('profiles').update({ dashboard_layouts: all }).eq('id', userId).then(({ error }) => {
                if (error) console.error('Failed to save dashboard layout:', error);
            });
        }, 600);
    };
    const widgetOrder = layout.order;

    const addWidget = (widgetId: string) => {
        updateLayout(current => {
            if (current.order.includes(widgetId)) return current;
            return {
                ...current,
                order: [...current.order, widgetId]
            };
        });
    };

    const removeWidget = (widgetId: string) => {
        updateLayout(current => ({
            ...current,
            order: current.order.filter(id => id !== widgetId)
        }));
    };

    const isMobile = useIsMobile();
    const noSensors = useSensors();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5
            }
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            updateLayout(current => ({
                ...current,
                order: arrayMove(current.order, current.order.indexOf(active.id as string), current.order.indexOf(over.id as string))
            }));
        }
    };

    const workspace = workspaces.find(w => w.id === activeWorkspaceId);
    const workspaceBoards = useMemo(() =>
        allBoards.filter(b => b.workspaceId === activeWorkspaceId && !b.is_archived),
    [allBoards, activeWorkspaceId]);

    const workspaceBoardIdsKey = useMemo(
        () => workspaceBoards.map(b => b.id).sort().join(','),
        [workspaceBoards]
    );

    const boardTitleById = useMemo(
        () => new Map(workspaceBoards.map(b => [b.id, b.title])),
        [workspaceBoards]
    );

    const [workspaceData, setWorkspaceData] = useState<{ items: any[]; columns: any[]; groups: any[] | null }>({ items: [], columns: [], groups: null });

    const groupsByBoard = useMemo(() => {
        const map = new Map<string, ScopeGroup[]>();
        (workspaceData.groups || []).forEach((g: any) => {
            const list = map.get(g.board_id) || [];
            list.push({ id: g.id, title: g.title, color: g.color });
            map.set(g.board_id, list);
        });
        return map;
    }, [workspaceData.groups]);

    const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const logsWorkspaceRef = useRef<string | null>(null);
    const [workspaceMemberProfiles, setWorkspaceMemberProfiles] = useState<Record<string, string>>({});

    const STATUS_FILTER_WIDGETS = ['totalStatus', 'workStatusChart'];
    const statusFilterKey = (widgetId: string) =>
        `dashboardStatusColumn:${activeWorkspaceId || 'none'}:${widgetId}`;

    const [statusColFilters, setStatusColFilters] = useState<Record<string, string | null>>({});
    const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);

    // Every widget has its own Workspace vs. Selected Board(s) scope filter
    const SCOPE_FILTER_WIDGETS = WIDGET_IDS;
    const scopeFilterKey = (widgetId: string) =>
        `dashboardBoardFilter:${activeWorkspaceId || 'none'}:${widgetId}`;
    const [scopeFilters, setScopeFilters] = useState<Record<string, ScopeSelection>>({});

    const scopeFor = (widgetId: string): ScopeSelection => {
        const groupIds = workspaceData.groups
            ? new Map(Array.from(groupsByBoard, ([boardId, groups]) => [boardId, new Set(groups.map(g => g.id))]))
            : null;
        return sanitizeScope(scopeFilters[widgetId] ?? null, new Set(boardTitleById.keys()), groupIds);
    };

    useEffect(() => {
        try {
            const stored: Record<string, string | null> = {};
            STATUS_FILTER_WIDGETS.forEach(id => {
                stored[id] = localStorage.getItem(statusFilterKey(id));
            });
            setStatusColFilters(stored);

            const storedScopes: Record<string, ScopeSelection> = {};
            SCOPE_FILTER_WIDGETS.forEach(id => {
                storedScopes[id] = parseStoredScope(localStorage.getItem(scopeFilterKey(id)));
            });
            setScopeFilters(storedScopes);
        } catch {
            setStatusColFilters({});
            setScopeFilters({});
        }
    }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyScopeFilter = (widgetId: string, scope: ScopeSelection) => {
        setScopeFilters(prev => ({ ...prev, [widgetId]: scope }));
        try {
            if (scope) localStorage.setItem(scopeFilterKey(widgetId), JSON.stringify(scope));
            else localStorage.removeItem(scopeFilterKey(widgetId));
        } catch { /* private mode */ }
    };

    const applyStatusColFilter = (widgetId: string, key: string | null) => {
        setStatusColFilters(prev => ({ ...prev, [widgetId]: key }));
        try {
            if (key) localStorage.setItem(statusFilterKey(widgetId), key);
            else localStorage.removeItem(statusFilterKey(widgetId));
        } catch { /* private mode */ }
    };

    const statusColumnOptions = useMemo<StatusColumnOption[]>(() => {
        const byBoard = new Map<string, any[]>();
        workspaceData.columns
            .filter(c => c?.type === 'status')
            .forEach(c => {
                const list = byBoard.get(c.board_id) || [];
                list.push(c);
                byBoard.set(c.board_id, list);
            });

        const identities = new Map<string, StatusColumnOption>();
        byBoard.forEach(cols => {
            const seen = new Map<string, number>();
            cols.forEach(col => {
                const title = (col.title || 'Status').trim();
                const normalized = title.toLowerCase();
                const occurrence = (seen.get(normalized) || 0) + 1;
                seen.set(normalized, occurrence);

                const key = `${normalized}#${occurrence}`;
                const existing = identities.get(key);
                if (existing) {
                    existing.columnIds.add(col.id);
                } else {
                    identities.set(key, {
                        key,
                        label: occurrence === 1 ? title : `${title} (${occurrence})`,
                        columnIds: new Set([col.id])
                    });
                }
            });
        });

        return Array.from(identities.values());
    }, [workspaceData.columns]);

    const [refreshTick, setRefreshTick] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [drillDown, setDrillDown] = useState<{
        title: string;
        statusFilter?: string | null;
        personFilter?: string | null;
        boardFilter?: string | null;
        searchQuery?: string;
    } | null>(null);
    const [isCreatingBoard, setIsCreatingBoard] = useState(false);
    const [newBoardTitle, setNewBoardTitle] = useState('');
    const [isEditingDashboard, setIsEditingDashboard] = useState(false);
    const [addWidgetMenuOpen, setAddWidgetMenuOpen] = useState(false);
    const addWidgetBtnRef = useRef<HTMLButtonElement>(null);

    const handleRefreshDashboard = () => {
        setIsRefreshing(true);
        setRefreshTick(t => t + 1);
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const isLayoutCustomized = useMemo(() => {
        if (Object.keys(layout.sizes).length > 0) return true;
        if (layout.order.length !== WIDGET_IDS.length) return true;
        return layout.order.some((id, idx) => id !== WIDGET_IDS[idx]);
    }, [layout]);

    const handleResetLayout = () => {
        updateLayout(() => DEFAULT_LAYOUT);
    };

    const handleCreateBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newBoardTitle.trim();
        if (!trimmed) return;
        setIsCreatingBoard(false);
        setNewBoardTitle('');
        await useBoardStore.getState().addBoard(trimmed);
    };

    useEffect(() => {
        if (!activeWorkspaceId || workspaceBoards.length === 0) return;

        async function fetchWorkspaceData() {
            const boardIds = workspaceBoards.map(b => b.id);

            try {
                const [colsRes, itemsRes, groupsRes] = await Promise.all([
                    supabase.from('columns').select('*').in('board_id', boardIds).order('order'),
                    supabase.from('items').select('id, title, board_id, group_id, values, is_hidden, parent_id, order').in('board_id', boardIds).eq('is_archived', false),
                    supabase.from('groups').select('id, title, color, board_id, order').in('board_id', boardIds).eq('is_archived', false).order('order')
                ]);

                const columns = (colsRes.data || []).filter((c: any) => c.scope !== 'subitem');
                const items = itemsRes.data || [];

                setWorkspaceData({ items, columns, groups: groupsRes.data || [] });

                const userIds = new Set<string>();
                const peopleCols = columns.filter(c => c.type === 'people');

                items.forEach(item => {
                    peopleCols.forEach(pCol => {
                        const pVal = item.values?.[pCol.id];
                        const assignedPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                        assignedPeople.forEach(p => {
                            if (typeof p === 'string') userIds.add(p);
                            else if (p && typeof p === 'object') {
                                const pId = p.id || p.user_id;
                                if (pId) userIds.add(pId);
                            }
                        });
                    });
                });

                if (userIds.size > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, email')
                        .in('id', Array.from(userIds));

                    if (profiles) {
                        const map: Record<string, string> = {};
                        profiles.forEach((p: any) => {
                            map[p.id] = p.full_name || p.email?.split('@')[0] || 'Member';
                        });
                        setWorkspaceMemberProfiles(map);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch workspace summary data:', err);
            }
        }

        fetchWorkspaceData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the board ids on purpose, see workspaceBoardIdsKey
    }, [activeWorkspaceId, workspaceBoardIdsKey, refreshTick]);

    useEffect(() => {
        if (!activeWorkspaceId) return;
        if (workspaceBoards.length === 0) {
            setRecentLogs([]);
            setLogsLoading(false);
            return;
        }

        let cancelled = false;
        async function fetchLogs() {
            if (logsWorkspaceRef.current !== activeWorkspaceId) {
                setRecentLogs([]);
                setLogsLoading(true);
            }

            const { data, error } = await supabase.rpc('get_workspace_activity', {
                p_workspace_id: activeWorkspaceId,
                p_limit: 40
            });

            if (cancelled) return;
            if (error) {
                console.error('Dashboard: failed to load workspace activity', error);
            } else {
                setRecentLogs((data || []).map((row: any) => ({
                    ...row,
                    actor_name: row.actor_name || row.actor_email?.split('@')[0] || 'System'
                })));
                logsWorkspaceRef.current = activeWorkspaceId;
            }
            setLogsLoading(false);
        }

        fetchLogs();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the board ids on purpose, see workspaceBoardIdsKey
    }, [activeWorkspaceId, workspaceBoardIdsKey, refreshTick]);

    const openBoardFromDashboard = useCallback((boardId: string) => {
        if (!boardId) return;
        const store = useBoardStore.getState();
        void store.setActiveBoard(boardId);
    }, []);

    const openTaskFromActivity = useCallback((itemId: string, fallbackBoardId?: string) => {
        const matchedItem = workspaceData.items.find(i => i.id === itemId);
        const boardId = matchedItem?.board_id || fallbackBoardId;
        if (!boardId) return;
        const store = useBoardStore.getState();
        void store.setActiveBoard(boardId);
        if (itemId) {
            store.setActiveItem(itemId);
            store.setHighlightedItem(itemId);
            const targetGroupId = matchedItem?.group_id;
            const board = store.boards.find(b => b.id === boardId);
            if (targetGroupId && board?.collapsedGroups?.includes(targetGroupId)) {
                store.toggleGroup(boardId, targetGroupId);
            }
        }
    }, [workspaceData.items]);

    // Computes stats for a given status column filter AND board/group scope filter
    const computeStats = useCallback((statusColFilter: string | null, scope: ScopeSelection) => {
        if (!workspaceData?.items || !workspaceData?.columns || workspaceData.columns.length === 0) {
            return {
                totalTasks: 0,
                statusCounts: {} as Record<string, { label: string; color: string; count: number; workloadCount: number; people: Record<string, { count: number; name: string }> }>,
                totalStatusValues: 0,
                completionPercent: '0',
                peopleMap: {} as Record<string, { name: string; color: string; totalTasks: number }>,
                itemStatusMap: new Map<string, { label: string; color: string }>(),
                itemPeopleMap: new Map<string, string[]>()
            };
        }

        const statusCounts: Record<string, { label: string; color: string; count: number; workloadCount: number; people: Record<string, { count: number; name: string }> }> = {};
        const peopleMap: Record<string, { name: string; color: string; totalTasks: number }> = {};
        const NARAI_PEOPLE_PALETTE = [
            '#152A00',
            '#A76400',
            '#2E6F40',
            '#2E7D8C',
            '#8C3B2B',
            '#6B3B52',
            '#8A6D3B',
            '#4A6B5D'
        ];

        const stringToColor = (str: string) => {
            let hash = 0;
            for (let i = 0; i < (str || '').length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            return NARAI_PEOPLE_PALETTE[Math.abs(hash) % NARAI_PEOPLE_PALETTE.length];
        };

        const selectedStatusIdentity = statusColFilter
            ? statusColumnOptions.find(o => o.key === statusColFilter)
            : null;
        const statusCols = workspaceData.columns.filter(c =>
            c?.type === 'status' && (!selectedStatusIdentity || selectedStatusIdentity.columnIds.has(c.id)) && (!scope || c.board_id in scope)
        );
        const peopleCols = workspaceData.columns.filter(c => c?.type === 'people');

        statusCols.forEach(col => {
            if (!col) return;
            try {
                const labels = col.options || col.settings ? (typeof col.settings === 'string' ? JSON.parse(col.settings) : (col.settings || col.options)) : {};
                const entries = Array.isArray(labels) ? labels.map((l, idx) => [l.id || idx.toString(), l]) : Object.entries(labels);

                (entries as any[]).forEach(([key, label]: [string, any]) => {
                    if (!key || !label) return;
                    const parsedLabel = typeof label === 'string' ? label : (label.text || label.label || label.title || 'Unknown');
                    if (parsedLabel.toLowerCase() === 'unknown') return;

                    if (!statusCounts[key]) {
                        statusCounts[key] = {
                            label: parsedLabel,
                            color: tintLabel(label.color || '#cbd5e1'),
                            count: 0,
                            workloadCount: 0,
                            people: {}
                        };
                    }
                });
            } catch (e) {
                console.error('Dashboard: Error parsing status settings', e);
            }
        });

        const mainItems = workspaceData.items.filter(item => !item.parent_id && itemInScope(item, scope));
        const totalTasks = mainItems.length;
        let doneCount = 0;
        let totalStatusValues = 0;

        const firstStatusKeyByItem = new Map<string, string>();
        const itemStatusMap = new Map<string, { label: string; color: string }>();
        const itemPeopleMap = new Map<string, string[]>();

        mainItems.forEach(item => {
            if (!item || !item.values) return;

            const itemPeopleNames: string[] = [];
            peopleCols.forEach(pCol => {
                const pVal = item.values[pCol.id];
                const rawPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                rawPeople.forEach((p: any) => {
                    const pId = typeof p === 'string' ? p : (p?.id || p?.user_id);
                    if (pId) {
                        const pName = workspaceMemberProfiles[pId] || 'Member';
                        if (!itemPeopleNames.includes(pName)) itemPeopleNames.push(pName);
                    }
                });
            });
            itemPeopleMap.set(item.id, itemPeopleNames);

            statusCols.forEach(sCol => {
                const val = item.values[sCol.id];
                if (!val) return;

                let matchedKey: string | null | undefined = null;
                if (typeof val === 'string' && statusCounts[val]) {
                    matchedKey = val;
                } else {
                    const labelText = typeof val === 'string' ? val : (val.label || val.text || '');
                    if (labelText) {
                        matchedKey = Object.keys(statusCounts).find(k => statusCounts[k].label === labelText);
                    }
                }

                if (matchedKey) {
                    if (item.id && !firstStatusKeyByItem.has(item.id)) {
                        firstStatusKeyByItem.set(item.id, matchedKey);
                        const st = statusCounts[matchedKey];
                        if (st) itemStatusMap.set(item.id, { label: st.label, color: st.color });
                    }
                    const status = statusCounts[matchedKey];
                    status.count++;
                    status.workloadCount++;
                    totalStatusValues++;

                    const labelLower = (status.label || '').toLowerCase();
                    if (labelLower === 'done' || labelLower === 'completed') {
                        doneCount++;
                    }

                    peopleCols.forEach(pCol => {
                        const pVal = item.values[pCol.id];
                        const rawPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);

                        const assignedPeopleIds = rawPeople.map((p: any) => {
                            if (!p) return null;
                            if (typeof p === 'string') return p;
                            return p.id || p.user_id;
                        }).filter(Boolean) as string[];

                        assignedPeopleIds.forEach((pId: string) => {
                            const pName = workspaceMemberProfiles[pId] || 'Member';
                            if (!status.people[pId]) {
                                status.people[pId] = { count: 0, name: pName };
                            }
                            status.people[pId].count++;

                            if (!peopleMap[pId]) {
                                peopleMap[pId] = { name: pName, color: stringToColor(pName), totalTasks: 0 };
                            }
                            peopleMap[pId].totalTasks++;
                        });
                    });
                }
            });

            if (item.id && !firstStatusKeyByItem.has(item.id)) {
                itemStatusMap.set(item.id, { label: 'No status', color: NEUTRAL_CUSHION_COLOR });
            }
        });

        Object.keys(statusCounts).forEach(key => {
            if (statusCounts[key].workloadCount === 0) {
                delete statusCounts[key];
            }
        });

        const completionPercent = totalStatusValues > 0 ? ((doneCount / totalStatusValues) * 100).toFixed(1) : '0';

        return { totalTasks, statusCounts, totalStatusValues, completionPercent, peopleMap, itemStatusMap, itemPeopleMap };
    }, [workspaceData, workspaceMemberProfiles, statusColumnOptions]);

    const statsFor = useMemo(() => {
        const cache = new Map<string, ReturnType<typeof computeStats>>();
        return (filterKey: string | null, scope: ScopeSelection) => {
            const k = `${filterKey ?? ''}::${scope ? JSON.stringify(scope) : 'all'}`;
            let hit = cache.get(k);
            if (!hit) {
                hit = computeStats(filterKey, scope);
                cache.set(k, hit);
            }
            return hit;
        };
    }, [computeStats]);

    const overallStats = statsFor(null, null);

    // Per-board summary counts for the Hero Quick-Jump Bar & Boards Progress widget
    const boardSummaries = useMemo(() => {
        const mainItems = workspaceData.items.filter(item => !item.parent_id);
        return workspaceBoards.map(board => {
            const bItems = mainItems.filter(i => i.board_id === board.id);
            let done = 0;
            let inProgress = 0;
            bItems.forEach(item => {
                const st = overallStats.itemStatusMap.get(item.id);
                const lbl = st?.label?.toLowerCase() || '';
                if (lbl === 'done' || lbl === 'completed') done++;
                else if (lbl && lbl !== 'no status' && lbl !== NO_STATUS_KEY) inProgress++;
            });
            const pct = bItems.length > 0 ? Math.round((done / bItems.length) * 100) : 0;
            return {
                board,
                total: bItems.length,
                done,
                inProgress,
                pct
            };
        });
    }, [workspaceBoards, workspaceData.items, overallStats.itemStatusMap]);

    const timelineScope = scopeFor('timeline');
    const timelineItems = useMemo(
        () => timelineScope ? workspaceData.items.filter(item => itemInScope(item, timelineScope)) : workspaceData.items,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- timelineScope is rebuilt each render; its content is what matters
        [workspaceData.items, JSON.stringify(timelineScope)]
    );

    if (!workspace) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                <h2 className="narai-heading" style={{ fontSize: '24px', marginBottom: '8px', color: 'hsl(var(--color-text-primary))' }}>Workspace Not Found</h2>
                <button
                    onClick={() => useBoardStore.getState().navigateTo('home')}
                    className="btn-solid"
                    style={{ marginTop: '24px', padding: '8px 18px', borderRadius: '999px' }}
                >
                    Return to Home
                </button>
            </div>
        );
    }

    const renderScopeFilter = (widgetId: string, variant: 'icon' | 'toolbar' = 'icon') => {
        const scope = scopeFor(widgetId);
        const menuId = `${widgetId}:boards`;
        return (
            <BoardGroupFilter
                variant={variant}
                boards={workspaceBoards}
                groupsByBoard={groupsByBoard}
                value={scope}
                onChange={(next) => applyScopeFilter(widgetId, next)}
                isOpen={statusMenuFor === menuId}
                onToggle={() => setStatusMenuFor(prev => (prev === menuId ? null : menuId))}
                onClose={() => setStatusMenuFor(null)}
            />
        );
    };

    const singleBoardIdFromScope = (scope: ScopeSelection): string | null => {
        if (!scope) return null;
        const keys = Object.keys(scope);
        return keys.length === 1 ? keys[0] : null;
    };

    const renderWidget = (id: string) => {
        const scope = scopeFor(id);
        const stats = statsFor(statusColFilters[id] ?? null, scope);
        const scopedBoardId = singleBoardIdFromScope(scope);

        switch (id) {
            case 'totalTasks': {
                const scopedMainItems = workspaceData.items
                    .filter(item => !item.parent_id && itemInScope(item, scope));
                const taskCount = scopedMainItems.length;

                let doneCount = 0;
                let activeCount = 0;
                scopedMainItems.forEach(item => {
                    const st = stats.itemStatusMap.get(item.id);
                    const lbl = st?.label?.toLowerCase() || '';
                    if (lbl === 'done' || lbl === 'completed') doneCount++;
                    else if (lbl && lbl !== 'no status') activeCount++;
                });

                const scopedBoardRows = boardSummaries.filter(bs => !scope || bs.board.id in scope);

                return (
                    <div className="card-surface dash-widget" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="dash-widget__head widget-header-with-space">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                                <h3 className="dash-widget__title">Total Work Task</h3>
                                {renderScopeFilter('totalTasks')}
                            </div>
                            <span className="dash-widget__icon" aria-hidden="true"><BarChart2 size={15} /></span>
                        </div>

                        <div style={{ padding: '14px 18px 14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                                <div
                                    onClick={() => setDrillDown({ title: 'Tasks in Scope', boardFilter: scopedBoardId })}
                                    title="Click to inspect tasks"
                                    style={{
                                        fontFamily: 'var(--font-family-display)',
                                        fontSize: '44px',
                                        fontWeight: 600,
                                        lineHeight: 1,
                                        letterSpacing: '-0.025em',
                                        color: 'hsl(var(--color-text-primary))',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {taskCount}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => setDrillDown({ title: 'Completed Tasks', statusFilter: 'Done', boardFilter: scopedBoardId })}
                                        style={{
                                            padding: '3px 9px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(46, 111, 64, 0.25)',
                                            backgroundColor: 'rgba(46, 111, 64, 0.1)',
                                            color: '#2E6F40',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {doneCount} Done
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDrillDown({ title: 'Active Tasks', boardFilter: scopedBoardId })}
                                        style={{
                                            padding: '3px 9px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(167, 100, 0, 0.25)',
                                            backgroundColor: 'rgba(167, 100, 0, 0.1)',
                                            color: '#A76400',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {activeCount} Active
                                    </button>
                                </div>
                            </div>

                            {/* Per-board clickable links */}
                            <div className="interesting-scroll" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                                paddingTop: '10px',
                                flex: 1,
                                minHeight: 0,
                                overflowY: 'auto'
                            }}>
                                {scopedBoardRows.map(({ board, total, pct }) => (
                                    <button
                                        key={board.id}
                                        type="button"
                                        onClick={() => openBoardFromDashboard(board.id)}
                                        title={`Open board "${board.title}"`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            width: '100%',
                                            padding: '6px 8px',
                                            borderRadius: '8px',
                                            border: '1px solid transparent',
                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.55)',
                                            color: 'hsl(var(--color-text-primary))',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'background-color 0.15s, border-color 0.15s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.07)';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary) / 0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.55)';
                                            e.currentTarget.style.borderColor = 'transparent';
                                        }}
                                    >
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, flex: 1 }}>
                                            {board.title}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                            <div style={{ width: '44px', height: '5px', borderRadius: '999px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2E6F40', borderRadius: '999px' }} />
                                            </div>
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-secondary))', minWidth: '22px', textAlign: 'right' }}>
                                                {total}
                                            </span>
                                            <ArrowUpRight size={13} style={{ color: 'hsl(var(--color-brand-primary))', opacity: 0.75 }} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            }
            case 'totalStatus':
                return (
                    <div className="card-surface dash-widget" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="dash-widget__head widget-header-with-space">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                                <h3 className="dash-widget__title">Total Status</h3>
                                {renderScopeFilter('totalStatus')}
                                <StatusColumnFilter
                                    options={statusColumnOptions}
                                    value={statusColFilters['totalStatus'] ?? null}
                                    onChange={(key) => applyStatusColFilter('totalStatus', key)}
                                    isOpen={statusMenuFor === 'totalStatus'}
                                    onToggle={() => setStatusMenuFor(prev => (prev === 'totalStatus' ? null : 'totalStatus'))}
                                    onClose={() => setStatusMenuFor(null)}
                                />
                            </div>
                            <span className="dash-widget__icon" aria-hidden="true"><BatteryMedium size={15} /></span>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 18px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
                                <div style={{ position: 'relative', width: '100%', maxWidth: '250px', height: '58px', display: 'flex', alignItems: 'center' }}>
                                    <div style={{
                                        flex: 1,
                                        height: '58px',
                                        border: '2.5px solid var(--paper-edge, hsl(var(--color-border)))',
                                        borderRadius: '12px',
                                        padding: '4px',
                                        display: 'flex',
                                        gap: '2px',
                                        overflow: 'hidden',
                                        backgroundColor: 'hsl(var(--paper-head, var(--card-solid)))',
                                        boxShadow: 'inset 0 1px 2px rgba(21, 42, 0, 0.06)'
                                    }}>
                                        {Object.values(stats.statusCounts).map((status, i) => (
                                            <div
                                                key={i}
                                                onClick={() => setDrillDown({ title: `Status: ${status.label}`, statusFilter: status.label, boardFilter: scopedBoardId })}
                                                title={`${status.label}: ${status.count} tasks (Click to view tasks)`}
                                                style={{
                                                    width: `${(status.count / Math.max(1, stats.totalStatusValues)) * 100}%`,
                                                    backgroundColor: status.color,
                                                    cursor: 'pointer',
                                                    transition: 'filter 0.18s ease',
                                                    borderRadius: '6px'
                                                }}
                                            />
                                        ))}
                                        {stats.totalStatusValues === 0 && <div style={{ width: '100%', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))', borderRadius: '6px' }} />}
                                    </div>
                                    <div style={{ width: '8px', height: '28px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))', borderRadius: '0 5px 5px 0', marginLeft: '1px' }} />
                                </div>
                                <div style={{
                                    marginTop: '10px',
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: '20px',
                                    color: 'hsl(var(--color-text-primary))',
                                    fontWeight: 600,
                                    letterSpacing: '-0.015em'
                                }}>
                                    {stats.completionPercent}% Done
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap', overflowY: 'auto', maxHeight: '64px' }}>
                                {Object.values(stats.statusCounts).map((status, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setDrillDown({ title: `Status: ${status.label}`, statusFilter: status.label, boardFilter: scopedBoardId })}
                                        title={`Click to view ${status.count} tasks in "${status.label}"`}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '3px 8px',
                                            borderRadius: '999px',
                                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            color: 'hsl(var(--color-text-primary))',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: status.color, flexShrink: 0 }} />
                                        <span>{status.label}</span>
                                        <span style={{ color: 'hsl(var(--color-text-tertiary))' }}>{status.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'boardsOverview': {
                const scopedRows = boardSummaries.filter(bs => !scope || bs.board.id in scope);

                return (
                    <div className="card-surface dash-widget" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="dash-widget__head widget-header-with-space">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                                <h3 className="dash-widget__title">Boards Progress</h3>
                                {renderScopeFilter('boardsOverview')}
                            </div>
                            <span className="dash-widget__icon" aria-hidden="true"><Layers size={15} /></span>
                        </div>
                        <div className="interesting-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {scopedRows.length === 0 ? (
                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    No boards in this scope.
                                </div>
                            ) : (
                                scopedRows.map(({ board, total, done, inProgress, pct }) => (
                                    <div
                                        key={board.id}
                                        onClick={() => openBoardFromDashboard(board.id)}
                                        title={`Click to open board "${board.title}"`}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '12px',
                                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.5)',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.18s, border-color 0.18s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.06)';
                                            e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary) / 0.25)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'hsl(var(--paper-head, var(--color-bg-subtle)) / 0.5)';
                                            e.currentTarget.style.borderColor = 'var(--paper-edge, hsl(var(--color-border)))';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                {board.isFavorite && <Star size={12} fill="#D97706" color="#D97706" style={{ flexShrink: 0 }} />}
                                                <span style={{ fontWeight: 600, fontSize: '13px', color: 'hsl(var(--color-text-primary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {board.title}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'hsl(var(--color-brand-primary))' }}>
                                                    {pct}%
                                                </span>
                                                <ArrowUpRight size={13} style={{ color: 'hsl(var(--color-brand-primary))', opacity: 0.75 }} />
                                            </div>
                                        </div>

                                        <div style={{ height: '6px', borderRadius: '999px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))', overflow: 'hidden', marginBottom: '6px' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2E6F40', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'hsl(var(--color-text-secondary))' }}>
                                            <span>{total} {total === 1 ? 'task' : 'tasks'}</span>
                                            <span>{done} done · {inProgress} active</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            }
            case 'workStatusChart':
                return (
                    <div className="card-surface dash-widget" style={{
                        padding: '0 20px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div className="dash-widget__head widget-header-with-space" style={{ margin: '0 -20px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                                <h3 className="dash-widget__title">Work Status</h3>
                                {renderScopeFilter('workStatusChart')}
                                <StatusColumnFilter
                                    options={statusColumnOptions}
                                    value={statusColFilters['workStatusChart'] ?? null}
                                    onChange={(key) => applyStatusColFilter('workStatusChart', key)}
                                    isOpen={statusMenuFor === 'workStatusChart'}
                                    onToggle={() => setStatusMenuFor(prev => (prev === 'workStatusChart' ? null : 'workStatusChart'))}
                                    onClose={() => setStatusMenuFor(null)}
                                />
                            </div>
                            <span className="dash-widget__icon" aria-hidden="true"><BarChart3 size={15} /></span>
                        </div>

                        <div style={{ flex: 1, minHeight: '170px', position: 'relative', marginTop: '6px' }}>
                            {(() => {
                                const maxValue = Math.max(...Object.values(stats.statusCounts).map(s => s.workloadCount), 5);
                                const rawStep = Math.ceil(maxValue / 5);
                                const niceSteps = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500];
                                const stepSize = niceSteps.find(n => n >= rawStep) || Math.ceil(rawStep / 50) * 50;

                                const yCeiling = stepSize * 5;
                                const ySteps = [yCeiling, yCeiling - stepSize, yCeiling - stepSize * 2, yCeiling - stepSize * 3, yCeiling - stepSize * 4, 0];

                                return (
                                    <>
                                        {/* Background Grid Lines */}
                                        <div style={{ position: 'absolute', top: 0, left: '36px', right: 0, bottom: '34px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0 }}>
                                            {ySteps.map(val => (
                                                <div key={val} style={{ width: '100%', borderTop: '1px solid var(--paper-row-line, var(--card-grid))', position: 'relative' }} />
                                            ))}
                                        </div>

                                        {/* Y-axis labels */}
                                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: '34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', textAlign: 'right', width: '28px', zIndex: 10, fontVariantNumeric: 'tabular-nums' }}>
                                            {ySteps.map(val => (
                                                <span key={val}>{val}</span>
                                            ))}
                                        </div>

                                        {/* Chart Area wrapper with scroll */}
                                        <div className="interesting-scroll" style={{
                                            height: '100%',
                                            marginLeft: '36px',
                                            borderLeft: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                            borderBottom: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                            position: 'relative',
                                            overflowX: 'auto',
                                            overflowY: 'hidden',
                                            display: 'flex',
                                            alignItems: 'flex-end',
                                            paddingBottom: '34px',
                                            paddingTop: '18px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', paddingRight: '20px', paddingLeft: '16px', height: '100%', minWidth: 'min-content' }}>
                                                {Object.entries(stats.statusCounts)
                                                    .sort((a, b) => a[1].workloadCount - b[1].workloadCount)
                                                    .map(([, status], i) => {
                                                        const barHeight = (status.workloadCount / yCeiling) * 165;
                                                        const sortedPeople = Object.entries(status.people).sort((a, b) => b[1].count - a[1].count);

                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setDrillDown({ title: `Status: ${status.label}`, statusFilter: status.label, boardFilter: scopedBoardId })}
                                                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '62px', position: 'relative', cursor: 'pointer' }}
                                                            >
                                                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'hsl(var(--color-text-primary))', marginBottom: '2px', position: 'absolute', bottom: `${Math.max(4, barHeight) + 4}px` }}>
                                                                    {status.workloadCount > 0 ? status.workloadCount : ''}
                                                                </div>
                                                                <div style={{
                                                                    width: '100%',
                                                                    height: `${Math.max(4, barHeight)}px`,
                                                                    display: 'flex',
                                                                    flexDirection: 'column-reverse',
                                                                    borderRadius: '6px 6px 0 0',
                                                                    overflow: 'hidden',
                                                                    backgroundColor: status.color,
                                                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                                                                    zIndex: 2
                                                                }}>
                                                                    {sortedPeople.map(([pId, pData], j) => (
                                                                        <div
                                                                            key={j}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setDrillDown({
                                                                                    title: `${status.label} · ${pData.name}`,
                                                                                    statusFilter: status.label,
                                                                                    personFilter: pData.name,
                                                                                    boardFilter: scopedBoardId
                                                                                });
                                                                            }}
                                                                            title={`${status.label} — ${pData.name}: ${pData.count} tasks (Click to inspect)`}
                                                                            style={{
                                                                                width: '100%',
                                                                                height: `${(pData.count / status.workloadCount) * 100}%`,
                                                                                backgroundColor: (stats.peopleMap as Record<string, any>)[pId]?.color || status.color,
                                                                                borderBottom: j < sortedPeople.length - 1 ? '1px solid rgba(255, 239, 210, 0.22)' : 'none',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                color: '#FFEFD2',
                                                                                fontSize: '10.5px',
                                                                                fontWeight: 700
                                                                            }}
                                                                        >
                                                                            {(pData.count / status.workloadCount) * 100 > 15 ? pData.count : ''}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <span title={status.label} style={{ position: 'absolute', top: '100%', marginTop: '7px', fontSize: '11px', color: 'hsl(var(--color-text-secondary))', fontWeight: 600, textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {status.label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* Interactive People Legend */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', padding: '10px 8px 0', borderTop: '1px solid var(--paper-row-line, var(--card-border))', flexWrap: 'wrap', justifyContent: 'center', maxHeight: '54px', overflowY: 'auto' }}>
                            {Object.values(stats.peopleMap)
                                .filter(person => person.name !== 'Unassigned')
                                .sort((a, b) => b.totalTasks - a.totalTasks)
                                .map((person, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setDrillDown({ title: `Assigned to ${person.name}`, personFilter: person.name, boardFilter: scopedBoardId })}
                                        title={`Click to view tasks assigned to ${person.name}`}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '3px 9px',
                                            borderRadius: '999px',
                                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: person.color }} />
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                                            {person.name} <span style={{ color: 'hsl(var(--color-text-tertiary))', fontWeight: 500 }}>({person.totalTasks})</span>
                                        </span>
                                    </button>
                                ))}
                        </div>
                    </div>
                );
            case 'timeline':
                return (
                    <WorkspaceTimeline
                        items={timelineItems}
                        columns={workspaceData.columns}
                        boards={workspaceBoards}
                        groupsByBoard={groupsByBoard}
                        isLoading={workspaceData.groups === null && workspaceBoards.length > 0}
                        onOpenItem={openTaskFromActivity}
                        onOpenBoard={openBoardFromDashboard}
                        fillHeight={true}
                        storageKey={`dashboardTimelineCollapsed:${activeWorkspaceId || 'none'}`}
                        filterControl={renderScopeFilter('timeline', 'toolbar')}
                    />
                );
            case 'boardUpdates': {
                const filteredLogs = scope
                    ? recentLogs.filter(log => {
                        const bid = log.metadata?.board_id || log.metadata?.to_board_id || (log.target_type === 'board' ? log.target_id : undefined);
                        return !!bid && bid in scope;
                    })
                    : recentLogs;

                return (
                    <div className="card-surface dash-widget" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="dash-widget__head widget-header-with-space">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                                <h3 className="dash-widget__title">Board Updates</h3>
                                {renderScopeFilter('boardUpdates')}
                            </div>
                            <span className="dash-widget__icon" aria-hidden="true"><Clock size={15} /></span>
                        </div>
                        <div className="interesting-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px 12px' }}>
                            {logsLoading ? (
                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    Loading activity…
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    No activity in this scope yet.
                                </div>
                            ) : (
                                filteredLogs.map(log => {
                                    const resolvedBoardId = log.metadata?.board_id || log.metadata?.to_board_id || (log.target_type === 'board' ? log.target_id : undefined) || undefined;
                                    return (
                                        <ActivityLogItem
                                            key={log.id}
                                            log={log}
                                            onClickTask={openTaskFromActivity}
                                            onClickBoard={openBoardFromDashboard}
                                            boardId={resolvedBoardId}
                                            boardName={boardTitleById.get(resolvedBoardId || '')}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </div>
                );
            }
            default:
                return null;
        }
    };

    const drillDownItems = useMemo(() => {
        if (!drillDown) return [];
        const mainItems = workspaceData.items.filter(item => !item.parent_id);
        const q = (drillDown.searchQuery || '').trim().toLowerCase();

        return mainItems.filter(item => {
            if (drillDown.boardFilter && item.board_id !== drillDown.boardFilter) return false;
            if (q && !(item.title || '').toLowerCase().includes(q)) return false;
            if (drillDown.statusFilter) {
                const st = overallStats.itemStatusMap.get(item.id);
                const label = st?.label || 'No status';
                if (label.toLowerCase() !== drillDown.statusFilter.toLowerCase()) return false;
            }
            if (drillDown.personFilter) {
                const people = overallStats.itemPeopleMap.get(item.id) || [];
                if (!people.some(p => p.toLowerCase() === drillDown.personFilter!.toLowerCase())) return false;
            }
            return true;
        });
    }, [drillDown, workspaceData.items, overallStats.itemStatusMap, overallStats.itemPeopleMap]);

    const addWidgetMenuPosition = () => {
        const rect = addWidgetBtnRef.current?.getBoundingClientRect();
        if (!rect) return { top: 64, right: 28 };
        return {
            top: rect.bottom + 8,
            right: Math.max(12, window.innerWidth - rect.right)
        };
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'hsl(var(--color-bg-canvas))' }}>
            <DndContext
                sensors={isMobile ? noSensors : sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 12px calc(var(--m-tabbar-h, 66px) + 36px)' : '20px 28px 32px' }}>
                    {/* Compact Narai Dashboard Header & Board Quick-Jump Bar */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        marginBottom: '20px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                                    WORKSPACE OVERVIEW · {workspaceBoards.length} {workspaceBoards.length === 1 ? 'BOARD' : 'BOARDS'} · {overallStats.totalTasks} {overallStats.totalTasks === 1 ? 'TASK' : 'TASKS'}
                                </div>
                                <h1 className="narai-heading" style={{
                                    margin: 0,
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: isMobile ? '22px' : '26px',
                                    fontWeight: 500,
                                    letterSpacing: '-0.02em',
                                    lineHeight: 1.1,
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    {workspace.title}
                                </h1>
                            </div>

                            {/* Dashboard Function Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="glass-chip"
                                    onClick={() => setDrillDown({ title: 'Workspace Task Explorer', searchQuery: '' })}
                                    style={{
                                        height: '32px',
                                        padding: '0 12px',
                                        borderRadius: '999px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12.5px',
                                        fontWeight: 500,
                                        color: 'hsl(var(--color-text-secondary))',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Search size={13.5} />
                                    <span>Find tasks…</span>
                                </button>

                                <button
                                    type="button"
                                    className="glass-chip"
                                    onClick={handleRefreshDashboard}
                                    title="Refresh dashboard data"
                                    style={{
                                        height: '32px',
                                        padding: '0 12px',
                                        borderRadius: '999px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12.5px',
                                        fontWeight: 500,
                                        color: 'hsl(var(--color-text-primary))',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <RefreshCw size={13.5} style={{ transition: 'transform 0.5s ease', transform: isRefreshing ? 'rotate(360deg)' : 'none' }} />
                                    <span>Refresh</span>
                                </button>

                                {isCreatingBoard ? (
                                    <form onSubmit={handleCreateBoard} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="text"
                                            className="glass-chip"
                                            value={newBoardTitle}
                                            onChange={(e) => setNewBoardTitle(e.target.value)}
                                            placeholder="New board name…"
                                            autoFocus
                                            style={{
                                                height: '32px',
                                                padding: '0 14px',
                                                borderRadius: '999px',
                                                outline: 'none',
                                                color: 'hsl(var(--color-text-primary))',
                                                fontSize: '12.5px',
                                                fontWeight: 500,
                                                width: '175px'
                                            }}
                                        />
                                        <button type="submit" className="btn-solid" style={{ height: '32px', padding: '0 12px', borderRadius: '999px', fontSize: '12px' }}>
                                            Create
                                        </button>
                                        <button
                                            type="button"
                                            className="glass-chip"
                                            onClick={() => { setIsCreatingBoard(false); setNewBoardTitle(''); }}
                                            style={{ width: '32px', height: '32px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </form>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-solid"
                                        onClick={() => setIsCreatingBoard(true)}
                                        style={{
                                            height: '32px',
                                            padding: '0 14px',
                                            borderRadius: '999px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '12.5px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Plus size={14} />
                                        <span>New board</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Clickable Board Quick-Jump Pills + Right-Aligned Dashboard Edit Control */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                                {boardSummaries.length > 0 && (
                                    <>
                                        <span style={{
                                            fontSize: '10.5px',
                                            fontWeight: 700,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            color: 'hsl(var(--color-text-tertiary))',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginRight: '2px'
                                        }}>
                                            <LayoutGrid size={12} /> Boards:
                                        </span>
                                        {boardSummaries.map(({ board, total, pct }) => (
                                            <button
                                                key={board.id}
                                                type="button"
                                                className="glass-chip"
                                                onClick={() => openBoardFromDashboard(board.id)}
                                                title={`Open "${board.title}" (${total} tasks · ${pct}% done)`}
                                                style={{
                                                    height: '28px',
                                                    padding: '0 11px',
                                                    borderRadius: '999px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--color-text-primary))',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {board.isFavorite && <Star size={11} fill="#D97706" color="#D97706" />}
                                                <span>{board.title}</span>
                                                <span style={{
                                                    padding: '1px 6px',
                                                    borderRadius: '999px',
                                                    backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                                                    color: 'hsl(var(--color-brand-primary))',
                                                    fontSize: '10.5px',
                                                    fontWeight: 700
                                                }}>
                                                    {total}
                                                </span>
                                                <ArrowUpRight size={12} style={{ opacity: 0.65 }} />
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>

                            {!isMobile && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                                    {isEditingDashboard && (
                                        <>
                                            <button
                                                ref={addWidgetBtnRef}
                                                type="button"
                                                className="glass-chip"
                                                onClick={() => setAddWidgetMenuOpen(prev => !prev)}
                                                style={{
                                                    height: '28px',
                                                    padding: '0 11px',
                                                    borderRadius: '999px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--color-brand-primary))',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Plus size={13} />
                                                <span>Widgets ({widgetOrder.length}/{WIDGET_CATALOG.length})</span>
                                                <ChevronDown size={12} />
                                            </button>

                                            {isLayoutCustomized && (
                                                <button
                                                    type="button"
                                                    className="glass-chip"
                                                    onClick={handleResetLayout}
                                                    title="Reset widget layout and restore defaults"
                                                    style={{
                                                        height: '28px',
                                                        padding: '0 10px',
                                                        borderRadius: '999px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 500,
                                                        color: 'hsl(var(--color-text-secondary))',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <RotateCcw size={12.5} />
                                                    <span>Reset</span>
                                                </button>
                                            )}
                                        </>
                                    )}

                                    <button
                                        type="button"
                                        className={isEditingDashboard ? 'btn-solid' : 'glass-chip'}
                                        onClick={() => {
                                            setIsEditingDashboard(prev => {
                                                if (prev) setAddWidgetMenuOpen(false);
                                                return !prev;
                                            });
                                        }}
                                        title={isEditingDashboard ? 'Finish editing dashboard' : 'Edit dashboard layout, sizes & widgets'}
                                        aria-label={isEditingDashboard ? 'Finish editing dashboard' : 'Edit dashboard'}
                                        style={{
                                            height: '28px',
                                            padding: isEditingDashboard ? '0 12px' : '0 9px',
                                            borderRadius: '999px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '5px',
                                            fontSize: '11.5px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isEditingDashboard ? (
                                            <>
                                                <Check size={13} />
                                                <span>Done</span>
                                            </>
                                        ) : (
                                            <Pencil size={13} />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {widgetOrder.length === 0 ? (
                        <div className="card-surface" style={{
                            padding: '48px 24px',
                            textAlign: 'center',
                            borderRadius: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <h3 className="narai-heading" style={{ margin: 0, fontSize: '20px', fontFamily: 'var(--font-family-display)', color: 'hsl(var(--color-text-primary))' }}>
                                No widgets on this dashboard
                            </h3>
                            <p style={{ margin: 0, fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                                Add individual widgets from the Widget Library or restore the default layout.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                <button
                                    type="button"
                                    className="btn-solid"
                                    onClick={() => {
                                        setIsEditingDashboard(true);
                                        setAddWidgetMenuOpen(true);
                                    }}
                                    style={{ height: '34px', padding: '0 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    + Add widget
                                </button>
                                <button
                                    type="button"
                                    className="glass-chip"
                                    onClick={handleResetLayout}
                                    style={{ height: '34px', padding: '0 16px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Restore default widgets
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, 1fr)',
                            gridAutoRows: 'auto',
                            gap: isMobile ? '16px' : `${GRID_GAP}px`
                        }}>
                            <SortableContext
                                items={widgetOrder}
                                strategy={rectSortingStrategy}
                            >
                                {widgetOrder.map((id) => {
                                    const resolvedSpan = isMobile ? 1 : layout.sizes[id]?.span ?? DEFAULT_SPAN[id] ?? 1;
                                    const resolvedHeight = snapHeight(layout.sizes[id]?.height ?? DEFAULT_HEIGHT[id] ?? 280);
                                    return (
                                        <DraggableDashboardWidget
                                            key={id}
                                            id={id}
                                            span={resolvedSpan}
                                            height={resolvedHeight}
                                            fixed={isMobile}
                                            isEditing={isEditingDashboard}
                                            onResize={(size) => updateLayout(current => ({ ...current, sizes: { ...current.sizes, [id]: size } }))}
                                            onRemove={() => removeWidget(id)}
                                        >
                                            {renderWidget(id)}
                                        </DraggableDashboardWidget>
                                    );
                                })}
                            </SortableContext>
                        </div>
                    )}
                </div>

                <DragOverlay adjustScale={true} />
            </DndContext>

            {/* Add / Remove Widget Library Popover */}
            {addWidgetMenuOpen && createPortal(
                <>
                    <div onClick={() => setAddWidgetMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1100 }} />
                    <div
                        className="glass-pop"
                        style={{
                            position: 'fixed',
                            ...addWidgetMenuPosition(),
                            width: '360px',
                            borderRadius: '18px',
                            zIndex: 1101,
                            overflow: 'hidden',
                            padding: '6px 0'
                        }}
                    >
                        <div style={{
                            padding: '10px 16px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                        }}>
                            <span style={{
                                fontSize: '10.5px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                color: 'hsl(var(--color-text-tertiary))'
                            }}>
                                Dashboard Widgets
                            </span>
                            {isLayoutCustomized && (
                                <button
                                    type="button"
                                    onClick={() => { handleResetLayout(); setAddWidgetMenuOpen(false); }}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'hsl(var(--color-brand-primary))',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Restore defaults
                                </button>
                            )}
                        </div>

                        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {WIDGET_CATALOG.map(w => {
                                const Icon = w.icon;
                                const isAdded = widgetOrder.includes(w.id);
                                const currentSpan = layout.sizes[w.id]?.span ?? DEFAULT_SPAN[w.id] ?? 1;
                                const currentHeight = snapHeight(layout.sizes[w.id]?.height ?? DEFAULT_HEIGHT[w.id] ?? 280);
                                return (
                                    <div
                                        key={w.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            padding: '8px 10px',
                                            borderRadius: '12px',
                                            backgroundColor: isAdded ? 'hsl(var(--color-brand-primary) / 0.05)' : 'transparent'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                            <span className="dash-widget__icon" style={{ width: '28px', height: '28px' }}>
                                                <Icon size={14} />
                                            </span>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                                                    {w.title}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', lineHeight: 1.3 }}>
                                                    {w.description}
                                                </div>
                                            </div>
                                        </div>

                                        {isAdded ? (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const nextSpan = currentSpan >= 3 ? 1 : currentSpan + 1;
                                                        updateLayout(curr => ({
                                                            ...curr,
                                                            sizes: { ...curr.sizes, [w.id]: { span: nextSpan, height: currentHeight } }
                                                        }));
                                                    }}
                                                    title="Cycle fixed width (1W / 2W / 3W)"
                                                    style={{
                                                        height: '24px',
                                                        padding: '0 7px',
                                                        borderRadius: '999px',
                                                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                        backgroundColor: 'hsl(var(--paper, #fff))',
                                                        color: 'hsl(var(--color-text-secondary))',
                                                        fontSize: '10.5px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {currentSpan}W
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const idx = FIXED_HEIGHTS.indexOf(currentHeight as typeof FIXED_HEIGHTS[number]);
                                                        const nextHeight = FIXED_HEIGHTS[(idx + 1) % FIXED_HEIGHTS.length];
                                                        updateLayout(curr => ({
                                                            ...curr,
                                                            sizes: { ...curr.sizes, [w.id]: { span: currentSpan, height: nextHeight } }
                                                        }));
                                                    }}
                                                    title="Cycle fixed height (S / M / L)"
                                                    style={{
                                                        height: '24px',
                                                        padding: '0 7px',
                                                        borderRadius: '999px',
                                                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                        backgroundColor: 'hsl(var(--paper, #fff))',
                                                        color: 'hsl(var(--color-text-secondary))',
                                                        fontSize: '10.5px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {HEIGHT_LABELS[currentHeight] || 'M'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeWidget(w.id)}
                                                    title="Remove widget from dashboard"
                                                    style={{
                                                        height: '24px',
                                                        width: '24px',
                                                        borderRadius: '50%',
                                                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                        backgroundColor: 'hsl(var(--paper, #fff))',
                                                        color: 'hsl(var(--color-danger, 0 72% 50%))',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn-solid"
                                                onClick={() => addWidget(w.id)}
                                                style={{
                                                    flexShrink: 0,
                                                    height: '26px',
                                                    padding: '0 11px',
                                                    borderRadius: '999px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Check size={11} />
                                                <span>+ Add</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}

            {/* Interactive Workspace Task Explorer & Drill-Down Modal */}
            {drillDown && createPortal(
                <div
                    onClick={() => setDrillDown(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1200,
                        backgroundColor: 'rgba(15, 22, 8, 0.36)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px'
                    }}
                >
                    <div
                        className="glass-pop"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(760px, 94vw)',
                            maxHeight: '82vh',
                            borderRadius: '22px',
                            backgroundColor: 'hsl(var(--paper, #fffbf3))',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            boxShadow: 'var(--glass-pop-shadow, 0 24px 56px -16px rgba(21, 42, 0, 0.42))',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '18px 22px 14px',
                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            <div>
                                <div className="bh-eyebrow" style={{ marginBottom: '2px' }}>
                                    {workspace.title.toUpperCase()} · {drillDownItems.length} {drillDownItems.length === 1 ? 'TASK' : 'TASKS'}
                                </div>
                                <h2 className="narai-heading" style={{
                                    margin: 0,
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: '21px',
                                    fontWeight: 600,
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    {drillDown.title}
                                </h2>
                            </div>
                            <button
                                type="button"
                                className="glass-chip"
                                onClick={() => setDrillDown(null)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Filter & Search Bar */}
                        <div style={{
                            padding: '12px 22px',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexWrap: 'wrap',
                            backgroundColor: 'hsl(var(--paper, #fffbf3))'
                        }}>
                            <div
                                className="glass-chip"
                                style={{
                                    position: 'relative',
                                    flex: '1 1 220px',
                                    height: '34px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '0 12px',
                                    gap: '8px',
                                    backgroundColor: 'hsl(var(--paper-head, #f8f1e3))'
                                }}
                            >
                                <Search size={14} style={{ color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }} />
                                <input
                                    type="text"
                                    value={drillDown.searchQuery || ''}
                                    onChange={(e) => setDrillDown(prev => prev ? { ...prev, searchQuery: e.target.value } : null)}
                                    placeholder="Search tasks by title…"
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        background: 'transparent',
                                        color: 'hsl(var(--color-text-primary))',
                                        fontSize: '12.5px',
                                        fontWeight: 500
                                    }}
                                />
                                {drillDown.searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setDrillDown(prev => prev ? { ...prev, searchQuery: '' } : null)}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            padding: 0,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'hsl(var(--color-text-tertiary))',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                <select
                                    className="glass-chip"
                                    value={drillDown.boardFilter || ''}
                                    onChange={(e) => setDrillDown(prev => prev ? { ...prev, boardFilter: e.target.value || null } : null)}
                                    style={{
                                        height: '34px',
                                        padding: '0 30px 0 13px',
                                        borderRadius: '999px',
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        outline: 'none',
                                        color: 'hsl(var(--color-text-primary))',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="">All boards</option>
                                    {workspaceBoards.map(b => (
                                        <option key={b.id} value={b.id}>{b.title}</option>
                                    ))}
                                </select>
                                <ChevronDown size={13} style={{ position: 'absolute', right: '11px', pointerEvents: 'none', color: 'hsl(var(--color-text-tertiary))' }} />
                            </div>

                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                <select
                                    className="glass-chip"
                                    value={drillDown.statusFilter || ''}
                                    onChange={(e) => setDrillDown(prev => prev ? { ...prev, statusFilter: e.target.value || null } : null)}
                                    style={{
                                        height: '34px',
                                        padding: '0 30px 0 13px',
                                        borderRadius: '999px',
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        outline: 'none',
                                        color: 'hsl(var(--color-text-primary))',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="">All statuses</option>
                                    {Object.values(overallStats.statusCounts).map((s, idx) => (
                                        <option key={idx} value={s.label}>{s.label}</option>
                                    ))}
                                    <option value="No status">No status</option>
                                </select>
                                <ChevronDown size={13} style={{ position: 'absolute', right: '11px', pointerEvents: 'none', color: 'hsl(var(--color-text-tertiary))' }} />
                            </div>

                            {(drillDown.statusFilter || drillDown.personFilter || drillDown.boardFilter || drillDown.searchQuery) && (
                                <button
                                    type="button"
                                    className="glass-chip"
                                    onClick={() => setDrillDown({ title: 'All Workspace Tasks', statusFilter: null, personFilter: null, boardFilter: null, searchQuery: '' })}
                                    style={{
                                        height: '34px',
                                        padding: '0 12px',
                                        borderRadius: '999px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        color: 'hsl(var(--color-brand-primary))',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>

                        {/* Grouped Task List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {drillDownItems.length === 0 ? (
                                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13.5px' }}>
                                    No tasks match the current filter.
                                </div>
                            ) : (
                                workspaceBoards
                                    .map(board => ({
                                        board,
                                        items: drillDownItems.filter(i => i.board_id === board.id)
                                    }))
                                    .filter(entry => entry.items.length > 0)
                                    .map(({ board, items }) => {
                                        const boardGroups = groupsByBoard.get(board.id) || [];
                                        const groupById = new Map(boardGroups.map(g => [g.id, g]));

                                        return (
                                            <div key={board.id} style={{
                                                borderRadius: '14px',
                                                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    padding: '10px 14px',
                                                    backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                                                    borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '10px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontFamily: 'var(--font-family-display)',
                                                            fontSize: '15px',
                                                            fontWeight: 600,
                                                            color: 'hsl(var(--color-text-primary))'
                                                        }}>
                                                            {board.title}
                                                        </span>
                                                        <span style={{
                                                            padding: '1px 7px',
                                                            borderRadius: '999px',
                                                            backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                                                            color: 'hsl(var(--color-brand-primary))',
                                                            fontSize: '11px',
                                                            fontWeight: 700
                                                        }}>
                                                            {items.length}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="glass-chip"
                                                        onClick={() => {
                                                            setDrillDown(null);
                                                            openBoardFromDashboard(board.id);
                                                        }}
                                                        style={{
                                                            height: '26px',
                                                            padding: '0 10px',
                                                            borderRadius: '999px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            fontSize: '11.5px',
                                                            fontWeight: 600,
                                                            color: 'hsl(var(--color-brand-primary))',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span>Open board</span>
                                                        <ArrowUpRight size={12} />
                                                    </button>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    {items.map((item, idx) => {
                                                        const grp = groupById.get(item.group_id);
                                                        const st = overallStats.itemStatusMap.get(item.id);
                                                        const assignees = overallStats.itemPeopleMap.get(item.id) || [];
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                onClick={() => {
                                                                    setDrillDown(null);
                                                                    openTaskFromActivity(item.id, board.id);
                                                                }}
                                                                style={{
                                                                    padding: '10px 14px',
                                                                    borderBottom: idx < items.length - 1 ? '1px solid var(--paper-row-line, hsl(var(--color-border)))' : 'none',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    gap: '12px',
                                                                    cursor: 'pointer',
                                                                    transition: 'background-color 0.15s'
                                                                }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'hsl(var(--color-brand-primary) / 0.05)'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                                    <span style={{
                                                                        width: '8px',
                                                                        height: '8px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: grp?.color || 'hsl(var(--color-brand-primary))',
                                                                        flexShrink: 0
                                                                    }} />
                                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {item.title || 'Untitled Task'}
                                                                    </span>
                                                                    {grp && (
                                                                        <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }}>
                                                                            · {grp.title}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                                    {assignees.length > 0 && (
                                                                        <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-secondary))', fontWeight: 500 }}>
                                                                            {assignees.join(', ')}
                                                                        </span>
                                                                    )}
                                                                    {st && (
                                                                        <span style={{
                                                                            padding: '2px 8px',
                                                                            borderRadius: '6px',
                                                                            backgroundColor: st.color,
                                                                            color: '#FFEFD2',
                                                                            fontSize: '10.5px',
                                                                            fontWeight: 700,
                                                                            letterSpacing: '0.03em',
                                                                            textTransform: 'uppercase'
                                                                        }}>
                                                                            {st.label}
                                                                        </span>
                                                                    )}
                                                                    <ArrowUpRight size={13} style={{ color: 'hsl(var(--color-text-tertiary))' }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                .interesting-scroll::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .interesting-scroll::-webkit-scrollbar-thumb {
                    background: var(--paper-edge, hsl(var(--color-border)));
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
};
