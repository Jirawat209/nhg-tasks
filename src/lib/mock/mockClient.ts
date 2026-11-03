// Assembles the subset of the supabase-js client surface this codebase uses
// (from/auth/rpc/functions/storage/channel/removeChannel) on top of the
// in-memory mockDb. This is the object exported as `supabase` everywhere.

import { from } from './mockPostgrest';
import { mockAuth } from './mockAuth';
import { mockFunctions } from './mockFunctions';
import { mockStorage } from './mockStorage';
import { mockRealtime } from './mockRealtime';
import { mockDb } from './mockDb';

function applyOrder(table: string, ids: string[]) {
    if (!Array.isArray(ids)) return;
    const rows = mockDb.get(table);
    ids.forEach((id, idx) => {
        const row = rows.find((r: any) => r.id === id);
        if (row) row.order = idx;
    });
    mockDb.set(table, rows);
}

function handleRpc(fnName: string, params: any): { data: any; error: any } {
    switch (fnName) {
        case 'log_activity': {
            const logs = mockDb.get('activity_logs');
            const id = crypto.randomUUID();
            const profiles = mockDb.get('profiles');
            logs.push({
                id, action_type: params.p_action_type, target_type: params.p_target_type,
                target_id: params.p_target_id, metadata: params.p_metadata || {},
                actor_id: profiles[0]?.id, created_at: new Date().toISOString()
            });
            mockDb.set('activity_logs', logs);
            return { data: id, error: null };
        }

        case 'delete_user': {
            const profiles = mockDb.get('profiles');
            const target = profiles.find((p: any) => p.id === params.user_id);
            if (!target) return { data: { success: false, error: 'User not found' }, error: null };
            mockDb.set('profiles', profiles.filter((p: any) => p.id !== params.user_id));
            ['board_members', 'workspace_members', 'notifications'].forEach(t => {
                mockDb.set(t, mockDb.get(t).filter((r: any) => r.user_id !== params.user_id && r.actor_id !== params.user_id));
            });
            return { data: { success: true }, error: null };
        }

        case 'reorder_boards': applyOrder('boards', params._board_ids); return { data: null, error: null };
        case 'reorder_columns': applyOrder('columns', params._column_ids); return { data: null, error: null };
        case 'reorder_groups': applyOrder('groups', params._group_ids); return { data: null, error: null };
        case 'reorder_items': applyOrder('items', params._item_ids); return { data: null, error: null };
        case 'reorder_workspaces': applyOrder('workspaces', params._workspace_ids); return { data: null, error: null };

        case 'admin_dashboard_stats': {
            // Same shape as the real admin_dashboard_stats (read by src/lib/activityStats.ts).
            const profiles = mockDb.get('profiles').filter((p: any) => p.is_active !== false);
            const boards = mockDb.get('boards').filter((b: any) => !b.is_archived);
            const items = mockDb.get('items');
            const logs = mockDb.get('activity_logs');
            const updatesOf = (rows: any[]) => rows.reduce((n, i) => n + (i.updates_count || (i.updates || []).length || 0), 0);
            const totalUpdates = updatesOf(items);

            const today = new Date();
            const daily = Array.from({ length: 30 }, (_, k) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (29 - k));
                const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const signedIn = logs.filter((l: any) => l.action_type === 'user_login' && String(l.created_at).startsWith(day));
                const users = profiles
                    .filter((p: any) => signedIn.some((l: any) => l.actor_id === p.id) || (k === 29 && p.system_role === 'super_admin'))
                    .map((p: any) => ({ name: p.full_name, email: p.email }));
                return { day, users };
            });

            const person = (p: any) => {
                const owned = items.filter((i: any) => (i.created_by || null) === p.id).length;
                return { user_id: p.id, name: p.full_name, avatar_url: p.avatar_url, weeks: [0, 0, 0, owned], total: owned };
            };

            return {
                data: {
                    summary: {
                        boards_updated: boards.length,
                        people_posted: profiles.length,
                        updates: totalUpdates,
                        contributed: profiles.length,
                        signed_in: daily[29].users.length
                    },
                    joined: profiles.length,
                    daily,
                    boards: boards.map((b: any) => {
                        const own = items.filter((i: any) => i.board_id === b.id);
                        return { board_id: b.id, title: b.title, items: own.length, updates: updatesOf(own) };
                    }),
                    creators: profiles.map(person),
                    communicators: profiles.map(person)
                },
                error: null
            };
        }

        case 'admin_transfer_ownership': {
            const workspaces = mockDb.get('workspaces');
            let wCount = 0;
            workspaces.forEach((w: any) => {
                if (w.owner_id === params.from_user) { w.owner_id = params.to_user; wCount++; }
            });
            mockDb.set('workspaces', workspaces);
            return { data: { workspaces: wCount, boards: 0 }, error: null };
        }

        case 'get_workspace_activity': {
            const profiles = mockDb.get('profiles');
            const rows = mockDb.get('activity_logs')
                .filter((l: any) => l.metadata?.workspace_id === params.p_workspace_id || l.target_id === params.p_workspace_id)
                .slice(0, params.p_limit || 30)
                .map((l: any) => {
                    const actor = profiles.find((p: any) => p.id === l.actor_id);
                    return { ...l, actor_name: actor?.full_name, actor_email: actor?.email };
                });
            return { data: rows, error: null };
        }

        case 'set_item_notifications':
            return { data: null, error: null };

        default:
            return { data: null, error: null };
    }
}

function rpc(fnName: string, params?: any) {
    return Promise.resolve(handleRpc(fnName, params || {}));
}

export const mockSupabaseClient: any = {
    from,
    auth: mockAuth,
    rpc,
    functions: mockFunctions,
    storage: mockStorage,
    channel: mockRealtime.channel,
    removeChannel: mockRealtime.removeChannel
};
