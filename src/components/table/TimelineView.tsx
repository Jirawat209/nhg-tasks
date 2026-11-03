import React, { useMemo, useRef, useState } from 'react';
import { itemColumns } from '../../lib/columnScope';
import { useBoardStore } from '../../store/useBoardStore';
import { format, addMonths, subMonths, addYears, subYears, addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../ui/Toast';
import { DependencyOverlay } from './DependencyOverlay';
import { DependenciesSection } from '../task/DependenciesSection';
import { NAME_COL_WIDTH, ROW_INNER_HEIGHT, ROW_HEIGHT, BAR_V_INSET, type BarGeometry } from './timelineGeometry';
import { buildTimeGrid, computeBarSpan, isCurrentUnit, todayOffset, unitWidthFor, type TimelineViewType } from '../../lib/timelineScale';

export const TimelineView = () => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);

    // Navigation and View state
    const [viewDate, setViewDate] = useState(new Date());
    // Month by default: a whole year fits on screen, which is the zoom most
    // boards are read at. Day only covers a 45-day window, so opening there
    // hid anything scheduled outside the next few weeks.
    const [viewType, setViewType] = useState<TimelineViewType>('month');

    // Drag move state (Local state for better perf).
    // originalFrom/originalTo hold the RAW stored strings, so the commit can
    // re-emit them in the same "YYYY-MM-DD" shape every other reader expects.
    // rawPx accumulates the pointer delta and offsetUnits is derived from the
    // total — rounding each mousemove instead loses sub-unit motion on slow drags.
    // The offset counts *columns*, not days: see the commit handler for why.
    const [draggingItem, setDraggingItem] = useState<{
        id: string;
        colId: string;
        rawPx: number;
        offsetUnits: number;
        originalFrom: string;
        originalTo: string;
    } | null>(null);

    // Drag-to-connect state for creating a dependency, in rows-wrapper coordinates.
    const [linkDraft, setLinkDraft] = useState<{ fromItemId: string; x: number; y: number } | null>(null);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const rowsRef = useRef<HTMLDivElement>(null);

    // Custom double-click detection on the bar itself, rather than the native
    // dblclick event: the first mousedown of a real double-click already starts
    // a drag (setDraggingItem) and mounts the fullscreen drag overlay, which
    // sits on top of the bar and can eat the mouseup/click that native dblclick
    // depends on. Tracking timing ourselves sidesteps that entirely.
    const lastBarClickRef = useRef<{ id: string; time: number } | null>(null);
    const suppressNextBarClickRef = useRef(false);
    const [dependencyPopupItemId, setDependencyPopupItemId] = useState<string | null>(null);

    const { can } = usePermission();
    const canEdit = can('edit_items');
    const { toasts, showToast, removeToast } = useToast();

    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);
    const updateItemDependency = useBoardStore(state => state.updateItemDependency);

    const timeGrid = useMemo(() => buildTimeGrid(viewDate, viewType), [viewDate, viewType]);

    const unitWidth = unitWidthFor(viewType);

    // Apply Filter/Sort/Search logic
    const items = useMemo(() => {
        if (!activeBoard) return [];
        let filtered = activeBoard.groups.flatMap(g => g.items.map(i => ({ ...i, groupColor: g.color })));

        // 1. Search Query
        if (searchQuery) {
            filtered = filtered.filter(i => (i.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // 2. Hidden Items
        if (!showHiddenItems) {
            filtered = filtered.filter(i => !i.isHidden);
        }

        // 3. Board Filters and Group Filter
        if (activeBoard.filters && activeBoard.filters.length > 0) {
            activeBoard.filters.forEach(filter => {
                if (filter.values && filter.values.length > 0) {
                    filtered = filtered.filter(item => {
                        if (filter.columnId === '__group__') {
                            return filter.values.includes(item.groupId);
                        }

                        const val = item.values[filter.columnId];
                        return Array.isArray(val) ? val.some(v => filter.values.includes(v)) : filter.values.includes(val);
                    });
                }
            });
        }

        // 4. Sort
        if (activeBoard.sort) {
            const { columnId, direction } = activeBoard.sort;
            const col = activeBoard.columns.find(c => c.id === columnId);
            if (col && direction) {
                filtered.sort((a, b) => {
                    let valA = a.values[columnId];
                    let valB = b.values[columnId];
                    if (col.type === 'number') {
                        valA = Number(valA) || 0;
                        valB = Number(valB) || 0;
                    }
                    if (valA < valB) return direction === 'asc' ? -1 : 1;
                    if (valA > valB) return direction === 'asc' ? 1 : -1;
                    return 0;
                });
            }
        }

        // 5. Group by
        if (activeBoard.groupByColumnId) {
            const groupCol = activeBoard.columns.find(c => c.id === activeBoard.groupByColumnId);
            if (groupCol) {
                filtered.sort((a, b) => {
                    const valA = String(a.values[groupCol.id] || '');
                    const valB = String(b.values[groupCol.id] || '');
                    return valA.localeCompare(valB);
                });
            }
        }

        return filtered;
    }, [activeBoard, searchQuery, showHiddenItems]);

    /**
     * Where every bar sits, computed once and shared by the bars themselves and
     * by the dependency arrows — if the two derived positions independently they
     * could drift apart. Items whose dates fall entirely outside the visible
     * window get no entry (and so no arrows).
     */
    const barGeometry = useMemo(() => {
        const map = new Map<string, BarGeometry>();
        if (!activeBoard) return map;

        const cols = itemColumns(activeBoard.columns).filter(c => c.type === 'timeline' || c.type === 'date' || c.type === 'due_date');

        items.forEach((item, rowIndex) => {
            let startDate: Date | null = null;
            let endDate: Date | null = null;
            let colId = '';

            for (const col of cols) {
                const val = item.values[col.id];
                if (!val) continue;
                if (col.type === 'timeline') {
                    if (val.from) startDate = new Date(val.from);
                    if (val.to) endDate = new Date(val.to);
                    colId = col.id;
                } else {
                    startDate = new Date(val);
                    endDate = new Date(val);
                    colId = col.id;
                }
                if (startDate) break;
            }

            if (!startDate || !endDate) return;

            const span = computeBarSpan(startDate, endDate, timeGrid, viewType, unitWidth);
            if (!span) return;

            map.set(item.id, { rowIndex, colId, ...span });
        });

        return map;
    }, [activeBoard, items, timeGrid, unitWidth, viewType]);

    const boardDependencies = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId),
        [itemDependencies, activeBoardId]
    );

    if (!activeBoard) return null;

    const navBtnStyle: React.CSSProperties = {
        height: '30px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '999px',
        cursor: 'pointer',
        color: 'hsl(var(--color-text-primary))',
        padding: '0 12px',
        fontSize: '12.5px',
        fontWeight: 500,
        transition: 'background-color 0.15s, color 0.15s, transform 0.15s'
    };

    return (
        // One lifted sheet (styles/cards.css .board-sheet); overflow clips the grid to its rounded corners
        <div className="board-sheet timeline-sheet" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
            borderColor: 'var(--paper-edge, var(--card-border))'
        }}>
            {/* Timeline Header (Navigator) */}
            <div className="timeline-toolbar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                borderBottom: '1px solid var(--paper-edge, var(--card-border))'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 className="narai-heading" style={{
                        fontFamily: 'var(--font-family-display)',
                        fontSize: '22px',
                        fontWeight: 500,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                        color: 'hsl(var(--color-text-primary))',
                        margin: 0,
                        minWidth: '58px'
                    }}>
                        {viewType === 'day' ? format(viewDate, 'MMMM yyyy') : 
                         viewType === 'month' ? format(viewDate, 'yyyy') : 
                         `${format(subYears(viewDate, 2), 'yyyy')} – ${format(addYears(viewDate, 2), 'yyyy')}`}
                    </h3>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                            type="button"
                            className="glass-chip"
                            onClick={() => {
                                if (viewType === 'day') setViewDate(subMonths(viewDate, 1));
                                else if (viewType === 'month') setViewDate(subYears(viewDate, 1));
                                else setViewDate(subYears(viewDate, 5));
                            }}
                            style={{ ...navBtnStyle, width: '30px', padding: 0 }}
                            aria-label="Previous period"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button 
                            type="button"
                            className="glass-chip"
                            onClick={() => {
                                if (viewType === 'day') setViewDate(addMonths(viewDate, 1));
                                else if (viewType === 'month') setViewDate(addYears(viewDate, 1));
                                else setViewDate(addYears(viewDate, 5));
                            }}
                            style={{ ...navBtnStyle, width: '30px', padding: 0 }}
                            aria-label="Next period"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <button 
                        type="button"
                        className="glass-chip"
                        onClick={() => setViewDate(new Date())}
                        style={navBtnStyle}
                    >
                        Today
                    </button>

                    <div className="seg glass-chip" style={{ marginLeft: '6px' }}>
                        {(['day', 'month', 'year'] as const).map(type => (
                            <button
                                key={type}
                                type="button"
                                className={`seg-btn${viewType === type ? ' is-active' : ''}`}
                                onClick={() => setViewType(type)}
                                style={{ textTransform: 'capitalize', height: '26px', padding: '0 12px', fontSize: '12px' }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Timeline Grid */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                <div style={{ display: 'flex', minWidth: 'max-content', minHeight: '100%', flexDirection: 'column', position: 'relative' }}>
                    
                    {/* Calendar Day Headers */}
                    <div style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--paper-edge, var(--card-border))',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))'
                    }}>
                        <div style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 11,
                            width: `${NAME_COL_WIDTH}px`,
                            flexShrink: 0,
                            borderRight: '1px solid var(--paper-edge, var(--card-border))',
                            padding: '10px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            fontWeight: 600,
                            fontSize: '10.5px',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'hsl(var(--color-text-tertiary))'
                        }}>
                            Item Name
                        </div>
                        {timeGrid.map(unit => {
                            const isCurrent = isCurrentUnit(viewType, unit);
                            return (
                                <div key={unit.toISOString()} style={{
                                    width: `${unitWidth}px`,
                                    flexShrink: 0,
                                    textAlign: 'center',
                                    padding: '8px 0',
                                    fontSize: '11px',
                                    borderRight: '1px solid var(--paper-row-line, var(--card-grid))',
                                    backgroundColor: isCurrent ? 'rgba(21, 42, 0, 0.045)' : 'transparent',
                                    color: isCurrent ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                                    fontWeight: isCurrent ? 700 : 600,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase'
                                }}>
                                    <div>
                                        {viewType === 'day' ? format(unit, 'd') : 
                                         viewType === 'month' ? format(unit, 'MMM') : 
                                         format(unit, 'yyyy')}
                                    </div>
                                    {viewType === 'day' && <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '1px' }}>{format(unit, 'EEE')}</div>}
                                    {viewType === 'month' && <div style={{ fontSize: '9.5px', opacity: 0.65, marginTop: '1px', fontWeight: isCurrent ? 600 : 500 }}>{format(unit, 'yyyy')}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Today Indicator Line (Overlay) */}
                    {(() => {
                        const pos = todayOffset(timeGrid, viewType, unitWidth);
                        if (pos === null) return null;

                        return (
                            <div style={{
                                position: 'absolute',
                                left: `${NAME_COL_WIDTH + pos}px`,
                                top: 0,
                                bottom: 0,
                                width: '1.5px',
                                backgroundColor: '#9E2A2B',
                                zIndex: 8,
                                pointerEvents: 'none',
                                opacity: 0.75
                            }}>
                                <span style={{
                                    position: 'absolute',
                                    top: '38px',
                                    left: '-3.5px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: '#9E2A2B',
                                    boxShadow: '0 0 0 2px hsl(var(--paper, var(--color-bg-surface)))'
                                }} />
                            </div>
                        );
                    })()}

                    <div
                        ref={rowsRef}
                        style={{ flex: 1, position: 'relative' }}
                        onMouseMove={(e) => {
                            if (!linkDraft || !rowsRef.current) return;
                            const rect = rowsRef.current.getBoundingClientRect();
                            setLinkDraft({ ...linkDraft, x: e.clientX - rect.left, y: e.clientY - rect.top });
                        }}
                        onMouseUp={async () => {
                            if (!linkDraft) return;
                            const draft = linkDraft;
                            setLinkDraft(null);
                            const targetIndex = Math.floor(draft.y / ROW_HEIGHT);
                            const target = items[targetIndex];
                            if (!target || target.id === draft.fromItemId) return;
                            const result = await addItemDependency(draft.fromItemId, target.id);
                            if (!result.success) showToast(result.error || 'Could not link these items', 'error');
                        }}
                        onMouseLeave={() => setLinkDraft(null)}
                    >
                        {items.map(item => {
                            const geometry = barGeometry.get(item.id);
                            const isHovered = hoveredItemId === item.id;
                            const isNarrowBar = geometry ? geometry.width < 68 : false;
                            const dragTranslate = draggingItem?.id === item.id ? `translateX(${draggingItem.offsetUnits * unitWidth}px)` : undefined;

                            return (
                                <div
                                    key={item.id}
                                    onMouseEnter={() => setHoveredItemId(item.id)}
                                    onMouseLeave={() => setHoveredItemId(prev => (prev === item.id ? null : prev))}
                                    style={{
                                        display: 'flex',
                                        borderBottom: '1px solid var(--paper-row-line, var(--card-grid))',
                                        height: `${ROW_INNER_HEIGHT}px`,
                                        alignItems: 'center',
                                        backgroundColor: isHovered ? 'rgba(21, 42, 0, 0.025)' : 'transparent',
                                        transition: 'background-color 0.12s'
                                    }}
                                >
                                    <div
                                        onClick={() => setActiveItem(item.id)}
                                        style={{
                                            position: 'sticky',
                                            left: 0,
                                            zIndex: 6,
                                            width: `${NAME_COL_WIDTH}px`,
                                            height: '100%',
                                            boxSizing: 'border-box',
                                            flexShrink: 0,
                                            borderRight: '1px solid var(--paper-edge, var(--card-grid))',
                                            padding: '0 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                            fontSize: '13px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            cursor: 'pointer',
                                            color: 'hsl(var(--color-text-primary))',
                                            fontWeight: 500
                                        }}
                                    >
                                        <span style={{
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            backgroundColor: item.groupColor || 'hsl(var(--color-brand-primary))',
                                            flexShrink: 0
                                        }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.title}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', position: 'relative', flex: 1 }}>
                                        {timeGrid.map(unit => {
                                            const isCurrent = isCurrentUnit(viewType, unit);
                                            return (
                                                <div
                                                    key={unit.toISOString()}
                                                    style={{
                                                        width: `${unitWidth}px`,
                                                        height: `${ROW_INNER_HEIGHT}px`,
                                                        borderRight: '1px solid var(--paper-row-line, var(--card-grid))',
                                                        backgroundColor: isCurrent ? 'rgba(21, 42, 0, 0.02)' : 'transparent',
                                                        flexShrink: 0
                                                    }}
                                                />
                                            );
                                        })}

                                        {geometry && (
                                            <>
                                                <div
                                                    title={item.title}
                                                    onClick={() => {
                                                        if (suppressNextBarClickRef.current) {
                                                            suppressNextBarClickRef.current = false;
                                                            return;
                                                        }
                                                        setActiveItem(item.id);
                                                    }}
                                                    onMouseDown={(e) => {
                                                        if (!canEdit) return;

                                                        // Double-click detected by timing, not the native dblclick
                                                        // event — see the ref's own comment for why.
                                                        const now = Date.now();
                                                        const last = lastBarClickRef.current;
                                                        if (last && last.id === item.id && now - last.time < 400) {
                                                            lastBarClickRef.current = null;
                                                            suppressNextBarClickRef.current = true;
                                                            e.stopPropagation();
                                                            setDependencyPopupItemId(item.id);
                                                            return;
                                                        }
                                                        lastBarClickRef.current = { id: item.id, time: now };

                                                        const raw = item.values[geometry.colId];
                                                        const col = activeBoard.columns.find(c => c.id === geometry.colId);
                                                        // Carry the stored strings through untouched so the
                                                        // commit can re-emit them in the same format.
                                                        const from = col?.type === 'timeline' ? raw?.from : raw;
                                                        const to = col?.type === 'timeline' ? (raw?.to ?? raw?.from) : raw;
                                                        if (!from || !to) return;
                                                        e.stopPropagation();
                                                        setDraggingItem({
                                                            id: item.id,
                                                            colId: geometry.colId,
                                                            rawPx: 0,
                                                            offsetUnits: 0,
                                                            originalFrom: from,
                                                            originalTo: to
                                                        });
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        top: `${BAR_V_INSET}px`,
                                                        bottom: `${BAR_V_INSET}px`,
                                                        left: `${geometry.left}px`,
                                                        width: `${geometry.width}px`,
                                                        boxSizing: 'border-box',
                                                        // Snaps to the same whole columns the commit uses, so the bar
                                                        // previews exactly where it will land. Following the cursor 1:1
                                                        // here instead made the release look like a correction, since
                                                        // the drop always rounds to a column anyway.
                                                        transform: dragTranslate,
                                                        backgroundColor: item.groupColor || 'hsl(var(--color-brand-primary))',
                                                        borderRadius: '6px',
                                                        opacity: draggingItem?.id === item.id ? 0.78 : 0.94,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: isNarrowBar ? 'center' : 'flex-start',
                                                        color: '#FFEFD2',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        letterSpacing: '0.01em',
                                                        padding: isNarrowBar ? 0 : '0 8px',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        zIndex: 5,
                                                        cursor: canEdit ? 'move' : 'pointer',
                                                        transition: draggingItem?.id === item.id ? 'none' : 'opacity 0.2s, box-shadow 0.2s',
                                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px -2px rgba(21, 42, 0, 0.28)'
                                                    }}
                                                >
                                                    {!isNarrowBar && (
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.title}
                                                        </span>
                                                    )}
                                                </div>

                                                {isNarrowBar && (
                                                    <div
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${geometry.left + geometry.width + 7}px`,
                                                            top: 0,
                                                            bottom: 0,
                                                            transform: dragTranslate,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            fontSize: '11.5px',
                                                            fontWeight: 500,
                                                            color: 'hsl(var(--color-text-secondary))',
                                                            whiteSpace: 'nowrap',
                                                            pointerEvents: 'none',
                                                            zIndex: 4
                                                        }}
                                                    >
                                                        {item.title}
                                                    </div>
                                                )}

                                                {/* Off-window markers: the bar's edge here is the window
                                                    boundary, not the item's real start/end — without these
                                                    a bar entering or leaving view as you drag it can look
                                                    like its duration is changing, when it never has. */}
                                                {geometry.clippedStart && (
                                                    <div
                                                        title="Starts before what's shown"
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${geometry.left + 2}px`,
                                                            top: `${BAR_V_INSET}px`,
                                                            bottom: `${BAR_V_INSET}px`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            color: 'rgba(255,255,255,0.85)',
                                                            fontSize: '10px',
                                                            zIndex: 6,
                                                            pointerEvents: 'none'
                                                        }}
                                                    >
                                                        «
                                                    </div>
                                                )}
                                                {geometry.clippedEnd && (
                                                    <div
                                                        title="Continues past what's shown"
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${geometry.left + geometry.width - 12}px`,
                                                            top: `${BAR_V_INSET}px`,
                                                            bottom: `${BAR_V_INSET}px`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            color: 'rgba(255,255,255,0.85)',
                                                            fontSize: '10px',
                                                            zIndex: 6,
                                                            pointerEvents: 'none'
                                                        }}
                                                    >
                                                        »
                                                    </div>
                                                )}

                                                {/* Connector dot — drag from here onto another row to
                                                    make that row depend on this one. */}
                                                {canEdit && (hoveredItemId === item.id || linkDraft?.fromItemId === item.id) && (
                                                    <div
                                                        title="Drag to the item that should start after this one"
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation(); // don't start a bar move
                                                            if (!rowsRef.current) return;
                                                            const rect = rowsRef.current.getBoundingClientRect();
                                                            setLinkDraft({
                                                                fromItemId: item.id,
                                                                x: e.clientX - rect.left,
                                                                y: e.clientY - rect.top
                                                            });
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${geometry.left + geometry.width - 4}px`,
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            width: '10px',
                                                            height: '10px',
                                                            borderRadius: '50%',
                                                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                                            border: '2px solid hsl(var(--color-brand-primary))',
                                                            cursor: 'crosshair',
                                                            zIndex: 7
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <DependencyOverlay
                            dependencies={boardDependencies}
                            barGeometry={barGeometry}
                            rowCount={items.length}
                            linkDraft={linkDraft}
                            canEdit={canEdit}
                            onRemove={removeItemDependency}
                            items={items}
                            onUpdate={updateItemDependency}
                        />

                        {/* Double-click a bar (not an arrow) to manage that item's own
                            dependencies — what it waits on and what it blocks — without
                            leaving the Timeline. */}
                        {dependencyPopupItemId && activeBoardId && (() => {
                            const geo = barGeometry.get(dependencyPopupItemId);
                            const popupItem = items.find(i => i.id === dependencyPopupItemId);
                            if (!geo || !popupItem) return null;
                            const x = NAME_COL_WIDTH + geo.left + geo.width / 2;
                            const y = geo.rowIndex * ROW_HEIGHT;
                            return (
                                <>
                                    <div onClick={() => setDependencyPopupItemId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                                    <div
                                        className="glass-pop"
                                        style={{
                                            position: 'absolute',
                                            left: `${x}px`,
                                            top: `${y}px`,
                                            transform: 'translate(-50%, -110%)',
                                            zIndex: 41,
                                            width: '320px',
                                            overflow: 'hidden'
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                                        }}>
                                            <span style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', fontWeight: 500, color: 'hsl(var(--color-text-primary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {popupItem.title}
                                            </span>
                                            <button
                                                onClick={() => setDependencyPopupItemId(null)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                        <DependenciesSection itemId={dependencyPopupItemId} boardId={activeBoardId} compact />
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {draggingItem && (
                <div 
                    onMouseMove={(e) => {
                        // Accumulate raw pixels and derive the day offset from the
                        // running total, so slow drags don't lose sub-unit motion.
                        setDraggingItem(prev => {
                            if (!prev) return null;
                            const rawPx = prev.rawPx + e.movementX;
                            return { ...prev, rawPx, offsetUnits: Math.round(rawPx / unitWidth) };
                        });
                    }}
                    onMouseUp={() => {
                        if (draggingItem.offsetUnits !== 0) {
                            // Move by whole columns, in the unit the column actually
                            // represents. Converting the drag to an *average* number of
                            // days instead (30.44 per month) landed the bar mid-month
                            // on all but a ~5px sliver of the drag: a Sep 1-30 bar
                            // became Sep 29 - Oct 28, which still spans 30 days but
                            // straddles two month columns, so the bar rendered twice as
                            // wide and read as the duration having doubled.
                            const originalStart = parseISO(draggingItem.originalFrom);
                            const newStart =
                                viewType === 'day' ? addDays(originalStart, draggingItem.offsetUnits)
                                : viewType === 'month' ? addMonths(originalStart, draggingItem.offsetUnits)
                                : addYears(originalStart, draggingItem.offsetUnits);

                            // Emit "YYYY-MM-DD": every reader (TimelineCell, DateCell,
                            // the due-date reminder SQL) parses that shape, and an ISO
                            // timestamp here silently breaks all three.
                            const asStored = (d: Date) => format(d, 'yyyy-MM-dd');
                            const col = activeBoard.columns.find(c => c.id === draggingItem.colId);
                            if (col?.type === 'timeline') {
                                // Derive the end from the *original* span rather than
                                // shifting it independently, so a move can never change
                                // the duration — addMonths alone would stretch a 30-day
                                // bar to 31 whenever it landed on a longer month.
                                const span = differenceInCalendarDays(parseISO(draggingItem.originalTo), originalStart);
                                const existing = activeBoard.items.find(i => i.id === draggingItem.id)?.values?.[draggingItem.colId];
                                updateItemValue(draggingItem.id, draggingItem.colId, {
                                    ...existing,
                                    from: asStored(newStart),
                                    to: asStored(addDays(newStart, span))
                                });
                            } else {
                                updateItemValue(draggingItem.id, draggingItem.colId, asStored(newStart));
                            }
                        }
                        setDraggingItem(null);
                    }}
                    onMouseLeave={() => setDraggingItem(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'move' }}
                />
            )}

            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </div>
    );
};


