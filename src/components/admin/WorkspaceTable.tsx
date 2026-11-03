import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, RefreshCw, ExternalLink, Users, Trash2 } from 'lucide-react';
import { useUserStore } from '../../store/useUserStore';
import { useBoardStore } from '../../store/useBoardStore';
import { slugify } from '../../lib/utils';
import { AdminWorkspaceMembersModal } from './AdminWorkspaceMembersModal';
import { AdminDeleteWorkspaceModal } from './AdminDeleteWorkspaceModal';

interface WorkspaceMemberSummary {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
}

interface WorkspaceRow {
    id: string;
    title: string;
    created_at: string;
    owner_id: string;
    owner_name: string;
    owner_email: string;
    members: WorkspaceMemberSummary[];
}

export const WorkspaceTable = () => {
    const { currentUser } = useUserStore();
    const canDelete = currentUser.system_role === 'super_admin';
    const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
    const [filteredWorkspaces, setFilteredWorkspaces] = useState<WorkspaceRow[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [managingWorkspace, setManagingWorkspace] = useState<{ id: string; title: string; ownerId: string } | null>(null);
    const [deletingWorkspace, setDeletingWorkspace] = useState<{ id: string; title: string } | null>(null);

    const fetchWorkspaces = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch workspaces with owner info
            const { data, error: fetchError } = await supabase
                .from('workspaces')
                .select(`
                    id,
                    title,
                    created_at,
                    owner_id,
                    profiles!workspaces_owner_id_fkey (
                        full_name,
                        email
                    )
                `)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            const workspaceIds = (data || []).map((ws: any) => ws.id);
            const membersByWorkspace: Record<string, WorkspaceMemberSummary[]> = {};
            if (workspaceIds.length > 0) {
                const { data: memberRows } = await supabase
                    .from('workspace_members')
                    .select('workspace_id, profiles(id, full_name, email, avatar_url)')
                    .in('workspace_id', workspaceIds);

                (memberRows || []).forEach((row: any) => {
                    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
                    if (!profile) return;
                    if (!membersByWorkspace[row.workspace_id]) membersByWorkspace[row.workspace_id] = [];
                    membersByWorkspace[row.workspace_id].push(profile);
                });
            }

            const mapped: WorkspaceRow[] = (data || []).map((ws: any) => {
                let members = membersByWorkspace[ws.id] || [];
                // The owner doesn't always have a workspace_members row — surface them
                // in the summary too so the count/avatars match the manage-members modal.
                if (ws.owner_id && !members.some(m => m.id === ws.owner_id)) {
                    members = [{
                        id: ws.owner_id,
                        full_name: ws.profiles?.full_name || null,
                        email: ws.profiles?.email || null,
                        avatar_url: null
                    }, ...members];
                }
                return {
                    id: ws.id,
                    title: ws.title,
                    created_at: ws.created_at,
                    owner_id: ws.owner_id,
                    owner_name: ws.profiles?.full_name || 'Unknown',
                    owner_email: ws.profiles?.email || 'N/A',
                    members
                };
            });

            setWorkspaces(mapped);
            setFilteredWorkspaces(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingWorkspace) return;
        const { id, title } = deletingWorkspace;
        await supabase.from('workspaces').delete().eq('id', id);
        await useBoardStore.getState().logActivity('workspace_deleted', 'workspace', id, { workspace_title: title });
        setWorkspaces(prev => prev.filter(w => w.id !== id));
        setFilteredWorkspaces(prev => prev.filter(w => w.id !== id));
        setDeletingWorkspace(null);
    };

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredWorkspaces(workspaces);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredWorkspaces(
                workspaces.filter(ws =>
                    ws.title.toLowerCase().includes(query) ||
                    ws.owner_name.toLowerCase().includes(query) ||
                    ws.owner_email.toLowerCase().includes(query)
                )
            );
        }
    }, [searchQuery, workspaces]);

    return (
        <div className="card-surface" style={{ overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', background: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '380px', padding: '7px 14px', borderRadius: '999px', background: 'hsl(var(--paper))', border: '1px solid hsl(var(--paper-edge))' }}>
                    <Search size={15} color="hsl(var(--ink-soft))" />
                    <input
                        type="text"
                        placeholder="Search workspaces..."
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
                <button
                    onClick={fetchWorkspaces}
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

            {/* Table */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-dim))' }}>Loading workspaces...</div>
            ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#C83E2B' }}>Error: {error}</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'hsl(var(--paper-head))', borderBottom: '1px solid hsl(var(--paper-edge))' }}>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Workspace</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Owner</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Members</th>
                                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Created</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--ink-soft))', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredWorkspaces.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--ink-soft))' }}>
                                        No workspaces found
                                    </td>
                                </tr>
                            ) : (
                                filteredWorkspaces.map((ws) => (
                                    <tr key={ws.id} style={{ borderBottom: '1px solid hsl(var(--paper-row-line))' }}>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontWeight: 600, color: 'hsl(var(--ink))', fontSize: '14px' }}>{ws.title}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ fontSize: '13.5px', fontWeight: 500, color: 'hsl(var(--ink))' }}>{ws.owner_name}</div>
                                            <div style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))', marginTop: '2px' }}>{ws.owner_email}</div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <button
                                                onClick={() => setManagingWorkspace({ id: ws.id, title: ws.title, ownerId: ws.owner_id })}
                                                title="Manage members"
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
                                                {ws.members.length === 0 ? (
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
                                                            {ws.members.slice(0, 4).map((member, idx) => (
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
                                                        {ws.members.length > 4 && (
                                                            <span style={{ fontSize: '12px', color: 'hsl(var(--ink-dim))', fontWeight: 600 }}>
                                                                +{ws.members.length - 4}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '12px', color: 'hsl(var(--ink-soft))' }}>
                                                            ({ws.members.length})
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                        <td style={{ padding: '14px 20px', fontSize: '13.5px', color: 'hsl(var(--ink-dim))' }}>
                                            {new Date(ws.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <button
                                                onClick={() => {
                                                    const username = slugify(currentUser.name || 'u');
                                                    const wsName = slugify(ws.title);
                                                    const url = `/${username}/${wsName}`;
                                                    window.open(url, '_blank');
                                                }}
                                                className="glass-chip"
                                                style={{
                                                    padding: '6px 12px',
                                                    cursor: 'pointer',
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
                                                onClick={() => canDelete && setDeletingWorkspace({ id: ws.id, title: ws.title })}
                                                disabled={!canDelete}
                                                title={canDelete ? 'Delete workspace' : 'Only Super Admin can delete'}
                                                style={{
                                                    marginLeft: '8px',
                                                    padding: '6px 12px',
                                                    backgroundColor: canDelete ? 'rgba(200, 62, 43, 0.08)' : 'hsl(var(--paper-muted))',
                                                    border: canDelete ? '1px solid rgba(200, 62, 43, 0.28)' : '1px solid hsl(var(--paper-edge))',
                                                    borderRadius: '999px',
                                                    cursor: canDelete ? 'pointer' : 'not-allowed',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 600,
                                                    color: canDelete ? '#C83E2B' : 'hsl(var(--ink-soft))',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <Trash2 size={13} />
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {managingWorkspace && (
                <AdminWorkspaceMembersModal
                    workspaceId={managingWorkspace.id}
                    workspaceTitle={managingWorkspace.title}
                    ownerId={managingWorkspace.ownerId}
                    onClose={() => setManagingWorkspace(null)}
                    onMembersChanged={fetchWorkspaces}
                />
            )}

            {deletingWorkspace && (
                <AdminDeleteWorkspaceModal
                    workspaceTitle={deletingWorkspace.title}
                    onCancel={() => setDeletingWorkspace(null)}
                    onConfirm={handleConfirmDelete}
                />
            )}
        </div>
    );
};
