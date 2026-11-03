import React, { useRef, useEffect } from 'react';
import type { Item, Column } from '../../types';
import { Cell } from './Cell';
import { GripVertical, MessageSquare, ChevronRight, ChevronDown } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { useBoardStore } from '../../store/useBoardStore';
import { itemUpdateSummary } from '../../lib/utils';
import { Check } from 'lucide-react';

const CheckboxState = ({ itemId }: { itemId: string }) => {
    const isSelected = useBoardStore(state => state.selectedItemIds.includes(itemId));

    return (
        <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: isSelected ? 'hsl(var(--color-brand-primary))' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '2px' // Inner radius
        }}>
            {isSelected && <Check size={12} color="#FFEFD2" strokeWidth={3} />}
        </div>
    );
};

export const Row = React.memo(({
    item,
    columns,
    groupColor,
    itemColumnWidth = 370,
    dragHandleProps,
    isSubItem,
    isExpanded,
    onToggleExpand
}: {
    item: Item,
    columns: Column[],
    groupColor?: string,
    itemColumnWidth?: number,
    dragHandleProps?: any,
    isSubItem?: boolean,
    isExpanded?: boolean,
    onToggleExpand?: () => void
}) => {
    const { can } = usePermission();
    const rowRef = useRef<HTMLDivElement>(null);
    const highlightedItemId = useBoardStore(state => state.highlightedItemId);
    const hasSubItems = useBoardStore(state => {
        const board = state.boards.find(b => b.id === item.boardId);
        return board ? board.items.some(i => i.parentId === item.id && !i.isHidden) : false;
    });
    // Local state for flash animation - Disabled for now as per user request
    // const [isFlashing, setIsFlashing] = useState(false);

    useEffect(() => {
        if (highlightedItemId === item.id && rowRef.current) {
            rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // setIsFlashing(true); // Disabled highlight visuals

            // Clear highlights immediately after scroll action is acknowledged
            const timer = setTimeout(() => {
                // setIsFlashing(false);
                useBoardStore.getState().setHighlightedItem(null);
            }, 1000); // 1s reset
            return () => clearTimeout(timer);
        }
    }, [highlightedItemId, item.id]);

    const isSelected = useBoardStore(state => state.selectedItemIds.includes(item.id));
    // const isHighlighted = highlightedItemId === item.id; // Disabled

    const updateSummary = itemUpdateSummary(item);

    return (
        <div ref={rowRef} className={`table-row ${isSelected ? 'selected' : ''}`} style={{
            height: '100%',
            boxSizing: 'border-box',
            position: 'relative',
            display: 'flex',
            opacity: item.isHidden ? 0.5 : 1,
            backgroundColor: isSelected
                ? 'hsl(var(--color-brand-primary) / 0.06)'
                : 'transparent',
            transition: 'background-color 0.3s ease'
        }}>
            {/* Frozen First Column: Item Name */}
            <div className="table-cell sticky-col" data-item-col="true" style={{
                width: `${itemColumnWidth}px`,
                position: 'sticky', left: 0, zIndex: 70,
                backgroundColor: 'hsl(var(--paper, var(--color-bg-canvas)))',
                borderRight: 'none',
                paddingLeft: isSubItem ? '80px' : '14px',
                display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: 'none'
            }}>
                {/* Drag Handle (Visible on Hover via CSS) */}
                {can('edit_items') && (
                    <div
                        {...dragHandleProps}
                        className="drag-handle"
                        style={{
                            cursor: 'grab',
                            color: 'hsl(var(--color-text-tertiary))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0, // Hidden by default, shown on hover via CSS
                            transition: 'opacity 0.2s',
                            width: '16px',
                            marginLeft: '-4px' // Pull slightly left to align with group border area
                        }}
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                {/* Row Checkbox */}
                <div
                    className="row-checkbox"
                    // Shift-click would otherwise also select the text between the two rows
                    onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
                    onClick={(e) => {
                        e.stopPropagation();
                        const shift = e.shiftKey;
                        import('../../store/useBoardStore').then(({ useBoardStore }) => {
                            if (shift) {
                                window.getSelection()?.removeAllRanges();
                                useBoardStore.getState().selectItemRange(item.id);
                                return;
                            }
                            const isSelected = useBoardStore.getState().selectedItemIds.includes(item.id);
                            useBoardStore.getState().toggleItemSelection(item.id, !isSelected);
                        });
                    }}
                    style={{
                        width: '16px',
                        height: '16px',
                        border: '1.5px solid hsl(var(--color-border-strong))',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: '4px' // Space from drag handle
                    }}
                >
                    <CheckboxState itemId={item.id} />
                </div>

                {/* Expand Chevron (Visible on hover if has subitems or when expanded) */}
                {!isSubItem && (
                    <div
                        className="expand-chevron"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand?.();
                        }}
                        style={{
                            cursor: 'pointer',
                            color: 'hsl(var(--color-text-tertiary))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: (isExpanded || hasSubItems) ? 1 : 0, // Show if has subitems or expanded. Will be shown on hover via CSS.
                            transition: 'opacity 0.2s, transform 0.2s, color 0.2s',
                            zIndex: 100,
                            width: '20px',
                            height: '36px',
                            marginLeft: '4px' // Space from checkbox
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'hsl(var(--color-brand-primary))'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))'; }}
                    >
                        {isExpanded ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
                    </div>
                )}

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        defaultValue={item.title}
                        readOnly={!can('edit_items')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.currentTarget.blur();
                            }
                        }}
                        style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            border: 'none',
                            background: 'transparent',
                            width: '100%',
                            fontSize: '13.5px',
                            color: isSubItem ? 'hsl(var(--color-text-secondary))' : 'inherit',
                            outline: 'none',
                            cursor: can('edit_items') ? 'text' : 'default',
                            pointerEvents: 'auto',
                            zIndex: 100,
                            position: 'relative'
                        }}
                        onFocus={(e) => {
                            if (can('edit_items')) {
                                e.currentTarget.parentElement!.style.backgroundColor = 'hsl(var(--color-bg-surface))';
                                e.currentTarget.style.paddingLeft = '4px';
                            }
                        }}
                        onBlur={(e) => {
                            // UI Cleanup
                            e.currentTarget.parentElement!.style.backgroundColor = 'transparent';
                            e.currentTarget.style.paddingLeft = '0';
                            
                            // Save Logic
                            if (!can('edit_items')) return;
                            const val = e.target.value.trim();
                            if (val && val !== item.title) {
                                import('../../store/useBoardStore').then(({ useBoardStore }) => {
                                    useBoardStore.getState().updateItemTitle(item.id, val, true);
                                });
                            } else {
                                // Reset if empty
                                e.target.value = item.title;
                            }
                        }}
                    />

                </div>

                {/* Updates: a count chip when the item has any (Narai Green if one is
                    recent), otherwise an icon that appears on hover. */}
                {(() => {
                    const recent = !!updateSummary.lastAt &&
                        (Date.now() - new Date(updateSummary.lastAt).getTime()) <= 14 * 24 * 60 * 60 * 1000;
                    const hasUpdates = updateSummary.count > 0;
                    return (
                        <button
                            className={`row-updates${hasUpdates ? ' has-updates' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                useBoardStore.getState().setActiveItem(item.id);
                            }}
                            title={hasUpdates ? `${updateSummary.count} update${updateSummary.count === 1 ? '' : 's'}` : 'Open item'}
                            aria-label={hasUpdates ? `Open ${updateSummary.count} updates` : 'Open item'}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                height: '24px',
                                padding: hasUpdates ? '0 8px' : '0 6px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                flexShrink: 0,
                                marginRight: '6px',
                                zIndex: 10,
                                color: hasUpdates && recent ? '#FFEFD2' : 'hsl(var(--color-text-secondary))',
                                backgroundColor: hasUpdates
                                    ? (recent ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-primary) / 0.07)')
                                    : 'transparent',
                                transition: 'background-color 0.15s, color 0.15s'
                            }}
                        >
                            <MessageSquare size={13} />
                            {hasUpdates && updateSummary.count}
                        </button>
                    );
                })()}


            </div>

            {
                columns.map((col) => (
                    <div key={col.id} data-col-id={col.id} className="table-col" style={{
                        width: `${col.width || 150}px`,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <Cell 
                            itemId={item.id} 
                            boardId={item.boardId}
                            column={col} 
                            value={item.values[col.id]}
                            groupColor={groupColor} 
                            isSubItem={isSubItem}
                        />
                    </div>
                ))
            }

            <div className="table-cell" style={{ width: '50px' }}></div>

            {/* Inline Style for Hover Effect (simpler than global CSS for now) */}
            <style>{`
                .table-row:hover .drag-handle {
                    opacity: 1 !important;
                }
                .table-row:hover .expand-chevron {
                    opacity: 1 !important;
                }
            `}</style>
        </div>
    );
});
