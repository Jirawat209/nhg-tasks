import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Search, RefreshCw, ExternalLink, Users, Trash2 } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';
import { slugify, buildBoardSlug } from '../../lib/utils';
import { AdminBoardMembersModal } from './AdminBoardMembersModal';

interface BoardMemberSummary {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
}

interface BoardRow {
    id: string;
    title: string;
    created_at: string;
    owner_id: string;
    workspace_id: string;
    owner_name: string;
    owner_email: string;
    workspace_title: string;
    members: BoardMemberSummary[];
    // People who can open this board through the workspace rather than through
    // board_members — they never appear in the Members column, but they still
    // have access, so a search for them has to find the board.
    workspace_members: BoardMemberSummary[];
    is_archived: boolean;
}

export const BoardTable = () => {
    const { currentUser } = useUserStore();
    const canDelete = currentUser.system_role === 'super_admin';
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [filteredBoards, setFilteredBoards] = useState<BoardRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [managingBoard, setManagingBoard] = useState<{ id: string; title: string } | null>(null);
    const [deletePopover, setDeletePopover] = useState<{
        boardId: string;
        boardTitle: string;
        workspaceId: string;
        top: number;
        left: number;
    } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchBoards = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch boards with workspace and owner info (owner comes from workspace).
            //
            // Deleting a board archives the row rather than removing it, and these
            // stay listed on purpose: a user can own nothing but deleted boards, and
            // an admin looking them up still needs to find them. They're marked as
            // deleted in the row instead, because shown-as-normal made "Access" look
            // broken — the deep link resolver deliberately refuses an archived board,
            // so the new tab just landed somewhere else with no explanation.
            const { data, error: fetchError } = await supabase
                .from('boards')
                .select(`
                    id,
                    title,
                    created_at,
                    workspace_id,
                    is_archived,
                    workspaces!boards_workspace_id_fkey (
                        title,
                        owner_id,
                        profiles!workspaces_owner_id_fkey (
                            full_name,
                            email
                        )
                    )
                `)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            const boardIds = (data || []).map((board: any) => board.id);
            const membersByBoard: Record<string, BoardMemberSummary[]> = {};
            if (boardIds.length > 0) {
                const { data: memberRows } = await supabase
                    .from('board_members')
                    .select('board_id, profiles(id, full_name, email, avatar_url)')
                    .in('board_id', boardIds);

                (memberRows || []).forEach((row: any) => {
                    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
                    if (!profile) return;
                    if (!membersByBoard[row.board_id]) membersByBoard[row.board_id] = [];
                    membersByBoard[row.board_id].push(profile);
                });
            }

            // Workspace-level access grants every board in that workspace, so these
            // people can open a board without ever being listed on it. Fetched whole
            // rather than filtered by id — the table is tiny next to board_members.
            const wsMembersByWorkspace: Record<string, BoardMemberSummary[]> = {};
            const { data: wsMemberRows } = await supabase
                .from('workspace_members')
                .select('workspace_id, role, profiles(id, full_name, email, avatar_url)');

            (wsMemberRows || []).forEach((row: any) => {
                if (!['member', 'admin', 'editor'].includes(row.role)) return;
                const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
                if (!profile) return;
                if (!wsMembersByWorkspace[row.workspace_id]) wsMembersByWorkspace[row.workspace_id] = [];
                wsMembersByWorkspace[row.workspace_id].push(profile);
            });

            const mapped: BoardRow[] = (data || []).map((board: any) => ({
                id: board.id,
                title: board.title,
                created_at: board.created_at,
                owner_id: board.workspaces?.owner_id || '',
                workspace_id: board.workspace_id,
                owner_name: board.workspaces?.profiles?.full_name || 'Unknown',
                owner_email: board.workspaces?.profiles?.email || 'N/A',
                workspace_title: board.workspaces?.title || 'Unknown Workspace',
                members: membersByBoard[board.id] || [],
                workspace_members: wsMembersByWorkspace[board.workspace_id] || [],
                is_archived: !!board.is_archived
            }));

            setBoards(mapped);
            setFilteredBoards(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (board: BoardRow, e: React.MouseEvent) => {
        if (!canDelete || board.is_archived) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let left = rect.right - 260;
        if (left < 10) left = 10;
        setDeletePopover({
            boardId: board.id,
            boardTitle: board.title,
            workspaceId: board.workspace_id,
            top: rect.bottom + 4,
            left
        });
    };

    const handleConfirmDelete = async () => {
        if (!deletePopover) return;
        const { boardId, boardTitle, workspaceId } = deletePopover;
        setDeletingId(boardId);
        setDeletePopover(null);
        try {
            await supabase.from('boards').update({ is_archived: true }).eq('id', boardId);
            await useBoardStore.getState().logActivity('board_deleted', 'workspace', workspaceId, {
                workspace_id: workspaceId,
                board_title: boardTitle
            });
            // Stays in the list, now flagged as deleted, rather than vanishing —
            // same as any other already-deleted board here.
            const markDeleted = (rows: BoardRow[]) =>
                rows.map(b => b.id === boardId ? { ...b, is_archived: true } : b);
            setBoards(markDeleted);
            setFilteredBoards(markDeleted);
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => {
        fetchBoards();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredBoards(boards);
        } else {
            const query = searchQuery.toLowerCase();
            // Searching a person should surface every board they can actually open,
            // however they got in: as the workspace owner, as a workspace member
            // (which grants every board in it without any board_members row), or as
            // a member of the board itself. Matching only the first of those was
            // why a user with real boards came back "No boards found".
            //
            // Not covered on purpose: super admins, who can technically open every
            // board — matching them would return the entire table and say nothing.
            const matches = (value: string | null | undefined) =>
                !!value && value.toLowerCase().includes(query);
            const matchesPerson = (p: BoardMemberSummary) => matches(p.full_name) || matches(p.email);

            setFilteredBoards(
                boards.filter(board =>
                    matches(board.title) ||
                    matches(board.workspace_title) ||
                    matches(board.owner_name) ||
                    matches(board.owner_email) ||
                    board.members.some(matchesPerson) ||
                    board.workspace_members.some(matchesPerson)
                )
            );
        }
    }, [searchQuery, boards]);

    // Deleted boards are hidden by default — they're the majority of the table
    // and can't be opened anyway, so they only get in the way of the usual job
    // of finding a live board. They stay one toggle away rather than gone,
    // because a user can own nothing but deleted boards and still need looking up.
    // Spells out both routes into a board, so a row that a search matched on
    // someone who isn't in the Members column still shows why it matched.
    const membersTooltip = (board: BoardRow) => {
        const nameOf = (p: BoardMemberSummary) => p.full_name || p.email || 'Unknown';
        const onBoard = new Set(board.members.map(m => m.id));
        const viaWorkspace = board.workspace_members.filter(m => !onBoard.has(m.id));

        const lines = ['Manage members'];
        if (board.members.length > 0) lines.push(`On this board: ${board.members.map(nameOf).join(', ')}`);
        if (viaWorkspace.length > 0) lines.push(`Via workspace: ${viaWorkspace.map(nameOf).join(', ')}`);
        return lines.join('\n');
    };

    const visibleBoards = showDeleted ? filteredBoards : filteredBoards.filter(b => !b.is_archived);
    const hiddenDeletedCount = showDeleted ? 0 : filteredBoards.length - visibleBoards.length;

    return (
        <div className="card-surface" style={{ overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', background: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '380px', padding: '7px 14px', borderRadius: '999px', background: 'hsl(var(--paper))', border: '1px solid hsl(var(--paper-edge))' }}>
                    <Search size={15} color="hsl(var(--ink-soft))" />
                    <input
                        type="text"
                        placeholder="Search boards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '13.5px',
                            flex: 1,
                            background: 'transparent',
                            color: 'hsl(var(--ink))'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label
                        title="Deleted boards live in Trash and can't be opened until restored"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '13px',
                            color: 'hsl(var(--ink-dim))',
                            cursor: 'pointer',
                            userSelect: 'none',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={showDeleted}
                            onChange={(e) => setShowDeleted(e.target.checked)}
                            style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2A4A12' }}
                        />
                        Show deleted boards
                        {hiddenDeletedCount > 0 && (
                            <span style={{ color: 'hsl(var(--ink-soft))' }}>({hiddenDeletedCount} hidden)</span>
                        )}
                    </label>
                    <button
                        onClick={fetchBoards}
                        className="glass-chip"
                        style={{
                            padding: '6px 14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'hsl(var(--ink))'
                        }}
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-dim))' }}>Loading boards...</div>
            ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#C83E2B' }}>Error: {error}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))' }}>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Board</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workspace</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workspace Owner</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Members</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Created</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleBoards.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-soft))' }}>
                                        {hiddenDeletedCount > 0
                                            ? `No live boards found — ${hiddenDeletedCount} deleted ${hiddenDeletedCount === 1 ? 'board matches' : 'boards match'}. Tick "Show deleted boards" to see them.`
                                            : 'No boards found'}
                                    </td>
                                </tr>
                            ) : (
                                visibleBoards.map((board) => (
                                    <tr key={board.id} style={{ borderBottom: '1px solid hsl(var(--paper-row-line))' }}>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ fontWeight: 600, color: board.is_archived ? 'hsl(var(--ink-soft))' : 'hsl(var(--ink))', fontSize: '14px' }}>{board.title}</div>
                                                {board.is_archived && (
                                                    <span
                                                        title="This board was deleted — restore it from Trash to open it again"
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            color: '#C83E2B',
                                                            backgroundColor: 'rgba(200, 62, 43, 0.1)',
                                                            border: '1px solid rgba(200, 62, 43, 0.25)',
                                                            borderRadius: '999px',
                                                            padding: '2px 8px',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Deleted
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontSize: '13.5px', color: 'hsl(var(--ink-dim))' }}>{board.workspace_title}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'hsl(var(--ink))' }}>{board.owner_name}</div>
                                            <div style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))', marginTop: '2px' }}>{board.owner_email}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <button
                                                onClick={() => setManagingBoard({ id: board.id, title: board.title })}
                                                title={membersTooltip(board)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 0,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {board.members.length === 0 ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '13px',
                                                        color: 'hsl(var(--ink-soft))'
                                                    }}>
                                                        <Users size={14} />
                                                        No members
                                                    </span>
                                                ) : (
                                                    <>
                                                        <div style={{ display: 'flex' }}>
                                                            {board.members.slice(0, 4).map((member, idx) => (
                                                                <div
                                                                    key={member.id}
                                                                    title={member.full_name || member.email || ''}
                                                                    style={{
                                                                        width: '26px',
                                                                        height: '26px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: member.avatar_url ? 'transparent' : '#2A4A12',
                                                                        color: '#FFEFD2',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '11px',
                                                                        fontWeight: 600,
                                                                        overflow: 'hidden',
                                                                        border: '2px solid hsl(var(--paper))',
                                                                        marginLeft: idx === 0 ? 0 : '-8px',
                                                                        flexShrink: 0
                                                                    }}
                                                                >
                                                                    {member.avatar_url ? (
                                                                        <img
                                                                            src={member.avatar_url}
                                                                            alt=""
                                                                            referrerPolicy="no-referrer"
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                        />
                                                                    ) : (
                                                                        (member.full_name?.[0] || member.email?.[0] || '?').toUpperCase()
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {board.members.length > 4 && (
                                                            <span style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))', fontWeight: 600 }}>
                                                                +{board.members.length - 4}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '12px', color: 'hsl(var(--ink-soft))' }}>
                                                            ({board.members.length})
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '14px 20px', fontSize: '13.5px', color: 'hsl(var(--ink-dim))' }}>
                                            {new Date(board.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => {
                                                    const username = slugify(currentUser.name || 'u');
                                                    const wsName = slugify(board.workspace_title);
                                                    const bName = buildBoardSlug(board.title, board.id);
                                                    const url = `/${username}/${wsName}/${bName}?requirePin=${board.id}`;
                                                    window.open(url, '_blank');
                                                }}
                                                disabled={board.is_archived}
                                                title={board.is_archived
                                                    ? 'This board is deleted — restore it from Trash to open it'
                                                    : 'Open board in a new tab'}
                                                className="glass-chip"
                                                style={{
                                                    padding: '6px 12px',
                                                    cursor: board.is_archived ? 'not-allowed' : 'pointer',
                                                    opacity: board.is_archived ? 0.45 : 1,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--ink))',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <ExternalLink size={13} />
                                                Access
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(board, e)}
                                                disabled={!canDelete || board.is_archived || deletingId === board.id}
                                                title={board.is_archived
                                                    ? 'Already deleted — manage it under Trash'
                                                    : (canDelete ? 'Delete board' : 'Only Super Admin can delete')}
                                                style={{
                                                    marginLeft: '8px',
                                                    padding: '6px 12px',
                                                    backgroundColor: canDelete && !board.is_archived ? 'rgba(200, 62, 43, 0.08)' : 'hsl(var(--paper-muted))',
                                                    border: canDelete && !board.is_archived ? '1px solid rgba(200, 62, 43, 0.28)' : '1px solid hsl(var(--paper-edge))',
                                                    borderRadius: '999px',
                                                    cursor: canDelete && !board.is_archived && deletingId !== board.id ? 'pointer' : 'not-allowed',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 600,
                                                    color: canDelete && !board.is_archived ? '#C83E2B' : 'hsl(var(--ink-soft))',
                                                    opacity: deletingId === board.id ? 0.6 : 1,
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <Trash2 size={13} />
                                                {deletingId === board.id ? 'Deleting...' : 'Delete'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {managingBoard && (
                <AdminBoardMembersModal
                    boardId={managingBoard.id}
                    boardTitle={managingBoard.title}
                    onClose={() => setManagingBoard(null)}
                    onMembersChanged={fetchBoards}
                />
            )}

            {deletePopover && createPortal(
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
                        onClick={() => setDeletePopover(null)}
                    />
                    <div className="glass-pop" style={{
                        position: 'fixed',
                        top: deletePopover.top,
                        left: deletePopover.left,
                        zIndex: 10000,
                        padding: '16px',
                        width: '260px'
                    }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700, color: 'hsl(var(--ink))' }}>
                            Delete "{deletePopover.boardTitle}"?
                        </h4>
                        <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'hsl(var(--ink-dim))' }}>
                            The board will be moved to Trash and can be restored later by a Super Admin.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeletePopover(null)}
                                className="glass-chip"
                                style={{
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                    fontSize: '12.5px',
                                    fontWeight: 600
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                style={{
                                    padding: '6px 14px',
                                    border: 'none',
                                    backgroundColor: '#C83E2B',
                                    color: 'white',
                                    borderRadius: '999px',
                                    cursor: 'pointer',
                                    fontSize: '12.5px',
                                    fontWeight: 600
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};
