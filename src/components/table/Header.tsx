import React, { useMemo } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type PointerSensorOptions } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Column } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { AddColumnMenu } from './AddColumnMenu';
import { ColumnMenu } from './ColumnMenu';
import { FilterMenu } from './FilterMenu';
import { NumberFormatMenu } from './NumberFormatMenu';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NotificationSettingsModal } from '../notifications/NotificationSettingsModal';

// dnd-kit's PointerSensor activates on `pointerdown`, which fires *before* the
// `mousedown` that the resize handle listens on — so calling stopPropagation
// there came too late and dragging the 4px edge reordered the column instead of
// just resizing it. Filter the event at the sensor instead: a pointerdown that
// starts inside anything marked `data-no-dnd` never begins a column drag.
class ColumnPointerSensor extends PointerSensor {
    static activators = [
        {
            eventName: 'onPointerDown' as const,
            handler: ({ nativeEvent: event }: React.PointerEvent, { onActivation }: PointerSensorOptions) => {
                if (!event.isPrimary || event.button !== 0) return false;

                let node = event.target as HTMLElement | null;
                while (node) {
                    if (node.hasAttribute?.('data-no-dnd')) return false;
                    node = node.parentElement;
                }

                onActivation?.({ event });
                return true;
            },
        },
    ];
}

// Sortable Header Cell Component
const SortableHeaderCell = ({
    col,
    canManage,
    editingColId,
    activeMenuColId,
    activeSort,
    activeFilters,
    startEditing,
    openMenu,
    handleResizeStart,
    handleAutoFit,
    editValue,
    setEditValue,
    saveTitle,
    handleKeyDown
}: any) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: col.id, disabled: editingColId === col.id || !canManage });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: `${col.width || 150}px`,
        position: 'relative' as const,
        cursor: (editingColId === col.id || !canManage) ? 'default' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        backgroundColor: isDragging ? 'hsl(var(--color-bg-subtle))' : 'transparent'
    };

    return (
        <div
            ref={setNodeRef}
            data-col-id={col.id}
            style={style}
            {...attributes}
            {...listeners}
            className="table-cell table-header-cell"
        >
            {editingColId === col.id ? (
                <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={handleKeyDown}
                    className="cell-input"
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ fontWeight: 500 }}
                />
            ) : (
                <span
                    onDoubleClick={() => {
                        if (canManage) startEditing(col);
                    }}
                    title={canManage ? "Double click to rename" : "Read only"}
                    style={{ cursor: canManage ? 'text' : 'default', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {col.title}
                </span>
            )}

            {activeSort?.columnId === col.id && (
                <div style={{ marginRight: '4px', color: 'hsl(var(--color-brand-primary))', fontSize: '10px' }}>
                    {activeSort.direction === 'asc' ? '▲' : '▼'}
                </div>
            )}

            {activeFilters.some((f: any) => f.columnId === col.id) && (
                <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'hsl(var(--color-brand-primary))',
                    marginRight: 4
                }} />
            )}

            {editingColId !== col.id && (
                <button
                    data-no-dnd="true"
                    onClick={(e) => openMenu(e, col.id)}
                    className="icon-btn"
                    // Nudged off the column's right edge so it doesn't sit under the
                    // 4px resize handle — clicks there were grabbing the resize drag
                    // instead of opening this menu.
                    style={{ opacity: activeMenuColId === col.id ? 1 : 0.5, marginRight: '6px' }}
                    title="Column Actions"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <MoreHorizontal size={16} />
                </button>
            )}

            {canManage && (
                <div
                    data-no-dnd="true"
                    // The column drag starts on pointerdown, which fires before the
                    // mousedown below — so the drag has to be stopped here, not there.
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => handleResizeStart(e, col.id, col.width || 150)}
                    onDoubleClick={(e) => handleAutoFit(e, col.id)}
                    title="Drag to resize · double-click to fit content"
                    style={{
                        position: 'absolute',
                        // Straddles the divider instead of sitting inside the cell:
                        // grabbing a hair past the line used to land on the next
                        // header cell and start a column drag instead of a resize.
                        right: '-4px',
                        top: 0,
                        bottom: 0,
                        width: '9px',
                        cursor: 'col-resize',
                        zIndex: 20,
                        touchAction: 'none',
                    }}
                    className="resize-handle"
                />
            )}
        </div>
    );
};

/**
 * The column header row. `scope` says which rows it heads: the main header
 * (default) for top-level items, 'subitem' for the header above a parent's
 * sub-items, where `groupId` is the group whose sub-item columns they are.
 * `columns` is that one set. Adding, moving, renaming and deleting all act on
 * this set alone: items and sub-items never share a column, and neither do the
 * sub-items of different groups.
 */
export const Header = ({ columns, groupId, scope = 'item' }: { columns: Column[], groupColor?: string, groupId?: string, scope?: 'item' | 'subitem' }) => {
    const addColumn = useBoardStore(state => state.addColumn);
    const deleteColumn = useBoardStore(state => state.deleteColumn);
    const updateColumnTitle = useBoardStore(state => state.updateColumnTitle);
    const moveColumn = useBoardStore(state => state.moveColumn);
    const duplicateColumn = useBoardStore(state => state.duplicateColumn);
    const { can } = usePermission();

    const setColumnSort = useBoardStore(state => state.setColumnSort);
    const setColumnFilter = useBoardStore(state => state.setColumnFilter);
    const setColumnNumberFormat = useBoardStore(state => state.setColumnNumberFormat);
    const setColumnAlignment = useBoardStore(state => state.setColumnAlignment);

    const activeBoard = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const activeSort = activeBoard?.sort;
    const items = activeBoard?.items || [];
    const activeFilters = activeBoard?.filters || [];

    const [editingColId, setEditingColId] = React.useState<string | null>(null);
    const [editValue, setEditValue] = React.useState('');

    const [activeMenuColId, setActiveMenuColId] = React.useState<string | null>(null);
    const [activeFilterColId, setActiveFilterColId] = React.useState<string | null>(null);
    const [activeNumberFormatColId, setActiveNumberFormatColId] = React.useState<string | null>(null);
    const [showNotificationSettings, setShowNotificationSettings] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{ top: number, left: number } | null>(null);
    const [confirmDeleteColId, setConfirmDeleteColId] = React.useState<string | null>(null);
    const [showAddMenu, setShowAddMenu] = React.useState(false);
    const addBtnRef = React.useRef<HTMLButtonElement>(null);

    const [insertColIndex, setInsertColIndex] = React.useState<number | null>(null);
    const [addMenuPos, setAddMenuPos] = React.useState<{ top: number, bottom: number, left: number } | null>(null);

    const sensors = useSensors(
        useSensor(ColumnPointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        if (isResizingRef.current) return;

        const { active, over } = event;
        if (over && active.id !== over.id) {
            moveColumn(String(active.id), String(over.id));
        }
    };

    const startEditing = (col: Column) => {
        setEditingColId(col.id);
        setEditValue(col.title);
    };

    const saveTitle = () => {
        if (editingColId && editValue.trim()) {
            updateColumnTitle(editingColId, editValue.trim());
        }
        setEditingColId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveTitle();
        if (e.key === 'Escape') setEditingColId(null);
    };

    const handleAddColumn = (type: any) => {
        const typeMap: Record<string, string> = {
            'text': 'Text',
            'status': 'Status',
            'date': 'Date',
            'due_date': 'Due Date',
            'number': 'Numbers',
            'people': 'Person',
            'checkbox': 'Check',
            'timeline': 'Timeline',
            'files': 'Files',
            'link': 'Link',
            'dropdown': 'Dropdown',
            'priority': 'Priority'
        };
        const newTitle = typeMap[type] || "New Column";
        addColumn(newTitle, type, insertColIndex !== null ? insertColIndex : undefined, scope, scope === 'subitem' ? groupId : undefined);
        setShowAddMenu(false);
        setInsertColIndex(null);
        setAddMenuPos(null);
    };

    const updateBoardItemColumnTitle = useBoardStore(state => state.updateBoardItemColumnTitle);
    const updateBoardItemColumnWidth = useBoardStore(state => state.updateBoardItemColumnWidth);

    const itemColumnTitle = useBoardStore(state => {
        const board = state.boards.find(b => b.id === state.activeBoardId);
        return board?.itemColumnTitle || 'Item';
    });
    const itemColumnWidth = useBoardStore(state => {
        const board = state.boards.find(b => b.id === state.activeBoardId);
        return board?.itemColumnWidth || 350;
    });

    const [isEditingItemCol, setIsEditingItemCol] = React.useState(false);
    const [itemColValue, setItemColValue] = React.useState(itemColumnTitle);

    React.useEffect(() => {
        setItemColValue(itemColumnTitle);
    }, [itemColumnTitle]);

    const saveItemColTitle = () => {
        if (itemColValue.trim()) {
            updateBoardItemColumnTitle(itemColValue.trim());
        }
        setIsEditingItemCol(false);
    };

    const updateColumnWidth = useBoardStore(state => state.updateColumnWidth);
    const persistColumnWidth = useBoardStore(state => state.persistColumnWidth);
    const startXRef = React.useRef(0);
    const startWidthRef = React.useRef(0);
    // Set for the whole life of a resize drag. Even if something manages to start
    // a column drag underneath one, the reorder is refused rather than committed.
    const isResizingRef = React.useRef(false);

    const handleResizeStart = (e: React.MouseEvent, colId: string, currentWidth: number, isItemCol = false) => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = currentWidth;
        let latestWidth = currentWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const diff = moveEvent.clientX - startXRef.current;
            const newWidth = Math.max(100, startWidthRef.current + diff);
            latestWidth = newWidth;
            if (isItemCol) {
                updateBoardItemColumnWidth(newWidth);
            } else {
                updateColumnWidth(colId, newWidth);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // pointerup (and so dnd-kit's drag end) lands before this mouseup, so
            // the flag has to outlive the current event loop turn to cover it.
            setTimeout(() => { isResizingRef.current = false; }, 0);
            // Persist once on release rather than on every mousemove, so the
            // width the user settled on survives a reload without spamming
            // the DB mid-drag.
            if (!isItemCol && latestWidth !== startWidthRef.current) {
                persistColumnWidth(colId, latestWidth);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Double-clicking the resize handle sizes the column to its widest content,
    // the way a spreadsheet does. Cell contents vary far too much by column type
    // (status pills, avatars, file chips, wrapped text) to compute a width from
    // the data, so this measures the real DOM instead: every cell of the column
    // is briefly switched to `max-content`, the widest one wins, then the
    // original inline widths are put back before the browser paints.
    const AUTOFIT_MIN = 100;
    const AUTOFIT_MAX = 600;
    const AUTOFIT_PADDING = 24;

    const handleAutoFit = (e: React.MouseEvent, colId: string, isItemCol = false) => {
        e.preventDefault();
        e.stopPropagation();

        const selector = isItemCol ? '[data-item-col="true"]' : `[data-col-id="${colId}"]`;
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
        if (nodes.length === 0) return;

        const saved = nodes.map(n => ({ width: n.style.width, flexShrink: n.style.flexShrink }));
        nodes.forEach(n => {
            n.style.width = 'max-content';
            n.style.flexShrink = '0'; // otherwise flex would shrink it right back
        });

        // offsetWidth, not scrollWidth: box-sizing is border-box app-wide, so the
        // border-box width read here is exactly what can be written back as `width`.
        let widest = 0;
        nodes.forEach(n => { widest = Math.max(widest, n.offsetWidth); });

        nodes.forEach((n, i) => {
            n.style.width = saved[i].width;
            n.style.flexShrink = saved[i].flexShrink;
        });

        const nextWidth = Math.min(AUTOFIT_MAX, Math.max(AUTOFIT_MIN, Math.ceil(widest) + AUTOFIT_PADDING));

        if (isItemCol) {
            updateBoardItemColumnWidth(nextWidth);
        } else {
            updateColumnWidth(colId, nextWidth);
            persistColumnWidth(colId, nextWidth);
        }
    };

    const openMenu = (e: React.MouseEvent, colId: string) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, left: rect.left });
        setActiveMenuColId(colId);
    };

    const activeMenuColumn = activeMenuColId ? columns.find(c => c.id === activeMenuColId) : null;
    const activeFilterColumn = activeFilterColId ? columns.find(c => c.id === activeFilterColId) : null;
    const activeNumberFormatColumn = activeNumberFormatColId ? columns.find(c => c.id === activeNumberFormatColId) : null;

    const filterOptions = useMemo(() => {
        if (!activeFilterColumn) return [];
        if (activeFilterColumn.type === 'status' || activeFilterColumn.type === 'dropdown') {
            return (activeFilterColumn.options || []).map((opt: any) => ({ ...opt, id: opt.label }));
        }
        if (activeFilterColumn.type === 'checkbox') {
            return [{ id: 'true', label: 'Checked', color: '#3F7D32' }, { id: 'false', label: 'Unchecked', color: '#B33F2E' }];
        }
        const values = new Set<string>();
        items.forEach(i => {
            const val = i.values[activeFilterColumn.id];
            if (val) values.add(String(val));
        });
        return Array.from(values).sort().map(v => ({ id: v, label: v }));
    }, [activeFilterColumn, items]);

    const activeFilterValues = useMemo(() => {
        if (!activeFilterColumn) return [];
        const filter = activeFilters.find(f => f.columnId === activeFilterColumn.id);
        return filter?.values || [];
    }, [activeFilters, activeFilterColumn]);

    // Every sub-item header is live; of the group headers only the first is.
    const isFirstGroup = scope === 'subitem' || !groupId || (activeBoard?.groups[0]?.id === groupId);
    const isSubitemHeader = scope === 'subitem';

    const content = (
        <div className="table-header-row" style={{
            position: 'relative',
            display: 'flex',
            backgroundColor: 'hsl(var(--color-table-header-bg))',
            borderBottom: '1px solid hsl(var(--color-border))',
            boxSizing: 'border-box',
            height: '34px',
            alignItems: 'center'
        }}>
            <div className="table-cell table-header-cell sticky-col" data-item-col="true" style={{
                width: `${itemColumnWidth}px`,
                position: 'sticky', left: 0, zIndex: 60,
                backgroundColor: 'hsl(var(--color-table-header-bg))',
                borderRight: 'none',
                paddingLeft: isSubitemHeader ? '80px' : '14px',
                display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: 'none',
                fontSize: '13px'
            }}>
                {isSubitemHeader ? (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Subitem</span>
                ) : isEditingItemCol ? (
                    <input
                        autoFocus
                        value={itemColValue}
                        onChange={(e) => setItemColValue(e.target.value)}
                        onBlur={saveItemColTitle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') saveItemColTitle();
                            if (e.key === 'Escape') { setItemColValue(itemColumnTitle); setIsEditingItemCol(false); }
                        }}
                        className="cell-input"
                        style={{ fontWeight: 500, padding: 0 }}
                    />
                ) : (
                    <span
                        onDoubleClick={() => setIsEditingItemCol(true)}
                        title="Double click to rename"
                        style={{ cursor: 'text', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {itemColumnTitle}
                    </span>
                )}

                {can('manage_columns') && isFirstGroup && (
                    <div
                        data-no-dnd="true"
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => handleResizeStart(e, 'item-col', itemColumnWidth, true)}
                        onDoubleClick={(e) => handleAutoFit(e, 'item-col', true)}
                        title="Drag to resize · double-click to fit content"
                        style={{ position: 'absolute', right: '-4px', top: 0, bottom: 0, width: '9px', cursor: 'col-resize', zIndex: 20, touchAction: 'none' }}
                        className="resize-handle"
                    />
                )}
            </div>

            {isFirstGroup ? (
                <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    {columns.map((col) => (
                        <SortableHeaderCell
                            key={col.id}
                            col={col}
                            canManage={can('manage_columns')}
                            editingColId={editingColId}
                            activeMenuColId={activeMenuColId}
                            activeSort={activeSort}
                            activeFilters={activeFilters}
                            startEditing={startEditing}
                            openMenu={openMenu}
                            handleResizeStart={handleResizeStart}
                            handleAutoFit={handleAutoFit}
                            editValue={editValue}
                            setEditValue={setEditValue}
                            saveTitle={saveTitle}
                            handleKeyDown={handleKeyDown}
                        />
                    ))}
                </SortableContext>
            ) : (
                columns.map((col) => (
                    <div
                        key={col.id}
                        style={{ width: `${col.width || 150}px` }}
                        className="table-cell table-header-cell"
                    >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {col.title}
                        </span>
                    </div>
                ))
            )}

            {can('manage_columns') && isFirstGroup && (
                <div className="table-cell table-header-cell" style={{ width: '50px', justifyContent: 'center', padding: 0, position: 'relative' }}>
                    <button
                        ref={addBtnRef}
                        className="icon-btn"
                        onClick={() => {
                            setShowAddMenu(true);
                            setInsertColIndex(null);
                            setAddMenuPos(null);
                        }}
                        title="Add Column"
                        style={{ width: '100%', height: '100%', borderRadius: 0 }}
                    >
                        <Plus size={16} style={{ marginLeft: '6px' }} />
                    </button>
                </div>
            )}
        </div>
    );

    if (isFirstGroup) {
        return (
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                {content}
                
                {activeMenuColId && menuPos && activeMenuColumn && (
                    <ColumnMenu
                        isOpen={true}
                        onClose={() => setActiveMenuColId(null)}
                        position={menuPos}
                        columnType={activeMenuColumn.type}
                        currentSort={activeSort?.columnId === activeMenuColId ? activeSort.direction : null}
                        onSort={(dir) => setColumnSort(activeMenuColId!, dir)}
                        onFilter={() => {
                            setActiveFilterColId(activeMenuColId);
                            setActiveMenuColId(null);
                        }}
                        onDuplicate={() => duplicateColumn(activeMenuColId!)}
                        onAddRight={() => {
                            // A position in this header's own set, which is what addColumn takes.
                            const at = columns.findIndex(c => c.id === activeMenuColId);
                            setInsertColIndex(at === -1 ? null : at + 1);
                            setAddMenuPos({ top: menuPos.top, bottom: menuPos.top, left: menuPos.left });
                            setShowAddMenu(true);
                            setActiveMenuColId(null);
                        }}
                        onRename={() => startEditing(activeMenuColumn)}
                        onDelete={() => setConfirmDeleteColId(activeMenuColId!)}
                        onNumberFormat={() => {
                            setActiveNumberFormatColId(activeMenuColId);
                            setActiveMenuColId(null);
                        }}
                        onNotificationSettings={() => {
                            setShowNotificationSettings(true);
                            setActiveMenuColId(null);
                        }}
                    />
                )}

                {showNotificationSettings && (
                    <NotificationSettingsModal onClose={() => setShowNotificationSettings(false)} />
                )}

                {activeNumberFormatColId && menuPos && activeNumberFormatColumn && (
                    <NumberFormatMenu
                        isOpen={true}
                        onClose={() => setActiveNumberFormatColId(null)}
                        position={menuPos}
                        column={activeNumberFormatColumn}
                        onSetFormat={(format, currencyCode) => setColumnNumberFormat(activeNumberFormatColId, format, currencyCode)}
                        onSetAlign={(align) => setColumnAlignment(activeNumberFormatColId, align)}
                    />
                )}

                {activeFilterColId && menuPos && activeFilterColumn && (
                    <FilterMenu
                        isOpen={true}
                        onClose={() => setActiveFilterColId(null)}
                        position={menuPos}
                        options={filterOptions}
                        selectedValues={activeFilterValues}
                        onFilterChange={(values) => setColumnFilter(activeFilterColId, values)}
                        title={activeFilterColumn.title}
                    />
                )}

                {showAddMenu && (
                    <AddColumnMenu
                        onSelect={handleAddColumn}
                        onClose={() => {
                            setShowAddMenu(false);
                            setInsertColIndex(null);
                            setAddMenuPos(null);
                        }}
                        position={addMenuPos || (addBtnRef.current ? {
                            top: addBtnRef.current.getBoundingClientRect().top,
                            bottom: addBtnRef.current.getBoundingClientRect().bottom,
                            left: addBtnRef.current.getBoundingClientRect().left
                        } : { top: 0, bottom: 0, left: 0 })}
                    />
                )}

                <ConfirmModal
                    isOpen={!!confirmDeleteColId}
                    title="Delete Column"
                    message={scope === 'subitem'
                        ? "Delete this column from this group's subitems? Items, and subitems in other groups, are not affected."
                        : 'Are you sure you want to delete this column?'}
                    onConfirm={() => {
                        if (confirmDeleteColId) deleteColumn(confirmDeleteColId);
                        setConfirmDeleteColId(null);
                    }}
                    onCancel={() => setConfirmDeleteColId(null)}
                    confirmText="Delete Column"
                />
            </DndContext>
        );
    }

    return content;
};
