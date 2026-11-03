import { ChevronDown, ChevronRight, Trash2, GripVertical, Link2 } from 'lucide-react';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { ConfirmModal } from '../ui/ConfirmModal';
import { supabase } from '../../lib/supabase';
import { GROUP_COLORS, PALETTE_WIDTH, palettePosition } from '../../lib/labelColors';
import { SummaryCell } from './SummaryCell';
import type { Column } from '../../types';

export const GroupRow = ({
    data,
    groupColor,
    isCollapsed,
    onToggle,
    dragHandleProps,
    columns,
    itemColumnWidth
}: {
    data: any,
    groupColor?: string,
    isCollapsed: boolean,
    onToggle: () => void,
    dragHandleProps?: any,
    columns: Column[],
    itemColumnWidth: number
}) => {
    const updateGroupTitle = useBoardStore(state => state.updateGroupTitle);
    const deleteGroup = useBoardStore(state => state.deleteGroup);
    const updateGroupColor = useBoardStore(state => state.updateGroupColor);
    const unlinkGroup = useBoardStore(state => state.unlinkGroup);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(data.title);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLinkedDeleteBlocked, setShowLinkedDeleteBlocked] = useState(false);

    // Color Picker State
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorBtnRef = useRef<HTMLDivElement>(null);

    // Link Popover State
    const [showLinkPopover, setShowLinkPopover] = useState(false);
    const [linkedNames, setLinkedNames] = useState<{ workspaceTitle: string; boardTitle: string; groupTitle: string } | null>(null);
    const linkIconRef = useRef<HTMLDivElement>(null);

    const handleOpenLinkPopover = async () => {
        setShowLinkPopover(!showLinkPopover);
        if (!showLinkPopover && data.linkedBoardId && data.linkedGroupId && !linkedNames) {
            const [{ data: boardRow }, { data: groupRow }] = await Promise.all([
                supabase.from('boards').select('title, workspace_id').eq('id', data.linkedBoardId).single(),
                supabase.from('groups').select('title').eq('id', data.linkedGroupId).single()
            ]);
            const { data: workspaceRow } = boardRow?.workspace_id
                ? await supabase.from('workspaces').select('title').eq('id', boardRow.workspace_id).single()
                : { data: null };
            setLinkedNames({
                workspaceTitle: workspaceRow?.title || 'Unknown workspace',
                boardTitle: boardRow?.title || 'Unknown board',
                groupTitle: groupRow?.title || 'Unknown group'
            });
        }
    };

    const handleSave = () => {
        if (editValue.trim() && editValue !== data.title) {
            updateGroupTitle(data.id, editValue.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setEditValue(data.title);
            setIsEditing(false);
        }
    };

    const color = groupColor || data.color || '#2E7D8C';

    return (
        <div
            className={`gcard gcard-top${isCollapsed ? ' is-collapsed' : ''}`}
            style={{ display: 'flex', alignItems: 'center', height: '100%', position: 'relative', width: '100%', boxSizing: 'border-box' }}
        >
            {/* The group's identity: a colour dot, its name and how many items it holds,
                with the per-column roll-ups on the same line (aligned to the columns below). */}
            <div className="gh-sticky" style={{ width: `${itemColumnWidth}px` }}>
                {can('group_ungroup') && (
                    <div {...dragHandleProps} className="gh-drag" title="Drag to reorder group">
                        <GripVertical size={14} />
                    </div>
                )}

                <button
                    onClick={onToggle}
                    className="gh-chevron"
                    aria-label={isCollapsed ? `Expand ${data.title}` : `Collapse ${data.title}`}
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>

                <div
                    ref={colorBtnRef}
                    className="gh-dot"
                    role="button"
                    aria-label="Change group colour"
                    title={can('group_ungroup') ? 'Change group colour' : undefined}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (can('group_ungroup')) setShowColorPicker(!showColorPicker);
                    }}
                    style={{ backgroundColor: color, color }}
                />

                {showColorPicker && colorBtnRef.current && createPortal(
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                            onClick={() => setShowColorPicker(false)}
                        />
                        <div className="glass-pop" style={{
                            position: 'fixed',
                            // Ten to a row keeps 50 swatches to five rows; positioned through the
                            // shared helper so the grid can't run off the bottom or right edge.
                            ...palettePosition(colorBtnRef.current),
                            padding: '12px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(10, 1fr)',
                            gap: '4px',
                            zIndex: 9999,
                            width: `${PALETTE_WIDTH}px`,
                            boxSizing: 'border-box'
                        }}>
                            {GROUP_COLORS.map(c => (
                                <div
                                    key={c}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateGroupColor(data.id, c);
                                        setShowColorPicker(false);
                                    }}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        backgroundColor: c,
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        boxShadow: data.color === c ? '0 0 0 2px hsl(var(--paper, var(--color-bg-surface))), 0 0 0 3.5px hsl(var(--color-text-primary))' : 'none',
                                        transition: 'transform 0.1s'
                                    }}
                                    onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.12)'}
                                    onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                                />
                            ))}
                        </div>
                    </>,
                    document.body
                )}

                {isEditing ? (
                    <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        className="gh-title-input"
                    />
                ) : (
                    <span
                        className="gh-title"
                        style={{ cursor: can('group_ungroup') ? 'text' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                        onDoubleClick={() => {
                            if (can('group_ungroup')) setIsEditing(true);
                        }}
                        title={can('group_ungroup') ? 'Double-click to rename' : undefined}
                    >
                        {data.title}
                    </span>
                )}

                <span className="gh-count">{data.count}</span>

                {data.linkedGroupId && (
                    <div
                        ref={linkIconRef}
                        onClick={(e) => { e.stopPropagation(); handleOpenLinkPopover(); }}
                        className="gh-icon-btn"
                        style={{ cursor: 'pointer' }}
                        title="This group is linked"
                    >
                        <Link2 size={13} />
                    </div>
                )}

                {showLinkPopover && linkIconRef.current && createPortal(
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowLinkPopover(false)} />
                        <div className="glass-pop" style={{
                            position: 'fixed',
                            top: linkIconRef.current.getBoundingClientRect().bottom + 6,
                            left: linkIconRef.current.getBoundingClientRect().left,
                            padding: '14px',
                            zIndex: 9999,
                            width: '240px',
                            fontSize: '13px'
                        }}>
                            <div style={{ color: 'hsl(var(--color-text-secondary))', marginBottom: '10px' }}>
                                Linked to <br />
                                <strong style={{ color: 'hsl(var(--color-text-primary))' }}>{linkedNames ? `${linkedNames.workspaceTitle} / ${linkedNames.boardTitle} / ${linkedNames.groupTitle}` : 'Loading…'}</strong>
                            </div>
                            {can('group_ungroup') && (
                                <button
                                    onClick={() => { unlinkGroup(data.id); setShowLinkPopover(false); }}
                                    className="chip-toggle"
                                    style={{ color: 'hsl(var(--color-danger))' }}
                                >
                                    Unlink
                                </button>
                            )}
                        </div>
                    </>,
                    document.body
                )}

                {can('group_ungroup') && (
                    <div className="gh-actions">
                        <button
                            onClick={() => data.linkedGroupId ? setShowLinkedDeleteBlocked(true) : setShowDeleteConfirm(true)}
                            className="gh-icon-btn"
                            title={data.linkedGroupId ? 'Unlink before deleting' : 'Delete group'}
                            aria-label="Delete group"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Show per-column summaries in the group header only when the group is collapsed;
                when expanded, they sit on the footer row at the bottom of the group card. */}
            {isCollapsed && columns.map(col => (
                <div key={col.id} className="gh-summary" style={{ width: `${col.width || 150}px` }}>
                    <SummaryCell col={col} agg={data.aggregates?.[col.id]} totalCount={data.count || 0} color={color} />
                </div>
            ))}
            <div style={{ width: '50px', flexShrink: 0 }} />

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="Delete Group"
                message={`Are you sure you want to delete "${data.title}"? You can restore it (and its items) later from this board's Archive/Trash.`}
                confirmText="Delete"
                onConfirm={() => {
                    deleteGroup(data.id);
                    setShowDeleteConfirm(false);
                }}
                onCancel={() => setShowDeleteConfirm(false)}
            />

            <ConfirmModal
                isOpen={showLinkedDeleteBlocked}
                title="This Group is Linked"
                message={`"${data.title}" is linked to another group. Unlink it first, then you can delete it.`}
                confirmText="Unlink Now"
                onConfirm={() => {
                    unlinkGroup(data.id);
                    setShowLinkedDeleteBlocked(false);
                }}
                onCancel={() => setShowLinkedDeleteBlocked(false)}
            />
        </div>
    );
};
