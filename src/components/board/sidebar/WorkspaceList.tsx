import { useState, useEffect } from 'react';
import { LayoutDashboard, Plus, Trash2, Edit2, Copy, ChevronRight, Users, MoreHorizontal, Archive } from 'lucide-react';
import { clsx } from 'clsx';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';

import { useBoardStore } from '../../../store/useBoardStore';
import { useUserStore } from '../../../store/useUserStore';
import { useAccessibleWorkspaces } from '../../../hooks/useAccessibleWorkspaces';
import { showToast } from '../../../utils/toast';
import { ConfirmModal } from '../../ui/ConfirmModal';
import { PermissionDeniedModal } from '../../ui/PermissionDeniedModal';
import { ShareWorkspaceModal } from '../../workspace/ShareWorkspaceModal';
import { ShareBoardModal } from '../../workspace/ShareBoardModal';
import { ArchiveTrashModal } from '../../workspace/ArchiveTrashModal';
import { BoardArchiveTrashModal } from '../BoardArchiveTrashModal';
import { BoardIcon, WorkspaceIcon } from './SidebarIcons';
import { SortableBoardItem } from './SortableBoardItem';

interface WorkspaceListProps {
    searchQuery: string;
}

export const WorkspaceList = ({ searchQuery }: WorkspaceListProps) => {
    const {
        boards, activeBoardId, activePage, navigateTo, addBoard, setActiveBoard, deleteBoard, updateBoard, moveBoard, duplicateBoardToWorkspace, moveBoardToWorkspace,
        workspaces, activeWorkspaceId, setActiveWorkspace, deleteWorkspace, updateWorkspace, sharedBoardIds,
        userBoardRoles, userWorkspaceRoles, reorderWorkspaces, addSubWorkspace
    } = useBoardStore();

    const { currentUser } = useUserStore();
    const user = currentUser;

    const [creatingBoardInWorkspaceId, setCreatingBoardInWorkspaceId] = useState<string | null>(null);
    const [newBoardTitle, setNewBoardTitle] = useState('');
    
    const [creatingSubWorkspaceInId, setCreatingSubWorkspaceInId] = useState<string | null>(null);
    const [newSubWorkspaceTitle, setNewSubWorkspaceTitle] = useState('');

    // Deletion State
    const [boardToDelete, setBoardToDelete] = useState<string | null>(null);
    const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null);

    // Shown when a non-owner tries an owner-only action (e.g. renaming a
    // workspace they were only shared into).
    const [permissionDeniedMessage, setPermissionDeniedMessage] = useState<string | null>(null);

    // Drag and Drop Workspace State
    const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(null);
    const [dragOverWorkspaceId, setDragOverWorkspaceId] = useState<string | null>(null);
    const [dragGhostState, setDragGhostState] = useState<{ id: string, x: number, y: number, title: string } | null>(null);

    // Renaming State
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    // Workspace Renaming
    const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
    const [editWorkspaceTitle, setEditWorkspaceTitle] = useState('');

    // Context Menus
    const [activeBoardMenu, setActiveBoardMenu] = useState<string | null>(null);
    const [activeWorkspaceMenu, setActiveWorkspaceMenu] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [activeSubmenu, setActiveSubmenu] = useState<'move' | 'duplicate' | null>(null);

    // Share workspace modal
    const [shareWorkspaceId, setShareWorkspaceId] = useState<string | null>(null);
    const [shareBoardId, setShareBoardId] = useState<string | null>(null);

    // Archive/Trash modals
    const [archiveTrashWorkspaceId, setArchiveTrashWorkspaceId] = useState<string | null>(null);
    const [archiveTrashBoardId, setArchiveTrashBoardId] = useState<string | null>(null);

    // Tree expansion state
    const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set([workspaces[0]?.id].filter(Boolean)));
    const searchActive = searchQuery.trim().length > 0;

    const toggleWorkspace = (wsId: string) => {
        const next = new Set(expandedWorkspaces);
        if (next.has(wsId)) next.delete(wsId);
        else next.add(wsId);
        setExpandedWorkspaces(next);
    };

    // Unified filtering: show everything the user has access to
    const filteredWorkspaces = workspaces.filter(w => {
        const isOwner = w.owner_id === user?.id;
        const isMember = userWorkspaceRoles[w.id] !== undefined;
        const hasSharedBoard = boards.some(b => b.workspaceId === w.id && sharedBoardIds.includes(b.id));

        return isOwner || isMember || hasSharedBoard;
    }).filter((w, index, self) => {
        return self.findIndex(i => i.id === w.id) === index;
    }).filter(w => {
        if (!searchQuery.trim()) return true;
        const wsMatch = w.title.toLowerCase().includes(searchQuery.toLowerCase());
        const boardMatch = boards.some(b => b.workspaceId === w.id && b.title.toLowerCase().includes(searchQuery.toLowerCase()) && !b.is_archived);
        return wsMatch || boardMatch;
    });

    // Shared with the collapsed icon rail (Sidebar.tsx) so a workspace visible
    // in one is never silently missing from the other.
    const allAccessibleWorkspaces = useAccessibleWorkspaces();

    // Auto-expand on search
    useEffect(() => {
        if (searchActive && filteredWorkspaces.length > 0) {
            const matches = filteredWorkspaces.map(ws => ws.id);
            const needsExpand = matches.some(id => !expandedWorkspaces.has(id));
            if (needsExpand) {
                setExpandedWorkspaces(prev => {
                    const next = new Set(prev);
                    matches.forEach(id => next.add(id));
                    return next;
                });
            }
        }
    }, [searchActive, filteredWorkspaces, expandedWorkspaces, setExpandedWorkspaces]);

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = () => {
            setActiveBoardMenu(null);
            setActiveWorkspaceMenu(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleRename = (boardId: string) => {
        if (editTitle.trim()) {
            updateBoard(boardId, { title: editTitle });
        }
        setEditingBoardId(null);
    };

    const handleRenameWorkspace = (wsId: string) => {
        if (editWorkspaceTitle.trim()) {
            updateWorkspace(wsId, editWorkspaceTitle);
        }
        setEditingWorkspaceId(null);
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id && over) {
            moveBoard(active.id as string, over.id as string);
        }
    };

    const renderWorkspaceNode = (ws: any, depth: number = 0) => {
        const isExpanded = expandedWorkspaces.has(ws.id);
        const isActive = activeWorkspaceId === ws.id;

        const wsBoards = boards.filter(b => {
            if (b.workspaceId !== ws.id) return false;
            if (b.is_archived) return false;

            const isOwner = ws.owner_id === user?.id;
            const wsRole = userWorkspaceRoles[ws.id];
            const isWorkspaceShared = wsRole;
            const isBoardShared = sharedBoardIds.includes(b.id);

            const isAccessible = isOwner || isWorkspaceShared || isBoardShared;
            if (!isAccessible) return false;

            if (searchQuery.trim()) {
                const workspaceMatches = ws.title.toLowerCase().includes(searchQuery.toLowerCase());
                if (workspaceMatches) return true;
                return b.title.toLowerCase().includes(searchQuery.toLowerCase());
            }
            return true;
        });

        const childWorkspaces = filteredWorkspaces.filter(w => w.parentId === ws.id);

        return (
            <div key={ws.id} className="tree-node" style={{ marginLeft: depth > 0 ? '16px' : '0' }}>
                {/* Workspace Header */}
                <div
                    className={clsx('tree-node-parent', { expanded: isExpanded, active: isActive })}
                    style={{
                        backgroundColor: isActive ? 'var(--color-nav-accent-bg, #f3e8ff)' : 'transparent',
                        color: isActive ? 'var(--color-nav-accent, #7c3aed)' : 'hsl(var(--color-text-primary))',
                        borderTop: dragOverWorkspaceId === ws.id && draggedWorkspaceId !== ws.id ? '2px solid var(--color-nav-accent, #7c3aed)' : 'none',
                        opacity: draggedWorkspaceId === ws.id ? 0.3 : 1
                    }}
                    draggable={!searchActive && !editingWorkspaceId}
                    onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggedWorkspaceId(ws.id);
                        
                        const img = new Image();
                        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                        e.dataTransfer.setDragImage(img, 0, 0);
                        
                        setDragGhostState({ id: ws.id, x: e.clientX, y: e.clientY, title: ws.title });
                    }}
                    onDrag={(e) => {
                        if (e.clientX === 0 && e.clientY === 0) return;
                        setDragGhostState(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedWorkspaceId && draggedWorkspaceId !== ws.id) {
                            setDragOverWorkspaceId(ws.id);
                        }
                    }}
                    onDragLeave={() => {
                        if (dragOverWorkspaceId === ws.id) setDragOverWorkspaceId(null);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedWorkspaceId && draggedWorkspaceId !== ws.id) {
                            reorderWorkspaces(draggedWorkspaceId, ws.id);
                        }
                        setDraggedWorkspaceId(null);
                        setDragOverWorkspaceId(null);
                        setDragGhostState(null);
                    }}
                    onDragEnd={() => {
                        setDraggedWorkspaceId(null);
                        setDragOverWorkspaceId(null);
                        setDragGhostState(null);
                    }}
                    onClick={() => {
                        toggleWorkspace(ws.id);
                        setActiveWorkspace(ws.id);
                    }}
                >
                    <WorkspaceIcon title={ws.title} isActive={isActive} />

                    {editingWorkspaceId === ws.id ? (
                        <input
                            autoFocus
                            type="text"
                            className="sidebar-item-input"
                            style={{ margin: 0, padding: '2px 4px', flex: 1 }}
                            value={editWorkspaceTitle}
                            onChange={(e) => setEditWorkspaceTitle(e.target.value)}
                            onBlur={() => handleRenameWorkspace(ws.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameWorkspace(ws.id);
                                if (e.key === 'Escape') setEditingWorkspaceId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ws.title}
                            {ws.owner_id !== user?.id && <span style={{ fontSize: '10px', color: 'hsl(var(--color-text-secondary))', marginLeft: '6px', opacity: 0.7 }}>({userWorkspaceRoles[ws.id] || 'Guest'})</span>}
                        </span>
                    )}

                    {(ws.owner_id === user?.id || userWorkspaceRoles[ws.id] === 'admin' || userWorkspaceRoles[ws.id] === 'member') && (
                        <div className="sidebar-item-action" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal
                                size={14}
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const menuHeight = 150; 
                                    let top = rect.bottom;
                                    if (top + menuHeight > window.innerHeight) {
                                        top = rect.top - menuHeight;
                                    }
                                    setMenuPosition({ top, left: rect.left });
                                    setActiveWorkspaceMenu(activeWorkspaceMenu === ws.id ? null : ws.id);
                                    setActiveBoardMenu(null);
                                }}
                            />
                        </div>
                    )}

                    <ChevronRight size={16} className="chevron" />
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="tree-node-children">
                        {/* Workspace Dashboard Link */}
                        <div className="tree-node-leaf">
                            <div
                                className={clsx("tree-sidebar-item", { active: activePage === 'dashboard' && activeWorkspaceId === ws.id })}
                                onClick={() => {
                                    setActiveWorkspace(ws.id);
                                    navigateTo('dashboard');
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', cursor: 'pointer' }}
                            >
                                <div style={{ width: '12px', marginRight: '4px' }}></div>
                                <LayoutDashboard size={16} className="item-icon" />
                                <span className="item-label">Dashboard</span>
                            </div>
                        </div>

                        {/* Child Workspaces */}
                        {childWorkspaces.map(childWs => renderWorkspaceNode(childWs, depth + 1))}

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={wsBoards.map(b => b.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {wsBoards.map((board, index) => (
                                    <SortableBoardItem
                                        key={board.id}
                                        board={board}
                                        // activeBoardId stays set after leaving a board (it's the last one opened),
                                        // so only highlight it while a board is actually on screen.
                                        activeBoardId={activePage === 'board' ? activeBoardId : null}
                                        setActiveBoard={setActiveBoard}
                                        editingBoardId={editingBoardId}
                                        setEditingBoardId={setEditingBoardId}
                                        editTitle={editTitle}
                                        setEditTitle={setEditTitle}
                                        handleRename={handleRename}
                                        handleContextMenu={(e, id, rect) => {
                                            e.stopPropagation();
                                            const menuHeight = 220; 
                                            let top = rect.bottom;
                                            if (top + menuHeight > window.innerHeight) {
                                                top = rect.top - menuHeight;
                                            }
                                            setMenuPosition({ top, left: rect.left });
                                            setActiveBoardMenu(activeBoardMenu === id ? null : id);
                                            setActiveWorkspaceMenu(null);
                                        }}
                                        can={(action) => {
                                            const role = userBoardRoles[board.id] || userWorkspaceRoles[ws.id] || (ws.owner_id === user?.id ? 'owner' : 'viewer');
                                            if (role === 'owner' || role === 'admin') return true;
                                            if (role === 'member' || role === 'editor') {
                                                return ['view_board', 'edit_items', 'manage_columns', 'group_ungroup'].includes(action);
                                            }
                                            return action === 'view_board';
                                        }}
                                        isLastChild={index === wsBoards.length - 1}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>

                        {/* Add Board Button Inside Tree */}
                        {!searchActive && (ws.owner_id === user?.id || userWorkspaceRoles[ws.id] === 'admin' || userWorkspaceRoles[ws.id] === 'member') && (
                            <div className="tree-node-leaf last-child">
                                {creatingBoardInWorkspaceId === ws.id ? (
                                    <div className="tree-sidebar-item" style={{ paddingLeft: '4px', cursor: 'default' }}>
                                        <BoardIcon size={16} style={{ color: 'var(--color-nav-accent, #7c3aed)' }} />
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (newBoardTitle.trim()) {
                                                    addBoard(newBoardTitle);
                                                    setNewBoardTitle('');
                                                    setCreatingBoardInWorkspaceId(null);
                                                }
                                            }}
                                            style={{ flex: 1, display: 'flex' }}
                                        >
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="New Board"
                                                className="sidebar-item-input"
                                                style={{ margin: 0, padding: '2px 4px', width: '100%' }}
                                                value={newBoardTitle}
                                                onChange={(e) => setNewBoardTitle(e.target.value)}
                                                onBlur={() => {
                                                    if (newBoardTitle.trim()) {
                                                        addBoard(newBoardTitle);
                                                        setNewBoardTitle('');
                                                    }
                                                    setCreatingBoardInWorkspaceId(null);
                                                }}
                                            />
                                        </form>
                                    </div>
                                ) : (
                                    <div
                                        className="tree-sidebar-item"
                                        style={{ color: 'hsl(var(--color-text-tertiary))' }}
                                        onClick={() => {
                                            setActiveWorkspace(ws.id);
                                            setCreatingBoardInWorkspaceId(ws.id);
                                        }}
                                    >
                                        <div style={{ width: '12px', marginRight: '4px' }}></div>
                                        <Plus size={15} className="item-icon" />
                                        <span>Add board</span>
                                    </div>
                                )}
                                {creatingSubWorkspaceInId === ws.id ? (
                                    <div className="tree-sidebar-item" style={{ paddingLeft: '4px', cursor: 'default' }}>
                                        <Plus size={16} style={{ color: 'var(--color-nav-accent, #7c3aed)' }} />
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (newSubWorkspaceTitle.trim()) {
                                                    addSubWorkspace(ws.id, newSubWorkspaceTitle).catch((err) => {
                                                        showToast(err?.message || 'Failed to create sub workspace', 'error');
                                                    });
                                                    setNewSubWorkspaceTitle('');
                                                    setCreatingSubWorkspaceInId(null);
                                                }
                                            }}
                                            style={{ flex: 1, display: 'flex' }}
                                        >
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="New Sub Workspace"
                                                className="sidebar-item-input"
                                                style={{ margin: 0, padding: '2px 4px', width: '100%' }}
                                                value={newSubWorkspaceTitle}
                                                onChange={(e) => setNewSubWorkspaceTitle(e.target.value)}
                                                onBlur={() => {
                                                    if (newSubWorkspaceTitle.trim()) {
                                                        addSubWorkspace(ws.id, newSubWorkspaceTitle).catch((err) => {
                                                            showToast(err?.message || 'Failed to create sub workspace', 'error');
                                                        });
                                                        setNewSubWorkspaceTitle('');
                                                    }
                                                    setCreatingSubWorkspaceInId(null);
                                                }}
                                            />
                                        </form>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="sidebar-content" style={{ padding: '0' }}>
            <div className="tree-container">
                {filteredWorkspaces.filter(ws => !ws.parentId).map(ws => renderWorkspaceNode(ws))}

                {filteredWorkspaces.length === 0 && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>
                        No workspaces found
                    </div>
                )}
            </div>

            {/* Custom Drag Overlay for Workspaces */}
            {dragGhostState && (
                <div style={{
                    position: 'fixed',
                    top: dragGhostState.y,
                    left: dragGhostState.x,
                    transform: 'translate(-20px, -20px)',
                    pointerEvents: 'none',
                    zIndex: 99999,
                    backgroundColor: 'hsl(var(--color-bg-surface, #ffffff))',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: 500,
                    color: 'hsl(var(--color-text-primary))',
                    border: '1px solid hsl(var(--color-border))',
                    fontSize: '14px',
                    minWidth: '200px'
                }}>
                    <WorkspaceIcon title={dragGhostState.title} isActive={false} />
                    {dragGhostState.title}
                </div>
            )}

            {/* Board Context Menu */}
            {activeBoardMenu && (
                <div className="context-menu" style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    backgroundColor: 'white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: '4px',
                    padding: '4px',
                    zIndex: 9999,
                    width: '200px'
                }} onClick={(e) => e.stopPropagation()}
                    onMouseLeave={() => setActiveSubmenu(null)}
                >
                    {(() => {
                        const board = boards.find(b => b.id === activeBoardMenu);
                        const ws = workspaces.find(w => w.id === board?.workspaceId);
                        const role = userBoardRoles[activeBoardMenu!] || userWorkspaceRoles[ws?.id || ''] || (ws?.owner_id === user?.id ? 'owner' : 'viewer');
                        const isOwnerAdmin = role === 'owner' || role === 'admin';
                        const isEditor = isOwnerAdmin || role === 'member' || role === 'editor';

                        return (
                            <>
                                {isEditor && (
                                    <div className="menu-item" onClick={() => {
                                        if (board) {
                                            setEditingBoardId(board.id);
                                            setEditTitle(board.title);
                                        }
                                        setActiveBoardMenu(null);
                                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                                        <Edit2 size={14} /> Rename
                                    </div>
                                )}

                                {isOwnerAdmin && (
                                    <div className="menu-item" onClick={() => {
                                        setShareBoardId(activeBoardMenu);
                                        setActiveBoardMenu(null);
                                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                                        <Users size={14} /> Share
                                    </div>
                                )}

                                {/* Move To Submenu */}
                                {isOwnerAdmin && (
                                    <div
                                        className="menu-item"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}
                                        onMouseEnter={() => setActiveSubmenu('move')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <LayoutDashboard size={14} /> Move to
                                        </div>
                                        <ChevronRight size={14} />

                                        {activeSubmenu === 'move' && (
                                            <div style={{
                                                position: 'absolute',
                                                left: '100%',
                                                top: 0,
                                                width: '180px',
                                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                borderRadius: '4px',
                                                padding: '4px',
                                                marginLeft: '4px',
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                border: '1px solid hsl(var(--color-border))'
                                            }}>
                                                {allAccessibleWorkspaces.map(ws => (
                                                    <div
                                                        key={ws.id}
                                                        className="menu-item"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            moveBoardToWorkspace(activeBoardMenu!, ws.id);
                                                            setActiveBoardMenu(null);
                                                            setActiveSubmenu(null);
                                                        }}
                                                    >
                                                        {ws.title}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Duplicate To Submenu */}
                                {isEditor && (
                                    <div
                                        className="menu-item"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}
                                        onMouseEnter={() => setActiveSubmenu('duplicate')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Copy size={14} /> Duplicate to
                                        </div>
                                        <ChevronRight size={14} />

                                        {activeSubmenu === 'duplicate' && (
                                            <div style={{
                                                position: 'absolute',
                                                left: '100%',
                                                top: 0,
                                                width: '180px',
                                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                borderRadius: '4px',
                                                padding: '4px',
                                                marginLeft: '4px',
                                                maxHeight: '200px',
                                                overflowY: 'auto',
                                                border: '1px solid hsl(var(--color-border))'
                                            }}>
                                                {allAccessibleWorkspaces.map(ws => (
                                                    <div
                                                        key={ws.id}
                                                        className="menu-item"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            duplicateBoardToWorkspace(activeBoardMenu!, ws.id);
                                                            setActiveBoardMenu(null);
                                                            setActiveSubmenu(null);
                                                        }}
                                                    >
                                                        {ws.title}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isOwnerAdmin && (
                                    <div className="menu-item" onClick={() => {
                                        setArchiveTrashBoardId(activeBoardMenu);
                                        setActiveBoardMenu(null);
                                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                                        <Archive size={14} /> Archive/Trash
                                    </div>
                                )}

                                {isOwnerAdmin && (
                                    <div className="menu-item delete" onClick={() => {
                                        setBoardToDelete(activeBoardMenu);
                                        setActiveBoardMenu(null);
                                    }} onMouseEnter={() => setActiveSubmenu(null)}>
                                        <Trash2 size={14} /> Delete
                                    </div>
                                )}

                                {!isEditor && (
                                    <div style={{ padding: '8px', fontSize: '11px', color: 'hsl(var(--color-text-secondary))', fontStyle: 'italic' }}>
                                        View only access
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {activeWorkspaceMenu && (() => {
                const ws = workspaces.find(w => w.id === activeWorkspaceMenu);
                return (
                    <div className="context-menu" style={{
                        position: 'fixed',
                        top: menuPosition.top,
                        left: menuPosition.left,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        borderRadius: '4px',
                        padding: '4px',
                        zIndex: 9999,
                        width: '180px',
                        border: '1px solid hsl(var(--color-border))'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div className="menu-item" onClick={() => {
                            setShareWorkspaceId(activeWorkspaceMenu);
                            setActiveWorkspaceMenu(null);
                        }}>
                            <Users size={14} /> Share
                        </div>
                        <div className="menu-item" onClick={() => {
                            setActiveWorkspaceMenu(null);
                            if (!ws) return;
                            if (ws.owner_id !== user?.id) {
                                setPermissionDeniedMessage("Only the workspace owner can rename it. Ask the owner to make this change.");
                                return;
                            }
                            setEditingWorkspaceId(ws.id);
                            setEditWorkspaceTitle(ws.title);
                        }} >
                            <Edit2 size={14} /> Rename
                        </div>
                        {ws?.owner_id === user?.id && (
                            <div className="menu-item" onClick={() => {
                                if (ws) {
                                    setCreatingSubWorkspaceInId(ws.id);
                                    if (!expandedWorkspaces.has(ws.id)) toggleWorkspace(ws.id);
                                }
                                setActiveWorkspaceMenu(null);
                            }}>
                                <Plus size={14} /> Add Sub Workspace
                            </div>
                        )}
                        {ws?.owner_id === user?.id && (
                            <div className="menu-item" onClick={() => {
                                setArchiveTrashWorkspaceId(activeWorkspaceMenu);
                                setActiveWorkspaceMenu(null);
                            }}>
                                <Archive size={14} /> Archive/Trash
                            </div>
                        )}
                        {ws?.owner_id === user?.id && (
                            <div className="menu-item delete" onClick={() => {
                                setWorkspaceToDelete(activeWorkspaceMenu);
                                setActiveWorkspaceMenu(null);
                            }}>
                                <Trash2 size={14} /> Delete
                            </div>
                        )}
                    </div>
                );
            })()}

            <ConfirmModal
                isOpen={!!boardToDelete}
                title="Delete Board"
                message="Are you sure you want to delete this board? You can restore it later from this workspace's Archive/Trash."
                confirmText="Delete"
                onConfirm={() => {
                    if (boardToDelete) deleteBoard(boardToDelete);
                    setBoardToDelete(null);
                }}
                onCancel={() => setBoardToDelete(null)}
            />

            <ConfirmModal
                isOpen={!!workspaceToDelete}
                title="Delete Workspace"
                message="Are you sure you want to delete this workspace? All boards inside it will be deleted! This action cannot be undone."
                confirmText="Delete Workspace"
                onConfirm={() => {
                    if (workspaceToDelete) deleteWorkspace(workspaceToDelete);
                    setWorkspaceToDelete(null);
                }}
                onCancel={() => setWorkspaceToDelete(null)}
            />

            {shareWorkspaceId && (
                <ShareWorkspaceModal
                    workspaceId={shareWorkspaceId}
                    onClose={() => setShareWorkspaceId(null)}
                />
            )}

            {shareBoardId && (
                <ShareBoardModal
                    boardId={shareBoardId}
                    onClose={() => setShareBoardId(null)}
                />
            )}

            {archiveTrashWorkspaceId && (
                <ArchiveTrashModal
                    workspaceId={archiveTrashWorkspaceId}
                    workspaceTitle={workspaces.find(w => w.id === archiveTrashWorkspaceId)?.title}
                    onClose={() => setArchiveTrashWorkspaceId(null)}
                />
            )}

            {archiveTrashBoardId && (
                <BoardArchiveTrashModal
                    boardId={archiveTrashBoardId}
                    onClose={() => setArchiveTrashBoardId(null)}
                />
            )}

            <PermissionDeniedModal
                isOpen={!!permissionDeniedMessage}
                message={permissionDeniedMessage || ''}
                onClose={() => setPermissionDeniedMessage(null)}
            />

            <style>{`
                .workspace-item-row:hover .action-icon {
                    opacity: 1;
                }
                .action-icon {
                    opacity: 0;
                    margin-left: auto;
                    color: hsl(var(--color-text-secondary));
                    border-radius: 4px;
                    padding: 2px;
                }
                .action-icon:hover {
                    background-color: hsl(var(--color-bg-hover));
                    color: hsl(var(--color-text-primary));
                }
                .tree-node {
                    margin-bottom: 4px;
                }
                .tree-sidebar-item {
                    margin-bottom: 2px;
                }
                .context-menu {
                    display: flex;
                    flex-direction: column;
                    text-align: left;
                }
                .menu-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    color: hsl(var(--color-text-primary));
                    border-radius: 4px;
                }
                .menu-item:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .menu-item.delete {
                    color: hsl(var(--color-dangerous));
                }
                .menu-item.delete:hover {
                    background-color: hsl(var(--color-dangerous-subtle));
                }
            `}</style>
        </div>
    );
};
