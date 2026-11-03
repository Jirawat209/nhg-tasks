import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useRef, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useBoardStore } from '../../store/useBoardStore';
import { useThemeStore } from '../../store/useThemeStore';
import { usePermission } from '../../hooks/usePermission';
import { Header } from './Header';
import { Row } from './Row';
import { GroupRow } from './GroupRow';
import type { VirtualItemData } from '../../utils/grouping';
import { tableRows } from '../../lib/boardRows';
import { itemColumns, scopeOf } from '../../lib/columnScope';
import type { Column } from '../../types';
import { SummaryCell } from './SummaryCell';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    type DragStartEvent,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';

// Wrapper for Sortable Items
const SortableItemWrapper = ({
    id,
    children,
    disabled,
    style: propStyle
}: {
    id: string;
    children: (vals: any) => React.ReactNode;
    disabled?: boolean;
    style?: React.CSSProperties
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id, disabled });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        ...propStyle,
        height: '100%',
        width: '100%',
        position: 'relative',
        // Prevent gaps during drag
        margin: 0,
        padding: 0,
        boxSizing: 'border-box'
    };

    return (
        <div ref={setNodeRef} style={style} {...(disabled ? {} : attributes)}>
            {children({ listeners })}
        </div>
    );
};

const NO_COLUMNS: Column[] = [];

// The real group a dropped-on row belongs to, for reordering groups by drag — a
// group row is itself, everything else falls under the group its own data
// carries (an item or footer's `groupId`, or a sub-item row's `columnGroupId`,
// since a sub-item's group is its parent's — see columnScope in CLAUDE.md).
// Dropping a dragged group onto anything this doesn't recognise returns null and
// the caller no-ops, which is exactly how a group used to silently snap back to
// its old spot when released on its own footer row or on any sub-item row (the
// "+ Add subitem" row, a sub-item, its header or its summary) — only 'group' and
// 'item' targets were ever resolved.
const groupIdOfRow = (vi: VirtualItemData | undefined): string | null => {
    if (!vi) return null;
    switch (vi.type) {
        case 'group': return vi.id;
        case 'item':
        case 'footer': return (vi.data as { groupId?: string })?.groupId ?? null;
        case 'subitem-header':
        case 'subitem':
        case 'subitem-footer':
        case 'subitem-summary': return vi.columnGroupId ?? null;
        default: return null;
    }
};

// Row types drawn as the sides of a group's card
const CARD_MIDDLE = new Set(['item', 'subitem', 'subitem-header', 'subitem-summary', 'subitem-footer']);

const DENSITY_METRICS = {
    normal: {
        ITEM_HEADER_HEIGHT: 36,
        GROUP_HEADER_HEIGHT: 44,
        GROUP_GAP: 20,
        FIRST_GROUP_GAP: 14,
        FOOTER_HEIGHT: 44,
        ROW_HEIGHT: 34,
        SUBITEM_HEADER_HEIGHT: 32,
        SUBITEM_FOOTER_HEIGHT: 36,
        SHEET_INSET: 10,
    },
    compact: {
        ITEM_HEADER_HEIGHT: 32,
        GROUP_HEADER_HEIGHT: 38,
        GROUP_GAP: 12,
        FIRST_GROUP_GAP: 8,
        FOOTER_HEIGHT: 36,
        ROW_HEIGHT: 28,
        SUBITEM_HEADER_HEIGHT: 28,
        SUBITEM_FOOTER_HEIGHT: 30,
        SHEET_INSET: 8,
    }
} as const;

export const Table = ({ boardId }: { boardId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const density = useThemeStore(state => state.density);
    const {
        ITEM_HEADER_HEIGHT,
        GROUP_HEADER_HEIGHT,
        GROUP_GAP,
        FIRST_GROUP_GAP,
        FOOTER_HEIGHT,
        ROW_HEIGHT,
        SUBITEM_HEADER_HEIGHT,
        SUBITEM_FOOTER_HEIGHT,
        SHEET_INSET,
    } = DENSITY_METRICS[density] || DENSITY_METRICS.normal;
    const toggleGroup = useBoardStore(state => state.toggleGroup);
    const moveItem = useBoardStore(state => state.moveItem);
    const reorderGroups = useBoardStore(state => state.reorderGroups);
    const parentRef = useRef<HTMLDivElement>(null);
    const { can } = usePermission();

    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const itemColumnWidth = board?.itemColumnWidth || 350;

    const [activeId, setActiveId] = useState<string | null>(null);

    if (board && !board.isDataLoaded) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div className="spinner" style={{ width: '24px', height: '24px', border: '2px solid hsl(var(--color-border))', borderTopColor: 'hsl(var(--color-brand-primary))', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '14px' }}>Loading board content...</p>
                </div>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    const virtualItems = useMemo(() => {
        if (!board) return [];
        return tableRows(board, { searchQuery, showHiddenItems });
    }, [board?.items, board?.groups, board?.groupByColumnId, board?.collapsedGroups, board?.expandedItemIds, board?.columns, searchQuery, board?.sort, board?.filters, showHiddenItems]);

    const rowVirtualizer = useVirtualizer({
        count: virtualItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const type = virtualItems[index]?.type;
            if (type === 'group') return GROUP_HEADER_HEIGHT + (index === 0 ? FIRST_GROUP_GAP : GROUP_GAP);
            if (type === 'subitem-header') return SUBITEM_HEADER_HEIGHT;
            if (type === 'subitem-footer' || type === 'subitem-summary') return SUBITEM_FOOTER_HEIGHT;
            if (type === 'footer') return FOOTER_HEIGHT;
            return ROW_HEIGHT;
        },
        overscan: 5,
        // The frozen header above sits in normal flow, pushing the virtualized
        // rows down by its own height; this tells the virtualizer about that
        // offset so it maps scrollTop to the right rows. Row positions below are
        // then shifted back by the same amount (virtualRow.start is margin-relative,
        // the rows div they're drawn in isn't).
        scrollMargin: ITEM_HEADER_HEIGHT,
    });

    // Force remeasure after items or density change to prevent gaps
    useEffect(() => {
        rowVirtualizer.measure();
    }, [virtualItems, density, rowVirtualizer]);

    // SCROLL TO HIGHLIGHTED ITEM
    const highlightedItemId = useBoardStore(state => state.highlightedItemId);

    useEffect(() => {
        if (highlightedItemId) {
            const index = virtualItems.findIndex(i => i.id === highlightedItemId);
            if (index !== -1) {
                rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
                // We rely on Row.tsx to handle the flashing class, 
                // IF the row is rendered.
            }
        }
    }, [highlightedItemId, virtualItems, rowVirtualizer]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (active.id !== over?.id && over) {
            const activeVItem = virtualItems.find(i => i.id === active.id);
            const overVItem = virtualItems.find(i => i.id === over.id);

            if (activeVItem?.type === 'group') {
                const targetGroupId = groupIdOfRow(overVItem);
                if (targetGroupId && active.id !== targetGroupId) {
                    reorderGroups(active.id as string, targetGroupId);
                }
            } else {
                moveItem(active.id as string, over.id as string);
            }
        }
    };

    // Debug: Log Virtual Items
    // useEffect(() => {
    //     console.log('[DnD] VirtualItems:', virtualItems.map(i => i.id));
    // }, [virtualItems.length]); // logs too often?


    // The width of the columns alone. Shared by the header, the add-item row and
    // the group summary row so that all three are measured from one number
    // rather than each re-deriving its own.
    // Items have one set of columns, and the sub-items under each group's items
    // another, so every set is sized on its own. The table is as wide as the
    // widest of them, so narrower rows simply end earlier instead of the page
    // scrolling short.
    const itemCols = useMemo(() => itemColumns(board?.columns || []), [board?.columns]);
    // One array per group, built once per change to the columns, so a sub-item
    // row gets the same array every render and its memoised cells stay put.
    const subColsByGroup = useMemo(() => {
        const byGroup = new Map<string, Column[]>();
        (board?.columns || []).forEach(c => {
            if (scopeOf(c) !== 'subitem' || !c.groupId) return;
            const list = byGroup.get(c.groupId);
            if (list) list.push(c); else byGroup.set(c.groupId, [c]);
        });
        return byGroup;
    }, [board?.columns]);
    const subColsFor = (groupId?: string): Column[] => (groupId && subColsByGroup.get(groupId)) || NO_COLUMNS;
    const widthOf = (cols: Column[]) => cols.reduce((total, col) => total + (col.width || 150), 0);
    const columnsWidth = useMemo(() => {
        // Only groups on screen: archived groups keep their columns for a restore.
        const shown = new Set((board?.groups || []).map(g => g.id));
        let widest = widthOf(itemCols);
        subColsByGroup.forEach((cols, groupId) => { if (shown.has(groupId)) widest = Math.max(widest, widthOf(cols)); });
        return widest;
    }, [itemCols, subColsByGroup, board?.groups]);

    const totalWidth = useMemo(() => {
        if (!board) return 0;
        return itemColumnWidth + columnsWidth + 50; // Add 50 for the add column btn/last spacer
    }, [board, itemColumnWidth, columnsWidth]);

    if (!board) return null;

    const activeItem = activeId ? board.items.find(i => i.id === activeId) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            {/* The sheet's frame is drawn on a wrapper with an inset, rather than on the
                scroll container itself, so the frozen header, the group cards and the
                scrollbars sit a little inside the frame instead of running into its
                edges. The scroll container stays padding-free, which keeps the sticky
                header/column offsets and the virtualizer's measurements untouched. */}
            <div
                className="board-sheet"
                style={{ height: '100%', width: '100%', padding: SHEET_INSET, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
            <div
                ref={parentRef}
                className="table-container"
                // A stacking context of its own, so the z-indexes inside the table
                // (the frozen header's 100, a dragged row's 99, sticky columns) only
                // order things within the table and can't lift any of it above the
                // rest of the page. Without it the frozen header rose above modal
                // backdrops and dropdowns opened elsewhere: dimmed page, bright bar.
                // Every menu the table opens is portaled to <body>, so nothing
                // inside needs to escape.
                style={{ flex: 1, minHeight: 0, overflow: 'auto', width: '100%', isolation: 'isolate' }}
                // The card chrome (styles/board_glass.css) starts at the horizontal
                // scroll offset so cards keep their rounded left edge in view, and
                // data-scrolled-x activates the frozen first column's right drop shadow.
                // Set directly on the DOM node, not through state, so scrolling never re-renders.
                onScroll={(e) => {
                    const sx = e.currentTarget.scrollLeft;
                    e.currentTarget.style.setProperty('--table-sx', `${sx}px`);
                    if (sx > 0) e.currentTarget.setAttribute('data-scrolled-x', 'true');
                    else e.currentTarget.removeAttribute('data-scrolled-x');
                }}
            >
                {/* The item columns' header. One bar for the whole table rather than one
                    per group — item columns are the same set everywhere — pinned to the
                    top of the scroll container so it stays visible past every group. */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 100
                }}>
                    <Header columns={itemCols} />
                </div>

                <div
                    className="table-content"
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: `${totalWidth}px`, // Use calculated total width
                        position: 'relative',
                    }}
                >

                    <SortableContext
                        items={virtualItems.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const vItem = virtualItems[virtualRow.index];
                            const isGroup = vItem.type === 'group';
                            const isFooter = vItem.type === 'footer';

                            const isDragging = activeId === vItem.id;
                            return (
                                <div
                                    key={vItem.id}
                                    className={CARD_MIDDLE.has(vItem.type) ? 'gcard' : undefined}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: `${totalWidth}px`, // Ensure row wrapper spans full content width
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start - ITEM_HEADER_HEIGHT}px)`,
                                        zIndex: isDragging ? 99 : 1
                                    }}
                                >
                                    <SortableItemWrapper
                                        id={vItem.id}
                                        // We enable sortable for everything so they can be valid drop targets,
                                        // but we only attach listeners to Items (in Row.tsx), so only items are draggable.
                                        disabled={!can('edit_items')}
                                    >
                                        {({ listeners }) => (
                                            <motion.div
                                                initial={{ opacity: 0, y: -20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, ease: "easeOut" }}
                                                style={{ height: '100%' }}
                                            >
                                                {isGroup ? (
                                                    <div style={{ 
                                                        position: 'relative', 
                                                        height: '100%', 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        justifyContent: 'flex-end',
                                                        paddingTop: virtualRow.index === 0 ? FIRST_GROUP_GAP : GROUP_GAP
                                                    }}>
                                                        <GroupRow
                                                            data={vItem.data as any}
                                                            groupColor={vItem.groupColor}
                                                            isCollapsed={(board.collapsedGroups || []).includes(vItem.id)}
                                                            onToggle={() => toggleGroup(board.id, vItem.id)}
                                                            dragHandleProps={listeners}
                                                            columns={itemCols}
                                                            itemColumnWidth={itemColumnWidth}
                                                        />
                                                    </div>
                                                ) : isFooter ? (
                                                    // The foot of the group's card: the quick-add line in the
                                                    // sticky first column, and the per-column roll-ups across the rest.
                                                    <div className="gcard gcard-bottom" style={{ display: 'flex', alignItems: 'center', height: '100%', boxSizing: 'border-box' }}>
                                                        <div className="gf-add" style={{ width: `${itemColumnWidth}px` }}>
                                                            <Plus size={15} />
                                                            {can('edit_items') ? (
                                                                <input
                                                                    type="text"
                                                                    placeholder="Add item"
                                                                    aria-label="Add item to this group"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            const input = e.currentTarget;
                                                                            const val = input.value.trim();
                                                                            if (val) {
                                                                                useBoardStore.getState().addItem(val, vItem.data.groupId);
                                                                                input.value = '';
                                                                            }
                                                                        } else if (e.key === 'Escape') {
                                                                            e.currentTarget.value = '';
                                                                            e.currentTarget.blur();
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span style={{ fontSize: '13px' }}>{vItem.data.count} items</span>
                                                            )}
                                                        </div>
                                                        {itemCols.map(col => (
                                                            <div key={col.id} className="gh-summary" style={{ width: `${col.width || 150}px` }}>
                                                                <SummaryCell col={col} agg={vItem.data.aggregates?.[col.id]} totalCount={vItem.data.count || 0} color={vItem.groupColor} />
                                                            </div>
                                                        ))}
                                                        <div style={{ width: '50px', flexShrink: 0 }} />
                                                    </div>
                                                ) : vItem.type === 'subitem-header' ? (
                                                    // The sub-items' own header: their columns, editable like the
                                                    // main one. Previously this re-drew the item columns with a
                                                    // hard-coded title mapping to fake different labels.
                                                    <Header scope="subitem" columns={subColsFor(vItem.columnGroupId)} groupId={vItem.columnGroupId} groupColor={vItem.groupColor} />
                                                ) : vItem.type === 'subitem-summary' ? (
                                                    // Totals for this parent's sub-items, over the sub-item columns.
                                                    <div className="table-row subitem-summary" style={{ display: 'flex', height: '100%', position: 'relative', alignItems: 'center' }}>
                                                        <div className="sticky-col" style={{
                                                            width: `${itemColumnWidth}px`,
                                                            position: 'sticky',
                                                            left: 0,
                                                            zIndex: 55,
                                                            backgroundColor: 'hsl(var(--paper, var(--color-bg-canvas)))',
                                                            flexShrink: 0,
                                                            height: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'flex-end',
                                                            paddingRight: '12px',
                                                            boxSizing: 'border-box',
                                                            fontSize: '11px',
                                                            color: 'hsl(var(--color-text-tertiary))'
                                                        }}>
                                                            {vItem.data.count} {vItem.data.count === 1 ? 'subitem' : 'subitems'}
                                                        </div>
                                                        <div style={{
                                                            display: 'flex',
                                                            height: '32px',
                                                            width: `${widthOf(subColsFor(vItem.columnGroupId))}px`,
                                                            flexShrink: 0,
                                                            boxSizing: 'border-box',
                                                            overflow: 'hidden',
                                                            borderRadius: '999px',
                                                            backgroundColor: 'hsl(var(--color-text-primary) / 0.04)'
                                                        }}>
                                                            {subColsFor(vItem.columnGroupId).map((col) => (
                                                                <div key={col.id} style={{
                                                                    width: `${col.width || 150}px`,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    padding: '0 8px',
                                                                    height: '100%',
                                                                    boxSizing: 'border-box',
                                                                    flexShrink: 0,
                                                                    fontSize: '12px'
                                                                }}>
                                                                    <SummaryCell col={col} agg={vItem.data.aggregates?.[col.id]} totalCount={vItem.data.count || 0} color={vItem.groupColor} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : vItem.type === 'subitem-footer' ? (
                                                    <div className="table-row subitem-footer" style={{
                                                        height: '100%',
                                                        display: 'flex',
                                                        paddingLeft: 0,
                                                        backgroundColor: 'transparent',
                                                        position: 'relative',
                                                        alignItems: 'center'
                                                    }}>
                                                        {/* Typed straight in, like "+ Add Item" under a group: click, type the
                                                            name, Enter. It used to create a sub-item called "New Sub-item"
                                                            that then had to be renamed. The box stays focused after Enter so
                                                            several can be added in a row; Escape leaves it. */}
                                                        <div className="sticky-col" style={{
                                                            width: `${itemColumnWidth}px`,
                                                            position: 'sticky',
                                                            left: 0,
                                                            zIndex: 55,
                                                            backgroundColor: 'hsl(var(--paper, var(--color-bg-canvas)))',
                                                            flexShrink: 0,
                                                            height: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            boxSizing: 'border-box'
                                                        }}>
                                                            {can('edit_items') && (
                                                                <input
                                                                    type="text"
                                                                    placeholder="+ Add subitem"
                                                                    className="cell-input"
                                                                    onKeyDown={(e) => {
                                                                        const input = e.currentTarget;
                                                                        if (e.key === 'Enter') {
                                                                            const title = input.value.trim();
                                                                            if (!title) return;
                                                                            useBoardStore.getState().addItem(title, vItem.data.groupId, vItem.data.parentId);
                                                                            input.value = '';
                                                                        } else if (e.key === 'Escape') {
                                                                            input.value = '';
                                                                            input.blur();
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        fontSize: '13px',
                                                                        color: 'hsl(var(--color-text-primary))',
                                                                        background: 'transparent',
                                                                        border: 'none',
                                                                        outline: 'none',
                                                                        height: '28px',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        marginLeft: '106px', // Lines up with a sub-item's title in Row.tsx
                                                                        width: `${Math.max(160, itemColumnWidth - 106 - 16)}px`
                                                                    }}
                                                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                                                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Row
                                                        item={vItem.data as any}
                                                        columns={vItem.type === 'subitem' ? subColsFor(vItem.columnGroupId) : itemCols}
                                                        groupColor={vItem.groupColor}
                                                        itemColumnWidth={itemColumnWidth}
                                                        dragHandleProps={listeners}
                                                        isSubItem={vItem.type === 'subitem'}
                                                        isExpanded={(board.expandedItemIds || []).includes(vItem.id)}
                                                        onToggleExpand={() => useBoardStore.getState().toggleItemExpansion(board.id, vItem.id)}
                                                    />
                                                )}
                                            </motion.div>
                                        )}
                                    </SortableItemWrapper>
                                </div>
                            );
                        })}
                    </SortableContext>
                </div>

                {/* Drag Overlay */}
                {createPortal(
                    <DragOverlay dropAnimation={{
                        sideEffects: defaultDropAnimationSideEffects({
                            styles: {
                                active: { opacity: '0.3' },
                            },
                        }),
                    }}>
                        {activeItem && (
                            <div style={{
                                height: '40px',
                                background: 'hsl(var(--paper, var(--color-bg-surface)))',
                                border: '1px solid hsl(var(--color-brand-primary) / 0.35)',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '14px',
                                boxShadow: '0 16px 32px -14px rgba(21, 42, 0, 0.45)'
                            }}>
                                <span style={{ fontWeight: 600 }}>{activeItem.title}</span>
                            </div>
                        )}
                    </DragOverlay>,
                    document.body
                )}

                {/* As wide as the table so the button, pinned to the left edge, can
                    follow a sideways scroll all the way across. */}
                <div style={{
                    paddingTop: `${GROUP_GAP}px`,
                    paddingBottom: '40px',
                    display: 'flex',
                    justifyContent: 'flex-start',
                    width: `${totalWidth}px`
                }}>
                    {can('group_ungroup') && (
                        <button
                            className="new-group-btn glass-chip"
                            style={{ position: 'sticky', left: 0 }}
                            onClick={() => {
                                useBoardStore.getState().addGroup("New group");
                            }}
                        >
                            <Plus size={16} />
                            <span>New group</span>
                        </button>
                    )}
                </div>
            </div>
            </div>
        </DndContext>
    );
};
