import { Trash2, Copy, Eye, EyeOff, LayoutDashboard, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const WRITE_ROLES = ['member', 'editor', 'admin', 'owner'];

export const BatchActionsBar = () => {
    const selectedItemIds = useBoardStore(state => state.selectedItemIds);
    const clearSelection = useBoardStore(state => state.clearSelection);
    const deleteSelectedItems = useBoardStore(state => state.deleteSelectedItems);
    const duplicateSelectedItems = useBoardStore(state => state.duplicateSelectedItems);
    const hideSelectedItems = useBoardStore(state => state.hideSelectedItems);
    const unhideSelectedItems = useBoardStore(state => state.unhideSelectedItems);
    const moveSelectedItemsToTarget = useBoardStore(state => state.moveSelectedItemsToTarget);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const workspaces = useBoardStore(state => state.workspaces);
    const userBoardRoles = useBoardStore(state => state.userBoardRoles);
    const userWorkspaceRoles = useBoardStore(state => state.userWorkspaceRoles);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    const { user } = useAuth();

    const [showMoveMenu, setShowMoveMenu] = useState(false);
    const [expandedBoards, setExpandedBoards] = useState<Record<string, boolean>>({});

    const handleCloseMoveMenu = () => {
        setShowMoveMenu(false);
        setExpandedBoards({});
    };

    const handleToggleBoard = (boardId: string, isDataLoaded: boolean) => {
        if (!expandedBoards[boardId] && !isDataLoaded) {
            loadBoardData(boardId);
        }
        setExpandedBoards(prev => ({ ...prev, [boardId]: !prev[boardId] }));
    };

    // Boards the user can write to. A deleted board is archived, not removed,
    // so it stays in this list unless excluded explicitly — leaving it in would
    // let a moved/copied item land in a board nobody can see anymore.
    const editableBoards = boards.filter(b => {
        if (b.is_archived) return false;
        const boardRole = userBoardRoles[b.id];
        if (boardRole && WRITE_ROLES.includes(boardRole)) return true;
        const ws = workspaces.find(w => w.id === b.workspaceId);
        if (ws?.owner_id === user?.id) return true;
        const wsRole = userWorkspaceRoles[b.workspaceId || ''];
        return wsRole && WRITE_ROLES.includes(wsRole);
    });

    // Group by workspace
    const boardsByWorkspace = workspaces
        .map(ws => ({
            workspace: ws,
            boards: editableBoards.filter(b => b.workspaceId === ws.id)
        }))
        .filter(ws => ws.boards.length > 0);

    if (selectedItemIds.length === 0) return null;

    return (
        <div
            className="glass-pop"
            style={{
                position: 'fixed',
                bottom: '28px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderRadius: '999px',
                padding: '6px 14px 6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                zIndex: 1000,
                minWidth: '520px',
                justifyContent: 'space-between'
            }}
        >
            {/* Left: Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                    backgroundColor: 'hsl(var(--color-brand-primary))',
                    color: '#FFEFD2',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums'
                }}>
                    {selectedItemIds.length}
                </div>
                <span style={{ fontFamily: 'var(--font-family-display)', fontWeight: 600, fontSize: '15px', color: 'hsl(var(--color-text-primary))' }}>
                    {selectedItemIds.length === 1 ? 'Task selected' : 'Tasks selected'}
                </span>
            </div>

            {/* Center: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                    className="batch-action-btn"
                    onClick={() => duplicateSelectedItems()}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px' }}
                >
                    <Copy size={14} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'hsl(var(--color-text-secondary))' }}>Duplicate</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={() => showHiddenItems ? unhideSelectedItems() : hideSelectedItems()}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px' }}
                >
                    {showHiddenItems
                        ? <Eye size={14} color="hsl(var(--color-text-secondary))" />
                        : <EyeOff size={14} color="hsl(var(--color-text-secondary))" />
                    }
                    <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'hsl(var(--color-text-secondary))' }}>{showHiddenItems ? 'Unhide' : 'Hide'}</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={deleteSelectedItems}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px' }}
                >
                    <Trash2 size={14} color="hsl(var(--color-danger))" />
                    <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'hsl(var(--color-danger))' }}>Delete</span>
                </div>

                {/* Move to — with cross-workspace menu */}
                <div
                    className="batch-action-btn"
                    onClick={() => setShowMoveMenu(prev => !prev)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '999px', position: 'relative' }}
                >
                    <LayoutDashboard size={14} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'hsl(var(--color-text-secondary))' }}>Move to</span>

                    {showMoveMenu && (
                        <div
                            className="glass-pop"
                            style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 12px)',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                borderRadius: '16px',
                                padding: '6px',
                                minWidth: '260px',
                                maxHeight: '380px',
                                overflowY: 'auto',
                                textAlign: 'left'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '6px 10px 4px', fontSize: '10px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                                Select Destination
                            </div>

                            {boardsByWorkspace.length === 0 && (
                                <div style={{ padding: '12px 10px', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>
                                    No accessible boards found.
                                </div>
                            )}

                            {boardsByWorkspace.map(({ workspace, boards: wsBoards }) => (
                                <div key={workspace.id}>
                                    {/* Workspace label */}
                                    <div style={{
                                        padding: '8px 10px 2px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        color: 'hsl(var(--color-text-tertiary))',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.12em'
                                    }}>
                                        {workspace.title}
                                    </div>

                                    {wsBoards.map(board => {
                                        const isExpanded = !!expandedBoards[board.id];
                                        const isCurrent = board.id === activeBoardId;
                                        return (
                                            <div key={board.id}>
                                                {/* Board row */}
                                                <div
                                                    className="move-menu-item"
                                                    onClick={() => handleToggleBoard(board.id, !!board.isDataLoaded)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '7px 10px',
                                                        cursor: 'pointer',
                                                        borderRadius: '8px',
                                                        fontSize: '13px',
                                                        color: isCurrent
                                                            ? 'hsl(var(--color-brand-primary))'
                                                            : 'hsl(var(--color-text-primary))'
                                                    }}
                                                >
                                                    <LayoutDashboard size={13} style={{ flexShrink: 0 }} />
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {board.title}
                                                        {isCurrent && <span style={{ fontSize: '11px', marginLeft: '4px', opacity: 0.6 }}>(current)</span>}
                                                    </span>
                                                    {isExpanded
                                                        ? <ChevronDown size={13} style={{ flexShrink: 0 }} />
                                                        : <ChevronRight size={13} style={{ flexShrink: 0 }} />
                                                    }
                                                </div>

                                                {/* Groups within board */}
                                                {isExpanded && (
                                                    board.isDataLoaded
                                                        ? board.groups.length > 0
                                                            ? board.groups.map(g => (
                                                                <div
                                                                    key={g.id}
                                                                    className="move-menu-item"
                                                                    onClick={() => {
                                                                        moveSelectedItemsToTarget(g.id, board.id);
                                                                        handleCloseMoveMenu();
                                                                    }}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        padding: '6px 10px 6px 30px',
                                                                        cursor: 'pointer',
                                                                        borderRadius: '8px',
                                                                        fontSize: '13px',
                                                                        color: 'hsl(var(--color-text-primary))'
                                                                    }}
                                                                >
                                                                    <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: g.color, flexShrink: 0 }} />
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                                                </div>
                                                            ))
                                                            : <div style={{ padding: '6px 10px 6px 30px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>No groups</div>
                                                        : <div style={{ padding: '6px 10px 6px 30px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Loading…</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Close */}
            <button
                onClick={clearSelection}
                style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%'
                }}
                className="batch-action-btn"
            >
                <X size={16} color="hsl(var(--color-text-secondary))" />
            </button>

            <style>{`
                .batch-action-btn:hover {
                    background-color: hsl(var(--color-text-primary) / 0.06);
                }
                .batch-action-btn:hover svg {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .batch-action-btn:hover span {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .move-menu-item:hover {
                    background-color: hsl(var(--color-text-primary) / 0.06);
                }
            `}</style>
        </div>
    );
};
