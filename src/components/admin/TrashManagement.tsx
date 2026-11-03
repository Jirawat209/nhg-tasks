import { useEffect, useState } from 'react';
import { Search, RefreshCw, RotateCcw, Trello, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';

interface ArchivedBoardRow {
    id: string;
    title: string;
    workspaceTitle: string;
}

interface ArchivedGroupRow {
    id: string;
    title: string;
    boardId: string;
    boardTitle: string;
    workspaceTitle: string;
}

export const TrashManagement = () => {
    const { currentUser } = useUserStore();
    const canRestore = currentUser.system_role === 'super_admin';

    const [boards, setBoards] = useState<ArchivedBoardRow[]>([]);
    const [groups, setGroups] = useState<ArchivedGroupRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const fetchTrash = async () => {
        setIsLoading(true);
        const [{ data: boardData }, { data: groupData }] = await Promise.all([
            supabase
                .from('boards')
                .select('id, title, workspace_id, workspaces(title)')
                .eq('is_archived', true)
                .order('title'),
            supabase
                .from('groups')
                .select('id, title, board_id, boards(title, workspace_id, workspaces(title))')
                .eq('is_archived', true)
                .order('title')
        ]);

        setBoards((boardData || []).map((b: any) => ({
            id: b.id,
            title: b.title,
            workspaceTitle: b.workspaces?.title || 'Unknown Workspace'
        })));

        setGroups((groupData || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            boardId: g.board_id,
            boardTitle: g.boards?.title || 'Unknown Board',
            workspaceTitle: g.boards?.workspaces?.title || 'Unknown Workspace'
        })));

        setIsLoading(false);
    };

    useEffect(() => {
        fetchTrash();
    }, []);

    const handleRestoreBoard = async (id: string) => {
        setRestoringId(id);
        await useBoardStore.getState().restoreBoard(id);
        setBoards(prev => prev.filter(b => b.id !== id));
        setRestoringId(null);
    };

    const handleRestoreGroup = async (id: string, boardId: string) => {
        setRestoringId(id);
        await useBoardStore.getState().restoreGroup(id, boardId);
        setGroups(prev => prev.filter(g => g.id !== id));
        setRestoringId(null);
    };

    const q = searchQuery.trim().toLowerCase();
    const filteredBoards = q ? boards.filter(b => b.title.toLowerCase().includes(q) || b.workspaceTitle.toLowerCase().includes(q)) : boards;
    const filteredGroups = q ? groups.filter(g => g.title.toLowerCase().includes(q) || g.boardTitle.toLowerCase().includes(q) || g.workspaceTitle.toLowerCase().includes(q)) : groups;

    const restoreButton = (id: string, onClick: () => void) => (
        <button
            onClick={canRestore ? onClick : undefined}
            disabled={!canRestore || restoringId === id}
            title={canRestore ? undefined : 'Only Super Admin can restore'}
            className="glass-chip"
            style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px',
                cursor: canRestore ? (restoringId === id ? 'not-allowed' : 'pointer') : 'not-allowed',
                fontSize: '12.5px', fontWeight: 600,
                color: canRestore ? 'hsl(var(--ink))' : 'hsl(var(--ink-soft))',
                opacity: restoringId === id ? 0.6 : 1
            }}
        >
            <RotateCcw size={13} /> {restoringId === id ? 'Restoring...' : 'Restore'}
        </button>
    );

    return (
        <div className="card-surface" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', background: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '380px', padding: '7px 14px', borderRadius: '999px', background: 'hsl(var(--paper))', border: '1px solid hsl(var(--paper-edge))' }}>
                    <Search size={15} color="hsl(var(--ink-soft))" />
                    <input
                        type="text"
                        placeholder="Search trash..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: 'none', outline: 'none', fontSize: '13.5px', flex: 1, background: 'transparent', color: 'hsl(var(--ink))' }}
                    />
                </div>
                <button
                    onClick={fetchTrash}
                    className="glass-chip"
                    style={{
                        padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        gap: '6px', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--ink))'
                    }}
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {!canRestore && (
                <div style={{ padding: '10px 20px', fontSize: '12.5px', color: '#A76400', backgroundColor: 'rgba(167, 100, 0, 0.08)', borderBottom: '1px solid hsl(var(--paper-edge))' }}>
                    You can view everything that's been deleted, but only a Super Admin can restore it.
                </div>
            )}

            {isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-dim))' }}>Loading...</div>
            ) : (
                <div style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <div className="admin-tile" style={{ width: '32px', height: '32px', background: 'rgba(42, 74, 18, 0.1)', color: '#2A4A12' }}>
                            <Trello size={15} />
                        </div>
                        <h3 className="narai-heading" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'hsl(var(--ink))' }}>
                            Archived Boards ({filteredBoards.length})
                        </h3>
                    </div>
                    {filteredBoards.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--ink-soft))', fontSize: '13px', marginBottom: '24px' }}>No archived boards.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
                            {filteredBoards.map(b => (
                                <div key={b.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: '14px', border: '1px solid hsl(var(--paper-edge))', backgroundColor: 'hsl(var(--paper-muted))'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'hsl(var(--ink))' }}>{b.title}</div>
                                        <div style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))' }}>{b.workspaceTitle}</div>
                                    </div>
                                    {restoreButton(b.id, () => handleRestoreBoard(b.id))}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <div className="admin-tile" style={{ width: '32px', height: '32px', background: 'rgba(167, 100, 0, 0.12)', color: '#A76400' }}>
                            <Layers size={15} />
                        </div>
                        <h3 className="narai-heading" style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'hsl(var(--ink))' }}>
                            Archived Groups ({filteredGroups.length})
                        </h3>
                    </div>
                    {filteredGroups.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--ink-soft))', fontSize: '13px' }}>No archived groups.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredGroups.map(g => (
                                <div key={g.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: '14px', border: '1px solid hsl(var(--paper-edge))', backgroundColor: 'hsl(var(--paper-muted))'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'hsl(var(--ink))' }}>{g.title}</div>
                                        <div style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))' }}>{g.boardTitle} › {g.workspaceTitle}</div>
                                    </div>
                                    {restoreButton(g.id, () => handleRestoreGroup(g.id, g.boardId))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
