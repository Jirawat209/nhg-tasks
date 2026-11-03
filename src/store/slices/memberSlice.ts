import type { StateCreator } from 'zustand';
import { APP_URL } from '../../lib/appUrl';
import { supabase } from '../../lib/supabase';
// import { v4 as uuidv4 } from 'uuid';
import type { Notification } from '../../types';
import type { BoardState } from '../useBoardStore';
import type { Item } from '../../types';
import { clearBoardUnlock } from '../../lib/boardPinUnlock';
import { mapDbDependency } from './itemDependencySlice';

// Helper to map DB item to Store type
const parseSqlJson = (val: any, fallback: any) => {
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return fallback; }
    }
    return val ?? fallback;
};

const mapDbItemToLocal = (i: any, existingItem?: Item): Item => {
    const updates = parseSqlJson(i.updates, existingItem?.updates ?? []);
    return {
        id: i.id ?? existingItem?.id,
        title: i.title ?? existingItem?.title ?? '',
        groupId: i.group_id ?? existingItem?.groupId ?? '',
        boardId: i.board_id ?? existingItem?.boardId ?? '',
        values: parseSqlJson(i.values, existingItem?.values ?? {}),
        isHidden: i.is_hidden ?? existingItem?.isHidden ?? false,
        notifyMutedUserIds: i.notify_muted_user_ids ?? existingItem?.notifyMutedUserIds ?? [],
        updates,
        files: parseSqlJson(i.files, existingItem?.files ?? []),
        order: i.order ?? existingItem?.order ?? 0,
        parentId: i.parent_id !== undefined ? i.parent_id : existingItem?.parentId,
        // A realtime row carries the whole updates array, so when one arrives it
        // is the truth — say so, or the comment badge would keep reporting the
        // count the board was opened with. Left untouched when the payload has
        // no updates at all, so the caller's spread keeps what it already had.
        ...(i.updates !== undefined ? { updates, updatesLoaded: true, updatesCount: updates.length } : {})
    };
};

export interface MemberSlice {
    activeBoardMembers: any[];
    isLoadingMembers: boolean;
    sharedBoardIds: string[];

    // Member Actions
    inviteToBoard: (boardId: string, email: string, role: string) => Promise<void>;
    getBoardMembers: (boardId: string, includeInactive?: boolean) => Promise<any[]>;
    updateMemberRole: (memberId: string, newRole: string, type: 'workspace' | 'board') => Promise<void>;
    removeMember: (memberId: string, type: 'workspace' | 'board') => Promise<void>;
    adminAddBoardMember: (boardId: string, userId: string, role: string) => Promise<void>;
    adminGetOwnedContentCount: (userId: string) => Promise<{ workspaces: number; boards: number }>;
    adminTransferAllOwnership: (fromUserId: string, toUserId: string) => Promise<{ workspaces: number; boards: number }>;
    
    // Person Column Assignment Helpers
    inviteAndAssignUser: (boardId: string, userId: string, role: string, itemId: string, columnId: string) => Promise<void>;
    inviteNewEmailToItem: (boardId: string, email: string, role: string, itemId: string, columnId: string) => Promise<void>;
    assignMemberToItem: (boardId: string, userId: string, itemId: string, columnId: string) => Promise<void>;
    
    searchUsers: (query: string) => Promise<any[]>;

    // Realtime & Logging
    logActivity: (actionType: string, targetType: string, targetId: string, metadata?: any) => Promise<void>;
    subscribeToRealtime: () => void;
    unsubscribeFromRealtime: () => void;
    realtimeSubscription: any;

    // Notifications
    notifications: Notification[];
    loadNotifications: () => Promise<void>;
    startNotificationSubscription: () => void; // New helper to init listener
    markNotificationAsRead: (id: string) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
    dismissNotification: (id: string) => Promise<void>;
    handleAcceptInvite: (notification: Notification) => Promise<void>;
    handleDeclineInvite: (notification: Notification) => Promise<void>;
    createNotification: (userId: string, type: string, content: string, entityId?: string, extraData?: any) => Promise<void>;
}

export const createMemberSlice: StateCreator<
    BoardState,
    [],
    [],
    MemberSlice
> = (set, get) => ({
    activeBoardMembers: [],
    isLoadingMembers: false,
    sharedBoardIds: [],
    realtimeSubscription: null,
    notifications: [],

    getBoardMembers: async (boardId, includeInactive = false) => {
        const { data, error } = await supabase
            .from('board_members')
            .select('id, user_id, role, board_id, profiles(id, full_name, email, avatar_url, is_active)')
            .eq('board_id', boardId);
        if (error) throw error;
        const rows = data || [];
        // Deactivated people stay in board_members — they are hidden, not removed —
        // so the filter lives here, where every avatar stack, person picker and
        // @mention list gets its members from. The admin console passes
        // includeInactive so it can still see and manage them.
        if (includeInactive) return rows;
        return rows.filter((m: any) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return profile?.is_active !== false;
        });
    },

    inviteToBoard: async (boardId, email, role) => {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { data: inviterProfile } = await supabase.from('profiles').select('full_name').eq('id', currentUser?.id).single();
        const inviterName = inviterProfile?.full_name || 'A Team Member';

        const { data: boardData } = await supabase.from('boards').select('workspace_id, title').eq('id', boardId).single();
        const boardName = boardData?.title || 'Board';

        const { data: foundUser } = await supabase.from('profiles').select('id, full_name').eq('email', email).single();
        if (foundUser) {
            // Automatically add member directly
            await supabase.from('board_members').insert({
                board_id: boardId,
                user_id: foundUser.id,
                role
            });

            // Refresh activeBoardMembers so the new member appears in @mention immediately
            set({ activeBoardMembers: await get().getBoardMembers(boardId) });

            // Ensure workspace access as board-guest if they don't have workspace access
            // NOTE: Removed insertion of `board-guest` to `workspace_members` per user request.

            const workspaceTitle = get().workspaces.find(w => w.id === boardData?.workspace_id)?.title || 'NHG Tasks';

            // Existing users are added straight away with nothing to accept, so
            // this is an access-granted notice rather than an invitation — the
            // default 'invite' action would have sent them a magic-link invite
            // email for access they already have.
            const { error: fnError } = await supabase.functions.invoke('invite-user', {
                body: {
                    email,
                    action: 'access_granted',
                    boardId,
                    boardName,
                    targetType: 'board',
                    targetName: boardName,
                    role,
                    workspaceId: boardData?.workspace_id,
                    workspaceName: workspaceTitle,
                    inviterName,
                    accessLink: `${APP_URL}/?boardId=${boardId}`,
                    redirectTo: `${APP_URL}/board/${boardId}`
                }
            });

            if (fnError) {
                console.error('Access Granted Email Error (Board):', fnError);
            }

            // Send in-app notification without accept action
            await get().createNotification(
                foundUser.id,
                'access_granted',
                `You have been added to board`,
                boardId,
                { role, boardName: boardData?.title || 'Board', workspaceName: workspaceTitle, board_id: boardId }
            );
        } else {
            const workspaceTitle = get().workspaces.find(w => w.id === boardData?.workspace_id)?.title || 'NHG Tasks';
            
            // Call Edge Function to send email invite and record pending
            const { data: responseData, error: fnError } = await supabase.functions.invoke('invite-user', {
                body: { 
                    email, 
                    boardId, 
                    boardName,
                    workspaceId: boardData?.workspace_id,
                    workspaceName: workspaceTitle,
                    inviterName,
                    redirectTo: `${APP_URL}/board/${boardId}`
                }
            });
            
            if (fnError) {
                console.error('Edge Function Invite Error:', fnError);
                // Fallback to manual insert if function fails
                await supabase.from('pending_invites').insert({
                    email,
                    board_id: boardId,
                    workspace_id: boardData?.workspace_id,
                    role
                });
            } else if (responseData?.userId) {
                // Automatically add the new user to board_members
                await supabase.from('board_members').insert({
                    board_id: boardId,
                    user_id: responseData.userId,
                    role
                });

                if (boardData?.workspace_id) {
                    const { count: wsCount } = await supabase.from('workspace_members')
                        .select('id', { count: 'exact', head: true })
                        .eq('workspace_id', boardData.workspace_id)
                        .eq('user_id', responseData.userId);

                    if (!wsCount) {
                        await supabase.from('workspace_members').insert({
                            workspace_id: boardData.workspace_id,
                            user_id: responseData.userId,
                            role: 'board-guest'
                        });
                    }
                }
            }
        }

        get().logActivity('board_invite_sent', 'board', boardId, { board_id: boardId, email, role });
    },

    adminAddBoardMember: async (boardId, userId, role) => {
        const { count } = await supabase.from('board_members')
            .select('id', { count: 'exact', head: true })
            .eq('board_id', boardId)
            .eq('user_id', userId);
        if (count) return;

        const { error } = await supabase.from('board_members').insert({
            board_id: boardId,
            user_id: userId,
            role
        });
        if (error) throw error;

        get().logActivity('board_member_added_by_admin', 'board', boardId, { user_id: userId, role });
    },

    adminGetOwnedContentCount: async (userId) => {
        const [{ count: workspaces }, { count: boards }] = await Promise.all([
            supabase.from('workspaces').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
            supabase.from('board_members').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'owner')
        ]);
        return { workspaces: workspaces || 0, boards: boards || 0 };
    },

    adminTransferAllOwnership: async (fromUserId, toUserId) => {
        const { data, error } = await supabase.rpc('admin_transfer_ownership', {
            from_user: fromUserId,
            to_user: toUserId
        });
        if (error) throw error;
        return { workspaces: data?.workspaces || 0, boards: data?.boards || 0 };
    },

    updateMemberRole: async (memberId, newRole, type) => {
        const table = type === 'workspace' ? 'workspace_members' : 'board_members';
        await supabase.from(table).update({ role: newRole }).eq('id', memberId);
        if (type === 'board' && get().activeBoardId) {
            set({ activeBoardMembers: await get().getBoardMembers(get().activeBoardId!) });
        }
        get().logActivity('member_role_updated', type, memberId, { member_id: memberId, new_role: newRole });
    },
    removeMember: async (memberId, type) => {
        const table = type === 'workspace' ? 'workspace_members' : 'board_members';

        if (type === 'workspace') {
            // 1. Get user_id and workspace_id for the member being removed
            const { data: memberData } = await supabase
                .from('workspace_members')
                .select('user_id, workspace_id')
                .eq('id', memberId)
                .single();

            if (memberData) {
                const { user_id, workspace_id } = memberData;

                // 2. Remove from workspace_members
                await supabase.from('workspace_members').delete().eq('id', memberId);

                // 3. Find all boards in this workspace
                const { data: wsBoards } = await supabase
                    .from('boards')
                    .select('id')
                    .eq('workspace_id', workspace_id);

                if (wsBoards && wsBoards.length > 0) {
                    const boardIds = wsBoards.map(b => b.id);
                    // 4. Remove the user from all board_members within those boards
                    await supabase
                        .from('board_members')
                        .delete()
                        .eq('user_id', user_id)
                        .in('board_id', boardIds);
                }
            }
        } else {
            // Direct board member removal
            await supabase.from(table).delete().eq('id', memberId);
        }

        if (type === 'board' && get().activeBoardId) {
            set({ activeBoardMembers: await get().getBoardMembers(get().activeBoardId!) });
        }
        get().logActivity('member_removed', type, memberId, { member_id: memberId });
    },

    searchUsers: async (query) => {
        // Deactivated accounts are excluded everywhere this feeds: @mentions, the
        // person picker's search, and the invite/add-member forms.
        if (!query) {
            // Empty query: return first 8 users for @mention default list
            const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').eq('is_active', true).limit(8);
            return data || [];
        }
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('is_active', true)
            .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
            .limit(8);
        return data || [];
    },

    inviteAndAssignUser: async (boardId, userId, role, itemId, columnId) => {
        // 1. Give them access to the board
        await supabase.from('board_members').insert({ board_id: boardId, user_id: userId, role });
        // 2. Assign them to the item
        await get().updateItemValue(itemId, columnId, [userId]);
        
        // 3. Send Existing User template email
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).single();
        const { data: boardData } = await supabase.from('boards').select('workspace_id, title').eq('id', boardId).single();
        
        const workspaceTitle = get().workspaces.find(w => w.id === boardData?.workspace_id)?.title || 'NHG Tasks';
        
        if (profile?.email) {
            await supabase.functions.invoke('invite-user', {
                body: { 
                    email: profile.email, 
                    boardId, 
                    workspaceId: boardData?.workspace_id,
                    workspaceName: workspaceTitle,
                    redirectTo: `${APP_URL}/board/${boardId}`,
                    action: 'invite'
                }
            });
        }
    },

    inviteNewEmailToItem: async (boardId, email, role, itemId, columnId) => {
        const { data: boardData } = await supabase.from('boards').select('workspace_id, title').eq('id', boardId).single();
        
        const workspaceTitle = get().workspaces.find(w => w.id === boardData?.workspace_id)?.title || 'NHG Tasks';
        
        // 1. Call Edge Function to create/generate auth link and push New User email
        const { data: responseData, error: fnError } = await supabase.functions.invoke('invite-user', {
            body: { 
                email, 
                boardId, 
                workspaceId: boardData?.workspace_id,
                workspaceName: workspaceTitle,
                redirectTo: `${APP_URL}/board/${boardId}`,
                action: 'invite'
            }
        });

        if (fnError) {
            console.error('Edge Function Invite Error:', fnError);
            return;
        }

        const newUserId = responseData?.userId;
        if (newUserId) {
            // Give access and assign
            await supabase.from('board_members').insert({ board_id: boardId, user_id: newUserId, role });
            await get().updateItemValue(itemId, columnId, [newUserId]);
        }
    },

    assignMemberToItem: async (boardId, userId, itemId, columnId) => {
        // 1. Get current assigned users and merge with new
        const board = get().boards.find(b => b.id === boardId);
        const item = board?.items.find(i => i.id === itemId);
        
        const currentValue = item?.values?.[columnId];
        let selectedIds = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
        
        // Check if toggling off or on
        const isRemoving = selectedIds.includes(userId);
        const newValues = isRemoving 
            ? selectedIds.filter((id: string) => id !== userId) 
            : [...selectedIds, userId];
        
        // 2. Update value in DB
        await get().updateItemValue(itemId, columnId, newValues);

        // 3. Notify + send "You're assigned" email only if we just ADDED them
        if (!isRemoving) {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            const { data: inviterProfile } = await supabase.from('profiles').select('full_name').eq('id', currentUser?.id).single();
            const inviterName = inviterProfile?.full_name
                || currentUser?.user_metadata?.full_name
                || currentUser?.user_metadata?.name
                || currentUser?.email?.split('@')[0]
                || 'A Team Member';

            // In-app notification (skip if assigning yourself — nothing to alert).
            if (userId !== currentUser?.id) {
                await get().createNotification(
                    userId,
                    'assignment',
                    `${inviterName} assigned you to "${item?.title || 'a task'}"`,
                    itemId,
                    { board_id: boardId }
                );
            }

            const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).single();
            const workspaceTitle = get().workspaces.find(w => w.id === board?.workspaceId)?.title || 'NHG Tasks';
            const groupName = board?.groups.find(g => g.id === item?.groupId)?.title || '';

            if (profile?.email && item?.title && board?.title) {
                await supabase.functions.invoke('invite-user', {
                    body: {
                        email: profile.email,
                        action: 'assign_item',
                        itemName: item.title,
                        boardName: board.title,
                        groupName,
                        workspaceName: workspaceTitle,
                        inviterName,
                        itemLink: `${APP_URL}/?boardId=${boardId}&itemId=${itemId}`,
                        redirectTo: `${APP_URL}/board/${boardId}`
                    }
                });
            }

            get().logActivity('item_assigned', 'item', itemId, { board_id: boardId, assignee_user_id: userId });
        }
    },

    logActivity: async (actionType, targetType, targetId, metadata) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { error } = await supabase.rpc('log_activity', {
                p_action_type: actionType,
                p_target_type: targetType,
                p_target_id: targetId,
                p_metadata: metadata || {}
            });
            if (error) console.error("Log failed", error);
        } catch (e) { console.error("Log failed", e); }
    },

    subscribeToRealtime: () => {
        const { realtimeSubscription } = get();
        if (realtimeSubscription) return;

        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;

            let hasSubscribed = false;
            let droppedSinceSubscribed = false;
            const channel = supabase.channel('app-realtime')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, (payload) => {
                    const newNotification = payload.new as Notification;
                    set(state => ({ notifications: [newNotification, ...state.notifications] }));
                    // When granted board/workspace access, silently reload so sharedBoardIds updates immediately
                    if (newNotification.type === 'access_granted') {
                        get().loadUserData(true);
                    }
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'items'
                }, (payload) => {
                    const { lastOptimisticUpdate, boards } = get();
                    const item = (payload.new || payload.old) as any;

                    // Fallback for missing board_id in UPDATE payload
                    let itemBoardId = item.board_id;
                    if (!itemBoardId && payload.eventType === 'UPDATE') {
                        // Search all loaded boards, not just the active one
                        for (const b of boards) {
                            if (!b.isDataLoaded) continue;
                            const found = b.items.find(i => i.id === item.id);
                            if (found) { itemBoardId = b.id; break; }
                        }
                    }

                    // Skip items for boards not yet loaded (no point updating state that isn't there)
                    // Allow updates for ANY loaded board — not just the active one — so that
                    // mirror items created by the linked-groups DB trigger are reflected immediately
                    // even when the user is looking at the other side.
                    if (!boards.find(b => b.id === itemBoardId)?.isDataLoaded) return;
                    if (payload.eventType === 'UPDATE' && lastOptimisticUpdate[item.id] && Date.now() - lastOptimisticUpdate[item.id] < 3000) {
                        return;
                    }

                    set(state => ({
                        boards: state.boards.map(b => {
                            if (b.id !== itemBoardId) return b;
                            
                            let newItems = [...b.items];
                            if (payload.eventType === 'INSERT') {
                                // Prevent duplicates
                                if (!newItems.find(i => i.id === item.id)) {
                                    newItems.push(mapDbItemToLocal(item));
                                }
                            } else if (payload.eventType === 'UPDATE') {
                                newItems = newItems.map(i => i.id === item.id ? { ...i, ...mapDbItemToLocal(item, i) } : i);
                            } else if (payload.eventType === 'DELETE') {
                                newItems = newItems.filter(i => i.id !== item.id);
                            }

                            // Refresh groups to reflect item changes
                            return {
                                ...b,
                                items: newItems,
                                groups: b.groups.map(g => ({
                                    ...g,
                                    items: newItems.filter(i => i.groupId === g.id).sort((a, b) => (a.order || 0) - (b.order || 0))
                                }))
                            };
                        })
                    }));
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'item_dependencies'
                }, (payload) => {
                    // Dependency arrows appear/disappear for everyone on the board.
                    // Only INSERT and DELETE exist — a link is never edited in place.
                    if (payload.eventType === 'INSERT') {
                        const row = payload.new as any;
                        if (!get().boards.find(b => b.id === row.board_id)?.isDataLoaded) return;
                        // Skip our own optimistic row coming back to us.
                        if (get().itemDependencies.some(d => d.id === row.id)) return;
                        set(state => ({ itemDependencies: [...state.itemDependencies, mapDbDependency(row)] }));
                    } else if (payload.eventType === 'DELETE') {
                        const removedId = (payload.old as any)?.id;
                        if (!removedId) return;
                        set(state => ({ itemDependencies: state.itemDependencies.filter(d => d.id !== removedId) }));
                    }
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'groups'
                }, (payload) => {
                    const { activeBoardId } = get();
                    const group = (payload.new || payload.old) as any;
                    if (group.board_id !== activeBoardId) return;

                    set(state => ({
                        boards: state.boards.map(b => {
                            if (b.id !== group.board_id) return b;

                            let newGroups = [...b.groups];
                            if (payload.eventType === 'INSERT') {
                                if (!newGroups.find(g => g.id === group.id)) {
                                    newGroups.push({ ...group, items: [] });
                                }
                            } else if (payload.eventType === 'UPDATE') {
                                newGroups = newGroups.map(g => g.id === group.id ? { 
                                    ...g, 
                                    title: group.title, 
                                    color: group.color, 
                                    order: group.order 
                                } : g);
                            } else if (payload.eventType === 'DELETE') {
                                newGroups = newGroups.filter(g => g.id !== group.id);
                            }

                            return { ...b, groups: newGroups.sort((a, b) => (a.order || 0) - (b.order || 0)) };
                        })
                    }));
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'columns'
                }, (payload) => {
                    const column = (payload.new || payload.old) as any;
                    const { lastOptimisticUpdate } = get();
                    // Editing labels (e.g. typing in Edit Labels) writes on every
                    // keystroke; its own echo can arrive after a later keystroke's
                    // local update and stomp it, making text flash and revert
                    // mid-typing. Same guard items already use for this reason.
                    if (payload.eventType === 'UPDATE' && lastOptimisticUpdate[column.id] && Date.now() - lastOptimisticUpdate[column.id] < 3000) {
                        return;
                    }
                    set(state => ({
                        boards: state.boards.map(b => {
                            if (b.id !== column.board_id) return b;
                            let newColumns = [...b.columns];
                            const options = typeof column.options === 'string' ? JSON.parse(column.options) : (column.options || []);
                            
                            if (payload.eventType === 'INSERT') {
                                if (!newColumns.find(c => c.id === column.id)) {
                                    newColumns.push({
                                        id: column.id,
                                        title: column.title,
                                        type: column.type,
                                        order: column.order,
                                        width: column.width,
                                        options,
                                        scope: column.scope === 'subitem' ? 'subitem' : 'item',
                                        groupId: column.group_id || undefined
                                    });
                                }
                            } else if (payload.eventType === 'UPDATE') {
                                newColumns = newColumns.map(c => c.id === column.id ? {
                                    ...c,
                                    title: column.title,
                                    type: column.type,
                                    order: column.order,
                                    width: column.width,
                                    options,
                                    scope: column.scope === 'subitem' ? 'subitem' : 'item',
                                    groupId: column.group_id || undefined
                                } : c);
                            } else if (payload.eventType === 'DELETE') {
                                newColumns = newColumns.filter(c => c.id !== column.id);
                            }
                            return { ...b, columns: newColumns.sort((a, b) => a.order - b.order) };
                        })
                    }));
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'boards'
                }, (payload) => {
                    const board = (payload.new || payload.old) as any;

                    // Force-lock: if this board just became private, drop any
                    // existing PIN unlock for it so the lock screen re-appears
                    // immediately, even if this client already had it open.
                    // (payload.old only reliably has the primary key, not the full
                    // previous row, so compare against local state instead.)
                    if (payload.eventType === 'UPDATE' && board.is_private) {
                        const prevBoard = get().boards.find(b => b.id === board.id);
                        if (prevBoard && !prevBoard.is_private) {
                            clearBoardUnlock(board.id);
                        }
                    }

                    set(state => {
                        let newBoards = [...state.boards];
                        if (payload.eventType === 'INSERT') {
                            if (!newBoards.find(b => b.id === board.id)) {
                                newBoards.push({
                                    id: board.id,
                                    workspaceId: board.workspace_id,
                                    title: board.title,
                                    is_archived: board.is_archived || false,
                                    is_private: board.is_private || false,
                                    columns: [],
                                    groups: [],
                                    items: [],
                                    itemColumnTitle: 'Item',
                                    itemColumnWidth: 350
                                });
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            newBoards = newBoards.map(b => b.id === board.id ? {
                                ...b,
                                title: board.title,
                                is_archived: board.is_archived,
                                is_private: board.is_private
                            } : b);
                        } else if (payload.eventType === 'DELETE') {
                            newBoards = newBoards.filter(b => b.id !== board.id);
                        }
                        return { boards: newBoards };
                    });
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'workspaces'
                }, (payload) => {
                    const ws = (payload.new || payload.old) as any;
                    set(state => {
                        let newWorkspaces = [...state.workspaces];
                        if (payload.eventType === 'INSERT') {
                            if (!newWorkspaces.find(w => w.id === ws.id)) {
                                newWorkspaces.push({
                                    id: ws.id,
                                    title: ws.title,
                                    order: ws.order,
                                    owner_id: ws.owner_id
                                });
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            newWorkspaces = newWorkspaces.map(w => w.id === ws.id ? { ...w, title: ws.title, order: ws.order } : w);
                        } else if (payload.eventType === 'DELETE') {
                            newWorkspaces = newWorkspaces.filter(w => w.id !== ws.id);
                        }
                        return { workspaces: newWorkspaces.sort((a,b) => a.order - b.order) };
                    });
                })
                .subscribe((status) => {
                    // A dropped channel (laptop asleep, network blip) rejoins on its
                    // own, but changes made while it was down are not replayed. The
                    // open board would stay as it was — someone else's new group
                    // still showing its old name, say, until they renamed it over
                    // the top. So once it's back, re-read the board in full.
                    if (status === 'SUBSCRIBED') {
                        if (hasSubscribed && droppedSinceSubscribed) {
                            const { activeBoardId } = get();
                            if (activeBoardId) void get().loadBoardData(activeBoardId, false, true);
                        }
                        hasSubscribed = true;
                        droppedSinceSubscribed = false;
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        droppedSinceSubscribed = true;
                    }
                });

            set({ realtimeSubscription: channel });
        });
    },
    unsubscribeFromRealtime: () => {
        const sub = get().realtimeSubscription;
        if (sub) supabase.removeChannel(sub);
        set({ realtimeSubscription: null });
    },

    // Notifications
    loadNotifications: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            // Client-side filter for accepted/declined to keep history clean if desired, 
            // or just show them. Let's filter out 'accepted' and 'declined' from the main list 
            // if we want them to disappear after action.
            const activeNotifications = data.filter((n: any) => {
                const status = n.data?.status;
                return status !== 'accepted' && status !== 'declined';
            });
            set({ notifications: activeNotifications });
        }
    },
    startNotificationSubscription: () => {
        get().subscribeToRealtime();
    },
    markNotificationAsRead: async (id) => {
        set(state => ({ notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n) }));
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    },
    markAllNotificationsAsRead: async () => {
        set(state => ({ notifications: state.notifications.map(n => ({ ...n, is_read: true })) }));
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    },
    dismissNotification: async (id) => {
        set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
        await supabase.from('notifications').delete().eq('id', id);
    },

    handleAcceptInvite: async (notification) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { type, entity_id, data } = notification;
            const role = data?.role || 'member';

            if (type === 'board_invite' && entity_id) {
                const { count } = await supabase.from('board_members').select('*', { count: 'exact', head: true })
                    .eq('board_id', entity_id).eq('user_id', user.id);

                if (!count) {
                    await supabase.from('board_members').insert({
                        board_id: entity_id,
                        user_id: user.id,
                        role
                    });

                    // NOTE: Removed insertion of `board-guest` to `workspace_members` per user request.
                }
            } else if (type === 'workspace_invite' && entity_id) {
                const { count } = await supabase.from('workspace_members').select('*', { count: 'exact', head: true })
                    .eq('workspace_id', entity_id).eq('user_id', user.id);

                if (!count) {
                    await supabase.from('workspace_members').insert({
                        workspace_id: entity_id,
                        user_id: user.id,
                        role
                    });
                }
            }

            // Update status in JSON data
            const newData = { ...data, status: 'accepted' };
            await supabase.from('notifications').update({ data: newData, is_read: true }).eq('id', notification.id);

            // Refresh
            get().loadNotifications();
            get().loadUserData(true);

            if (entity_id) {
                get().logActivity('invite_accepted', type === 'board_invite' ? 'board' : 'workspace', entity_id, { role });
            }
        } catch (e) {
            console.error("Accept invite failed:", e);
        }
    },

    handleDeclineInvite: async (notification) => {
        try {
            const newData = { ...notification.data, status: 'declined' };
            await supabase.from('notifications').update({ data: newData, is_read: true }).eq('id', notification.id);
            get().loadNotifications();

            const { type, entity_id } = notification;
            if (entity_id) {
                get().logActivity('invite_declined', type === 'board_invite' ? 'board' : 'workspace', entity_id, {});
            }
        } catch (e) {
            console.error("Decline invite failed:", e);
        }
    },

    createNotification: async (userId, type, content, entityId, extraData) => {
        const notificationData = { ...extraData, status: 'pending' };
        await supabase.from('notifications').insert({
            user_id: userId,
            type,
            content,
            entity_id: entityId,
            data: notificationData,
            is_read: false
        });
    }
});
