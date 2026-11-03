import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { RefreshCw, User, Briefcase, Trello, Trash2, Shield, FileEdit } from 'lucide-react';

interface ActivityLog {
    id: string;
    created_at: string;
    actor_id: string | null;
    action_type: string;
    target_type: string | null;
    target_id: string | null;
    metadata: any;
    actor_name?: string;
    actor_email?: string;
}

const ACTION_ICONS: Record<string, any> = {
    user_signup: User,
    workspace_created: Briefcase,
    board_created: Trello,
    user_deleted: Trash2,
    role_updated: Shield,
    item_value_updated: FileEdit,
};

const ACTION_LABELS: Record<string, string> = {
    user_signup: 'User Signup',
    workspace_created: 'Workspace Created',
    board_created: 'Board Created',
    user_deleted: 'User Deleted',
    role_updated: 'Role Updated',
    item_value_updated: 'Item Value Updated',
};

export const ActivityLogs = () => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from('activity_logs')
                .select(`
                    *,
                    profiles!activity_logs_actor_id_fkey (
                        full_name,
                        email
                    )
                `)
                .neq('action_type', 'user_login')
                .order('created_at', { ascending: false })
                .limit(100);

            if (fetchError) throw fetchError;

            const mapped: ActivityLog[] = (data || []).map((log: any) => ({
                ...log,
                actor_name: log.profiles?.full_name || 'System',
                actor_email: log.profiles?.email || 'N/A'
            }));

            setLogs(mapped);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const getActionColor = (actionType: string) => {
        if (actionType.includes('delete')) return '#C83E2B';
        if (actionType.includes('created')) return '#2A4A12';
        if (actionType.includes('updated')) return '#A76400';
        return '#2E7D8C';
    };

    return (
        <div className="card-surface" style={{ overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                padding: '14px 20px',
                backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <h3 className="narai-heading" style={{
                    margin: 0,
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-primary))'
                }}>
                    Recent Audit Activity
                </h3>
                <button
                    type="button"
                    className="glass-chip"
                    onClick={fetchLogs}
                    style={{
                        height: '30px',
                        padding: '0 12px',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'hsl(var(--color-text-primary))'
                    }}
                >
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Logs List */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13.5px' }}>Loading activity logs…</div>
            ) : error ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-danger))' }}>
                    Error: {error}
                </div>
            ) : logs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13.5px' }}>No activity logs yet</div>
            ) : (
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {logs.map((log, idx) => {
                        const Icon = ACTION_ICONS[log.action_type] || User;
                        const color = getActionColor(log.action_type);

                        return (
                            <div
                                key={log.id}
                                style={{
                                    padding: '14px 20px',
                                    borderBottom: idx < logs.length - 1 ? '1px solid var(--paper-row-line, hsl(var(--color-border)))' : 'none',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px'
                                }}
                            >
                                <div
                                    className="admin-tile"
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        '--tile-color': color
                                    } as React.CSSProperties}
                                >
                                    <Icon size={17} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                                        {ACTION_LABELS[log.action_type] || log.action_type}
                                    </div>
                                    <div style={{ fontSize: '12.5px', color: 'hsl(var(--color-text-secondary))', marginTop: '2px' }}>
                                        by {log.actor_name} ({log.actor_email})
                                    </div>
                                    {log.metadata && (() => {
                                        const meta = log.metadata;

                                        switch (log.action_type) {
                                            case 'role_updated':
                                                return <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px' }}>{`Changed role from ${meta.old_role || 'N/A'} to ${meta.new_role || 'N/A'} for ${meta.target_email || 'user'}`}</div>;
                                            case 'user_signup':
                                                return <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px' }}>{`New user: ${meta.full_name || 'Unknown'} (${meta.email || 'N/A'}) as ${meta.system_role || 'user'}`}</div>;
                                            case 'user_deleted':
                                                return <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px' }}>{`Deleted user: ${meta.full_name || 'Unknown'} (${meta.email || 'N/A'})`}</div>;
                                            case 'workspace_created':
                                                return <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px' }}>{`Created workspace: "${meta.workspace_title || 'Untitled'}"`}</div>;
                                            case 'board_created':
                                                return <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '4px' }}>{`Created board: "${meta.board_title || 'Untitled'}" in workspace "${meta.workspace_title || 'Unknown'}"`}</div>;
                                            default:
                                                return (
                                                    <details style={{ marginTop: '6px' }}>
                                                        <summary style={{
                                                            fontSize: '12px',
                                                            color: 'hsl(var(--color-brand-primary))',
                                                            cursor: 'pointer',
                                                            outline: 'none',
                                                            fontWeight: 600,
                                                            display: 'inline-block'
                                                        }}>
                                                            View Details
                                                        </summary>
                                                        <pre style={{
                                                            fontSize: '11px',
                                                            color: 'hsl(var(--color-text-secondary))',
                                                            marginTop: '6px',
                                                            padding: '10px 12px',
                                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                                                            borderRadius: '10px',
                                                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                            overflowX: 'auto',
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-word',
                                                            fontFamily: 'monospace',
                                                            maxHeight: '260px',
                                                            overflowY: 'auto'
                                                        }}>
                                                            {JSON.stringify(meta, null, 2)}
                                                        </pre>
                                                    </details>
                                                );
                                        }
                                    })()}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }}>
                                    {new Date(log.created_at).toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
