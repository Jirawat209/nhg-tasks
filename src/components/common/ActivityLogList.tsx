import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { tintLabel } from '../../lib/labelTint';

export interface ActivityLogListProps {
    scope: 'global' | 'board' | 'item';
    targetId?: string;
    maxHeight?: string;
    showHeader?: boolean;
    onClose?: () => void;
}

export interface ActivityLog {
    id: string;
    created_at: string;
    actor_id: string | null;
    action_type: string;
    target_type: string | null;
    target_id: string | null;
    metadata: any;
    actor_name?: string;
    actor_email?: string;
    actor_avatar?: string;
}


const ACTION_LABELS: Record<string, string> = {
    user_signup: 'User Signup',
    role_updated: 'Role Updated',
    user_deleted: 'User Deleted',
    workspace_created: 'Workspace Created',
    workspace_deleted: 'Workspace Deleted',
    workspace_renamed: 'Workspace Renamed',
    workspace_duplicated: 'Workspace Duplicated',
    workspace_invite_sent: 'Workspace Invite Sent',
    workspace_ownership_transferred: 'Ownership Transferred',
    board_created: 'Board Created',
    board_deleted: 'Board Deleted',
    board_restored: 'Board Restored',
    board_duplicated: 'Board Duplicated',
    board_moved: 'Board Moved',
    board_move_undone: 'Board Move Undone',
    items_moved: 'Tasks Moved',
    items_move_undone: 'Move Undone',
    item_notifications_on: 'Notifications On',
    item_notifications_off: 'Notifications Off',
    board_imported: 'Board Imported',
    board_invite_sent: 'Board Invite Sent',
    invite_accepted: 'Invite Accepted',
    invite_declined: 'Invite Declined',
    member_role_updated: 'Member Role Updated',
    member_removed: 'Member Removed',

    group_created: 'Group Created',
    group_deleted: 'Group Deleted',
    group_restored: 'Group Restored',
    group_renamed: 'Group Renamed',
    group_linked: 'Group Linked',
    group_unlinked: 'Group Unlinked',

    column_created: 'Column Added',
    column_deleted: 'Column Deleted',
    column_renamed: 'Column Renamed',

    item_created: 'Task Created',
    item_deleted: 'Task Deleted',
    item_restored: 'Task Restored',
    item_renamed: 'Task Renamed',
    item_status_updated: 'Status Changed',
    item_value_updated: 'Item Updated',
    item_comment_added: 'Update Posted',
    item_mention: 'Mentioned',
    item_assigned: 'Task Assigned',
};

// Exported so the workspace dashboard's feed renders entries exactly as the
// board's activity panel does, rather than keeping a second, thinner copy.
// boardName is for feeds that span boards, where "which board" is the missing
// context; the board's own panel doesn't need it.
export const ActivityLogItem = ({
    log,
    onClickTask,
    onClickBoard,
    boardId,
    boardName
}: {
    log: ActivityLog;
    onClickTask: (id: string, boardId?: string) => void;
    onClickBoard?: (boardId: string) => void;
    boardId?: string;
    boardName?: string;
}) => {
    const [imgError, setImgError] = useState(false);

    const { action_type, metadata, actor_name, actor_email, actor_avatar, created_at } = log;
    const label = ACTION_LABELS[action_type] || action_type.replace(/_/g, ' ');

    // Helper: Truncate
    const truncate = (str: string, length: number = 50) => {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    };

    const statusBadgeStyle = (rawColor?: string): React.CSSProperties => ({
        backgroundColor: tintLabel(rawColor || '#797E93'),
        color: '#FFEFD2',
        padding: '2px 7px',
        borderRadius: '6px',
        fontSize: '10.5px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        display: 'inline-block',
        lineHeight: 1.35
    });

    // Helper: Description Renderer
    const renderDescription = () => {
        const meta = metadata || {};
        const itemTitle = meta.item_title ? `"${meta.item_title}"` : 'this task';

        // Helper to format generic values
        const formatVal = (val: any) => {
            if (val === null || val === undefined || val === '') return 'Empty';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        };

        const formatDate = (dateStr: string) => {
            if (!dateStr) return 'Empty';
            try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
            catch (e) { return dateStr; }
        };

        switch (action_type) {
            case 'item_value_updated': {
                const colType = meta.column_type;
                const colName = meta.column_title;

                if (colType === 'date') {
                    const dateVal = formatDate(meta.new_value);
                    return <span>Set <strong>{colName}</strong> to <em>{dateVal}</em> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'timeline') {
                    const fromDate = formatDate(meta.new_value?.from);
                    const toDate = formatDate(meta.new_value?.to);
                    return <span>Set <strong>{colName}</strong> from <em>{fromDate}</em> to <em>{toDate}</em> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'text') {
                    return <span>Updated <strong>{colName}</strong> to "{truncate(formatVal(meta.new_value), 60)}" in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'link') {
                    return <span>Updated Link <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'people') {
                    return <span>Updated Person in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }
                if (colType === 'files') {
                    const added: string[] = meta.added_files || [];
                    const removed: string[] = meta.removed_files || [];
                    const parts: string[] = [];
                    if (added.length > 0) parts.push(`Added ${added.length > 1 ? `${added.length} files` : `"${truncate(added[0], 20)}"`}`);
                    if (removed.length > 0) parts.push(`Removed ${removed.length > 1 ? `${removed.length} files` : `"${truncate(removed[0], 20)}"`}`);
                    const actionText = parts.join(' and ') || 'Updated files';

                    return <span>{actionText} in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }
                // Checkbox
                if (colType === 'checkbox') {
                    return <span>{meta.new_value ? 'Checked' : 'Unchecked'} <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
                }
                // Dropdown (Fixed labels)
                if (colType === 'dropdown' || colType === 'status') {
                    return <span>Selected <strong>{meta.new_label}</strong> in <strong>{colName}</strong> for <strong>{itemTitle}</strong></span>;
                }

                // Fallback generic
                return <span>Updated <strong>{colName}</strong> in <strong>{itemTitle}</strong></span>;
            }

            case 'item_status_updated':
                return (
                    <span>
                        Changed status of <strong>{itemTitle}</strong> from{' '}
                        <span style={statusBadgeStyle(meta.old_color)}>{meta.old_label || 'None'}</span>{' '}
                        to <span style={statusBadgeStyle(meta.new_color)}>{meta.new_label}</span>
                    </span>
                );
            case 'item_created':
                return <span>Created task <strong>{itemTitle}</strong> in group <strong>{meta.group_title || 'Unknown Group'}</strong></span>;
            case 'item_renamed':
                return <span>Renamed task to <strong>{itemTitle}</strong></span>;
            case 'item_deleted':
                return meta.count
                    ? <span>Deleted <strong>{meta.count}</strong> tasks</span>
                    : <span>Deleted task <strong>{meta.item_title}</strong></span>;
            case 'item_restored':
                return <span>Restored task <strong>{meta.item_title}</strong></span>;
            case 'item_assigned':
                return <span>Assigned a task</span>;
            case 'group_restored':
                return <span>Restored group <strong>{meta.group_title}</strong></span>;
            case 'group_linked':
                return <span>Linked group <strong>{meta.group_title}</strong> to another board</span>;
            case 'group_unlinked':
                return <span>Unlinked group <strong>{meta.group_title}</strong></span>;
            case 'items_moved':
            case 'items_move_undone': {
                const undone = action_type === 'items_move_undone';
                const names = (meta.item_titles || []) as string[];
                const count = meta.count || names.length;
                const list = names.length > 0
                    ? <>{names.map((n, i) => <span key={i}>{i > 0 ? ', ' : ''}<strong>"{truncate(n, 40)}"</strong></span>)}{count > names.length ? <> and {count - names.length} more</> : null}</>
                    : <strong>{count} tasks</strong>;
                const sameBoard = (meta.from_board_id || meta.board_id) === meta.to_board_id;
                const fromGroups = ((meta.from_group_titles || []) as string[]).join(', ');
                return (
                    <span>
                        {undone ? 'Put back ' : 'Moved '}{list}
                        {undone
                            ? (sameBoard ? <> to {fromGroups ? <>group <strong>{fromGroups}</strong></> : 'their previous group'}</> : <> to <strong>{meta.from_board_title}</strong>{fromGroups ? <> › <strong>{fromGroups}</strong></> : null}, from <strong>{meta.to_board_title}</strong></>)
                            : (sameBoard
                                ? <> {fromGroups ? <>from group <strong>{fromGroups}</strong> </> : null}to {meta.as_subitems ? 'sub-items' : <>group <strong>{meta.to_group_title}</strong></>}</>
                                : <> from <strong>{meta.from_board_title}</strong>{fromGroups ? <> › <strong>{fromGroups}</strong></> : null} to <strong>{meta.to_board_title}</strong>{meta.to_group_title ? <> › <strong>{meta.to_group_title}</strong></> : null}</>)}
                    </span>
                );
            }
            case 'item_notifications_on':
            case 'item_notifications_off': {
                const who = ((meta.person_names || []) as string[]).join(', ');
                const on = action_type === 'item_notifications_on';
                return <span>{on ? 'Turned on' : 'Turned off'} notifications for <strong>{who || 'someone'}</strong> on <strong>{itemTitle}</strong></span>;
            }
            case 'board_moved':
            case 'board_move_undone':
                return <span>{action_type === 'board_moved' ? 'Moved' : 'Moved back'} board <strong>{meta.board_title}</strong>{meta.from_workspace_title ? <> from workspace <strong>{meta.from_workspace_title}</strong></> : null}{meta.to_workspace_title ? <> to <strong>{meta.to_workspace_title}</strong></> : null}</span>;
            case 'board_deleted':
                return <span>Deleted board <strong>{meta.board_title}</strong></span>;
            case 'board_restored':
                return <span>Restored board <strong>{meta.board_title}</strong></span>;
            case 'board_created':
                return <span>Created board <strong>{meta.board_title}</strong></span>;
            case 'workspace_renamed':
                return <span>Renamed workspace from <strong>{meta.old_title}</strong> to <strong>{meta.new_title}</strong></span>;
            case 'member_role_updated':
                return <span>Updated a member's role to <strong>{meta.new_role}</strong></span>;
            case 'member_removed':
                return <span>Removed a member</span>;
            case 'workspace_ownership_transferred':
                return <span>Transferred workspace ownership</span>;
            case 'column_renamed':
                return <span>Renamed column <strong>{meta.old_title}</strong> to <strong>{meta.new_title}</strong></span>;
            case 'item_comment_added':
                return <span>Posted an update on <strong>{itemTitle}</strong></span>;
            case 'item_mention':
                return (
                    <span>
                        Mentioned{' '}
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                            color: 'hsl(var(--color-brand-primary))',
                            padding: '1px 8px',
                            borderRadius: '999px',
                            fontWeight: 600,
                            fontSize: '11.5px'
                        }}>
                            @{meta.mentioned_user_name || 'someone'}
                        </span>
                        {' '}in <strong>{itemTitle}</strong>
                    </span>
                );

            // ... system events ...
            default:
                return <span>{action_type.replace(/_/g, ' ')}</span>;
        }
    };

    const resolvedBoardId = boardId || log.metadata?.board_id || log.metadata?.to_board_id || (log.target_type === 'board' ? log.target_id : undefined) || undefined;
    const itemId = (log.target_type === 'item' ? log.target_id : log.metadata?.item_id) || (Array.isArray(log.metadata?.item_ids) ? log.metadata.item_ids[0] : undefined);
    const isTaskClickable = !!itemId && action_type !== 'item_deleted';
    const isBoardClickable = !!resolvedBoardId && !!onClickBoard;
    const isClickable = isTaskClickable || isBoardClickable;

    const handleClick = (e: React.MouseEvent) => {
        if (!isClickable) return;
        e.stopPropagation();
        if (isTaskClickable && itemId) {
            onClickTask(itemId, resolvedBoardId);
        } else if (isBoardClickable && resolvedBoardId) {
            onClickBoard!(resolvedBoardId);
        }
    };

    return (
        <div
            onClick={handleClick}
            style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 14px',
                fontSize: '12.5px',
                color: 'hsl(var(--color-text-primary))',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
                borderRadius: '12px',
                backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                marginBottom: '8px',
                boxShadow: 'inset 0 1px 0 var(--card-edge, rgba(255,255,255,0.65))'
            }}
            onMouseEnter={(e) => {
                if (isClickable) {
                    e.currentTarget.style.backgroundColor = 'hsl(var(--paper-head, var(--color-bg-hover)))';
                    e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary) / 0.25)';
                }
            }}
            onMouseLeave={(e) => {
                if (isClickable) {
                    e.currentTarget.style.backgroundColor = 'hsl(var(--paper, var(--color-bg-surface)))';
                    e.currentTarget.style.borderColor = 'var(--paper-edge, hsl(var(--color-border)))';
                }
            }}
        >
            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
                <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: 'hsl(var(--color-brand-primary))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#FFEFD2',
                    boxShadow: '0 0 0 1.5px hsl(var(--paper, #fff))'
                }}>
                    {actor_avatar && !imgError ? (
                        <img
                            src={actor_avatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        (actor_name || actor_email || '?').substring(0, 1).toUpperCase()
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                        {actor_name || actor_email || 'Unknown User'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }}>
                        {new Date(created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>

                <div style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--color-brand-secondary, 36 100% 33%))',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {label}
                </div>

                <div style={{ color: 'hsl(var(--color-text-secondary))', lineHeight: 1.45 }}>
                    {renderDescription()}
                </div>

                {boardName && (
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            type="button"
                            onClick={(e) => {
                                if (isBoardClickable && resolvedBoardId) {
                                    e.stopPropagation();
                                    onClickBoard!(resolvedBoardId);
                                }
                            }}
                            title={`Open board "${boardName}"`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                backgroundColor: 'hsl(var(--color-brand-primary) / 0.05)',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'hsl(var(--color-brand-primary))',
                                cursor: isBoardClickable ? 'pointer' : 'default',
                                transition: 'background-color 0.15s'
                            }}
                        >
                            <span>in {boardName}</span>
                            {isBoardClickable && <ArrowUpRight size={11} />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export const ActivityLogList = ({ scope, targetId, showHeader = true, onClose }: ActivityLogListProps) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            // STRICT SCOPE CHECK: Prevent global leak
            if (scope !== 'global' && !targetId) {
                setLoading(false);
                return;
            }

            let query = supabase
                .from('activity_logs')
                .select(`
                    *,
                    profiles!activity_logs_actor_id_fkey (
                        full_name,
                        email,
                        avatar_url
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            // Apply Filters based on scope
            if (scope === 'board') {
                // Board Log: STRICTLY filter by board_id in metadata or target_id
                query = query.or(`target_id.eq.${targetId},metadata->>board_id.eq.${targetId}`);
            } else if (scope === 'item') {
                // Item Log: STRICTLY item events
                query = query.eq('target_id', targetId);
            }
            // scope === 'global' falls through (fetches everything)

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            const mapped: ActivityLog[] = (data || []).map((log: any) => ({
                ...log,
                actor_name: log.profiles?.full_name || 'System',
                actor_email: log.profiles?.email || 'N/A',
                actor_avatar: log.profiles?.avatar_url
            }));

            setLogs(mapped);
        } catch (err: any) {
            console.error('Error fetching logs:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (targetId || scope === 'global') {
            fetchLogs();
        }
    }, [scope, targetId]);

    const handleTaskClick = (itemId: string) => {
        useBoardStore.getState().setHighlightedItem(itemId);
        onClose && onClose();
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'transparent'
        }}>
            {showHeader && (
                <div style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'hsl(var(--color-text-primary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <span>Activity Log</span>
                    <button
                        onClick={fetchLogs}
                        className="glass-chip"
                        style={{
                            border: 'none',
                            cursor: 'pointer',
                            padding: '5px 8px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'hsl(var(--color-text-secondary))'
                        }}
                        title="Refresh"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px', backgroundColor: 'transparent', padding: '12px 4px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13px' }}>
                        Loading activities...
                    </div>
                ) : error ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--color-danger))', fontSize: '13px' }}>
                        Error: {error}
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', fontSize: '13px' }}>
                        No recent activity.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {logs.map(log => (
                            <ActivityLogItem key={log.id} log={log} onClickTask={handleTaskClick} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
