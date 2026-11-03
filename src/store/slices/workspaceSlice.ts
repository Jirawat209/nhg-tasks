import type { StateCreator } from 'zustand';
import { APP_URL } from '../../lib/appUrl';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { Workspace, Board, ColumnType, Column, Item } from '../../types';
import type { BoardState } from '../useBoardStore';
import { getDefaultStatusOptions } from '../../lib/statusDefaults';

export interface WorkspaceSlice {
    workspaces: Workspace[];
    activeWorkspaceId: string;
    sharedWorkspaceIds: string[];

    // Actions
    addWorkspace: (title: string) => Promise<void>;
    addSubWorkspace: (parentId: string, title: string) => Promise<void>;
    deleteWorkspace: (id: string) => Promise<void>;
    updateWorkspace: (id: string, title: string) => Promise<void>;
    setActiveWorkspace: (id: string) => void;
    duplicateWorkspace: (id: string) => Promise<void>;
    renameWorkspace: (id: string, newTitle: string) => Promise<void>;
    inviteToWorkspace: (workspaceId: string, email: string, role: string) => Promise<void>;
    getWorkspaceMembers: (workspaceId: string, includeInactive?: boolean) => Promise<any[]>;
    adminAddWorkspaceMember: (workspaceId: string, userId: string, role: string) => Promise<void>;
    reorderWorkspaces: (sourceId: string, destinationId: string) => Promise<void>;
    transferWorkspaceOwnership: (workspaceId: string, newOwnerUserId: string) => Promise<void>;
}

export const createWorkspaceSlice: StateCreator<
    BoardState,
    [],
    [],
    WorkspaceSlice
> = (set, get) => ({
    workspaces: [],
    activeWorkspaceId: '',
    sharedWorkspaceIds: [],

    setActiveWorkspace: (id) => {
        set({ activeWorkspaceId: id });
        localStorage.setItem('lastActiveWorkspaceId', id);
    },

    addWorkspace: async (title) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[AddWorkspace] No authenticated user found');
                return;
            }
            
            const newWsId = uuidv4();
            const { workspaces } = get();
            const order = workspaces.length;

            const newWorkspace: Workspace = { id: newWsId, title, order, owner_id: user.id };
            
            // Optimistic update
            set(state => ({
                workspaces: [...state.workspaces, newWorkspace],
                activeWorkspaceId: newWsId
            }));

            // 1. Create Workspace
            const { error: wsError } = await supabase.from('workspaces').insert({ id: newWsId, title, owner_id: user.id, order });
            if (wsError) {
                console.error('[AddWorkspace] Failed to create workspace row:', wsError);
                throw wsError;
            }

            // Create Default Template for new Workspace
            const boardId = uuidv4();
            const groupId = uuidv4();
            const itemId = uuidv4();

            const statusOptions = await getDefaultStatusOptions();
            const defaultColumns: Column[] = [
                {
                    id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: statusOptions
                },
                { id: uuidv4(), title: 'Files', type: 'files' as ColumnType, order: 1, width: 140 },
                { id: uuidv4(), title: 'Person', type: 'people' as ColumnType, order: 2, width: 140 },
                { id: uuidv4(), title: 'Timeline', type: 'timeline' as ColumnType, order: 3, width: 160 },
                { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 4, width: 140 },
                { id: uuidv4(), title: 'Text', type: 'text' as ColumnType, order: 5, width: 200 },
            ];

            const defaultGroups = [
                { id: groupId, title: 'Getting Started', color: '#2E7D8C', order: 0 }
            ];

            const statusCol = defaultColumns[0];
            const dateCol = defaultColumns[4];
            const doneOption = statusCol.options?.find(o => o.label.toLowerCase() === 'done');
            const defaultValues = {
                [statusCol.id]: (doneOption ?? statusCol.options?.[0])?.id,
                [dateCol.id]: new Date().toISOString().split('T')[0]
            };

            const newItem: Item = {
                id: itemId,
                title: 'My First Task',
                boardId: boardId,
                groupId: groupId,
                values: defaultValues,
                order: 0,
                updates: []
            };

            const newBoard: Board = {
                id: boardId,
                workspaceId: newWsId,
                title: 'Starting Board',
                columns: defaultColumns,
                groups: defaultGroups.map(g => ({ ...g, items: [newItem] })),
                items: [newItem],
                itemColumnTitle: 'Item',
                itemColumnWidth: 350,
                isDataLoaded: true
            };

            set(state => ({
                boards: [...state.boards, newBoard],
                activeBoardId: boardId
            }));

            // 2. Create Board
            const { error: brdError } = await supabase.from('boards').insert({ id: boardId, workspace_id: newWsId, title: 'Starting Board', order: 0 });
            if (brdError) {
                console.error('[AddWorkspace] Failed to create default board:', brdError);
                throw brdError;
            }

            // 3. Create Groups
            const { error: grpError } = await supabase.from('groups').insert(defaultGroups.map(g => ({ id: g.id, board_id: boardId, title: g.title, color: g.color, order: g.order })));
            if (grpError) console.error('[AddWorkspace] Group insertion error (non-fatal for UI):', grpError);

            // 4. Create Columns
            const { error: colError } = await supabase.from('columns').insert(defaultColumns.map(c => ({ id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width, options: c.options || [] })));
            if (colError) console.error('[AddWorkspace] Column insertion error (non-fatal for UI):', colError);

            // 5. Create Item
            const { error: itemError } = await supabase.from('items').insert({
                id: itemId,
                board_id: boardId,
                group_id: groupId,
                title: 'My First Task',
                values: defaultValues,
                order: 0
            });
            if (itemError) console.error('[AddWorkspace] Item insertion error (non-fatal for UI):', itemError);

            // 6. Create Board Member
            const { error: memError } = await supabase.from('board_members').insert({ board_id: boardId, user_id: user.id, role: 'owner' });
            if (memError) console.error('[AddWorkspace] Board member creation error:', memError);

            set(state => ({
                userWorkspaceRoles: { ...state.userWorkspaceRoles, [newWsId]: 'owner' },
                userBoardRoles: { ...state.userBoardRoles, [boardId]: 'owner' }
            }));
            
            // Removed loadUserData(true) to avoid UI flicker/race conditions with DB replication

            get().logActivity('workspace_created', 'workspace', newWsId, { workspace_title: title });
        } catch (err) {
            console.error('[AddWorkspace] Full Error context:', err);
            // Re-load to undo optimistic state if needed
            await get().loadUserData(true);
            throw err;
        }
    },

    addSubWorkspace: async (parentId, title) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[AddSubWorkspace] No authenticated user found');
                return;
            }
            
            const newWsId = uuidv4();
            const { workspaces } = get();
            const order = workspaces.filter(w => w.parentId === parentId).length;

            const newWorkspace: Workspace = { id: newWsId, title, order, owner_id: user.id, parentId };
            
            // Optimistic update
            set(state => ({
                workspaces: [...state.workspaces, newWorkspace],
                activeWorkspaceId: newWsId
            }));

            // 1. Create Workspace
            const { error: wsError } = await supabase.from('workspaces').insert({ id: newWsId, title, owner_id: user.id, order, parent_id: parentId });
            if (wsError) {
                console.error('[AddSubWorkspace] Failed to create workspace row:', wsError);
                throw wsError;
            }

            // Create Default Template for new Workspace
            const boardId = uuidv4();
            const groupId = uuidv4();
            const itemId = uuidv4();

            const statusOptions = await getDefaultStatusOptions();
            const defaultColumns: Column[] = [
                {
                    id: uuidv4(), title: 'Status', type: 'status' as ColumnType, order: 0, width: 140, options: statusOptions
                },
                { id: uuidv4(), title: 'Files', type: 'files' as ColumnType, order: 1, width: 140 },
                { id: uuidv4(), title: 'Person', type: 'people' as ColumnType, order: 2, width: 140 },
                { id: uuidv4(), title: 'Timeline', type: 'timeline' as ColumnType, order: 3, width: 160 },
                { id: uuidv4(), title: 'Date', type: 'date' as ColumnType, order: 4, width: 140 },
                { id: uuidv4(), title: 'Text', type: 'text' as ColumnType, order: 5, width: 200 },
            ];

            const defaultGroups = [
                { id: groupId, title: 'Getting Started', color: '#2E7D8C', order: 0 }
            ];

            const statusCol = defaultColumns[0];
            const dateCol = defaultColumns[4];
            const doneOption = statusCol.options?.find(o => o.label.toLowerCase() === 'done');
            const defaultValues = {
                [statusCol.id]: (doneOption ?? statusCol.options?.[0])?.id,
                [dateCol.id]: new Date().toISOString().split('T')[0]
            };

            const newItem: Item = {
                id: itemId,
                title: 'My First Task',
                boardId: boardId,
                groupId: groupId,
                values: defaultValues,
                order: 0,
                updates: []
            };

            const newBoard: Board = {
                id: boardId,
                workspaceId: newWsId,
                title: 'Starting Board',
                columns: defaultColumns,
                groups: defaultGroups.map(g => ({ ...g, items: [newItem] })),
                items: [newItem],
                itemColumnTitle: 'Item',
                itemColumnWidth: 350,
                isDataLoaded: true
            };

            set(state => ({
                boards: [...state.boards, newBoard],
                activeBoardId: boardId
            }));

            // 2. Create Board
            const { error: brdError } = await supabase.from('boards').insert({ id: boardId, workspace_id: newWsId, title: 'Starting Board', order: 0 });
            if (brdError) {
                console.error('[AddSubWorkspace] Failed to create default board:', brdError);
                throw brdError;
            }

            // 3. Create Groups
            const { error: grpError } = await supabase.from('groups').insert(defaultGroups.map(g => ({ id: g.id, board_id: boardId, title: g.title, color: g.color, order: g.order })));
            if (grpError) console.error('[AddSubWorkspace] Group insertion error (non-fatal for UI):', grpError);

            // 4. Create Columns
            const { error: colError } = await supabase.from('columns').insert(defaultColumns.map(c => ({ id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width, options: c.options || [] })));
            if (colError) console.error('[AddSubWorkspace] Column insertion error (non-fatal for UI):', colError);

            // 5. Create Item
            const { error: itemError } = await supabase.from('items').insert({
                id: itemId,
                board_id: boardId,
                group_id: groupId,
                title: 'My First Task',
                values: defaultValues,
                order: 0
            });
            if (itemError) console.error('[AddSubWorkspace] Item insertion error (non-fatal for UI):', itemError);

            // 6. Create Board Member
            const { error: memError } = await supabase.from('board_members').insert({ board_id: boardId, user_id: user.id, role: 'owner' });
            if (memError) console.error('[AddSubWorkspace] Board member creation error:', memError);

            set(state => ({
                userWorkspaceRoles: { ...state.userWorkspaceRoles, [newWsId]: 'owner' },
                userBoardRoles: { ...state.userBoardRoles, [boardId]: 'owner' }
            }));

            get().logActivity('workspace_created', 'workspace', newWsId, { workspace_title: title, parent_workspace_id: parentId });
        } catch (err) {
            console.error('[AddSubWorkspace] Full Error context:', err);
            await get().loadUserData(true);
            throw err;
        }
    },

    deleteWorkspace: async (id) => {
        const workspace = get().workspaces.find(w => w.id === id);
        set(state => ({
            workspaces: state.workspaces.filter(w => w.id !== id),
            boards: state.boards.filter(b => b.workspaceId !== id)
        }));
        await supabase.from('workspaces').delete().eq('id', id);
        get().logActivity('workspace_deleted', 'workspace', id, { workspace_title: workspace?.title || 'Unknown' });
    },

    updateWorkspace: async (id, title) => {
        const oldTitle = get().workspaces.find(w => w.id === id)?.title;
        set(state => ({
            workspaces: state.workspaces.map(w => w.id === id ? { ...w, title } : w)
        }));
        await supabase.from('workspaces').update({ title }).eq('id', id);
        if (oldTitle && oldTitle !== title) {
            get().logActivity('workspace_renamed', 'workspace', id, { old_title: oldTitle, new_title: title });
        }
    },

    renameWorkspace: async (id, newTitle) => {
        const oldTitle = get().workspaces.find(w => w.id === id)?.title;
        set(state => ({ workspaces: state.workspaces.map(w => w.id === id ? { ...w, title: newTitle } : w) }));
        await supabase.from('workspaces').update({ title: newTitle }).eq('id', id);
        if (oldTitle && oldTitle !== newTitle) {
            get().logActivity('workspace_renamed', 'workspace', id, { old_title: oldTitle, new_title: newTitle });
        }
    },

    duplicateWorkspace: async (id) => {
        const { workspaces, boards } = get();
        const ws = workspaces.find(w => w.id === id);
        if (!ws) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newWsId = uuidv4();
        const newTitle = `${ws.title} (Copy)`;
        const newOrder = workspaces.length;

        const newWorkspace: Workspace = {
            id: newWsId,
            title: newTitle,
            owner_id: user.id,
            order: newOrder
        };

        set(state => ({
            workspaces: [...state.workspaces, newWorkspace]
        }));

        const { error } = await supabase.from('workspaces').insert({
            id: newWsId,
            title: newTitle,
            owner_id: user.id,
            order: newOrder
        });

        if (error) {
            alert(`Failed to duplicate workspace: ${error.message}`);
            get().loadUserData(true);
            return;
        }

        // Excluding archived boards here matters more than most: without it,
        // duplicating a workspace would resurrect every board someone had
        // deleted from it.
        const wsBoards = boards.filter(b => b.workspaceId === id && !b.is_archived);
        for (const board of wsBoards) {
            await get().duplicateBoardToWorkspace(board.id, newWsId);
        }

        get().logActivity('workspace_duplicated', 'workspace', newWsId, { workspace_title: newTitle, source_workspace_title: ws.title });
    },

    inviteToWorkspace: async (workspaceId, email, role) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const { data: foundUser } = await supabase.from('profiles').select('id, full_name').eq('email', email).single();

            if (foundUser) {
                // Automatically add the existing user to workspace_members
                await supabase.from('workspace_members').insert({
                    workspace_id: workspaceId,
                    user_id: foundUser.id,
                    role
                });

                const { workspaces } = get();
                const ws = workspaces.find(w => w.id === workspaceId);
                const workspaceName = ws?.title || 'NHG Tasks';

                // Same as the board path: the user is already a member by this
                // point, so send the access-granted notice rather than the default
                // 'invite' magic-link email for something with nothing to accept.
                const { data: inviterProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
                const inviterName = inviterProfile?.full_name || 'A Team Member';

                const { error: grantEmailError } = await supabase.functions.invoke('invite-user', {
                    body: {
                        email,
                        action: 'access_granted',
                        workspaceId,
                        workspaceName,
                        targetType: 'workspace',
                        targetName: workspaceName,
                        role,
                        inviterName,
                        accessLink: `${APP_URL}/?workspaceId=${workspaceId}`,
                        redirectTo: `${APP_URL}/`
                    }
                });

                if (grantEmailError) {
                    console.error('Access Granted Email Error (Workspace):', grantEmailError);
                }

                // Send Access Granted Notification (No need to accept)
                await get().createNotification(
                    foundUser.id,
                    'access_granted',
                    `You have been added to workspace`,
                    workspaceId,
                    { role, workspaceName, workspace_id: workspaceId }
                );
            } else {
                const { workspaces } = get();
                const ws = workspaces.find(w => w.id === workspaceId);
                const workspaceName = ws?.title || 'NHG Tasks';

                // Call Edge Function to send email invite and record pending
                const { data: responseData, error: fnError } = await supabase.functions.invoke('invite-user', {
                    body: { 
                        email, 
                        workspaceId,
                        workspaceName,
                        redirectTo: `${APP_URL}/`
                    }
                });

                if (fnError) {
                    console.error('Edge Function Invite Error:', fnError);
                    // Fallback to manual insert if function fails
                    await supabase.from('pending_invites').insert({
                        email,
                        workspace_id: workspaceId,
                        role,
                        invited_by: user.id
                    });
                } else if (responseData?.userId) {
                    // Automatically add the new user to workspace_members since they are a brand new user
                    await supabase.from('workspace_members').insert({
                        workspace_id: workspaceId,
                        user_id: responseData.userId,
                        role
                    });
                }
            }

            get().logActivity('workspace_invite_sent', 'workspace', workspaceId, { email, role });
        } catch (e) {
            console.error("Invite failed", e);
            throw e;
        }
    },

    getWorkspaceMembers: async (workspaceId, includeInactive = false) => {
        const { data, error } = await supabase
            .from('workspace_members')
            .select('*, profiles(*)')
            .eq('workspace_id', workspaceId);

        if (error) throw error;
        const members = data || [];

        // Ownership is tracked via workspaces.owner_id and doesn't always have a matching
        // workspace_members row (e.g. workspaces created before that linkage existed, or a
        // transfer target who was never separately invited) — synthesize one so the owner
        // is never silently missing from the members list.
        const ownerId = get().workspaces.find(w => w.id === workspaceId)?.owner_id;
        if (ownerId && !members.some((m: any) => m.user_id === ownerId)) {
            const { data: ownerProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', ownerId)
                .single();
            if (ownerProfile) {
                members.unshift({
                    id: `owner-${ownerId}`,
                    user_id: ownerId,
                    workspace_id: workspaceId,
                    role: 'owner',
                    profiles: ownerProfile
                });
            }
        }

        // Surface people who only have access via a single board invite (not full
        // workspace access) as read-only "Guest" rows, purely for visibility — they are
        // intentionally NOT inserted into workspace_members, so they don't gain the
        // broader "see/create every board" access a real workspace member has.
        const { data: wsBoards } = await supabase.from('boards').select('id').eq('workspace_id', workspaceId);
        const boardIds = (wsBoards || []).map((b: any) => b.id);
        if (boardIds.length > 0) {
            const { data: boardMembers } = await supabase
                .from('board_members')
                .select('user_id, profiles(*)')
                .in('board_id', boardIds);

            const knownUserIds = new Set(members.map((m: any) => m.user_id));
            (boardMembers || []).forEach((bm: any) => {
                if (knownUserIds.has(bm.user_id)) return;
                knownUserIds.add(bm.user_id);
                members.push({
                    id: `guest-${bm.user_id}`,
                    user_id: bm.user_id,
                    workspace_id: workspaceId,
                    role: 'guest',
                    profiles: Array.isArray(bm.profiles) ? bm.profiles[0] : bm.profiles
                });
            });
        }

        // Applied last so it also covers the owner row synthesized above and the
        // board-only guests appended below — a deactivated person is hidden from the
        // workspace no matter which of the three ways they got into this list.
        if (includeInactive) return members;
        return members.filter((m: any) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return profile?.is_active !== false;
        });
    },

    adminAddWorkspaceMember: async (workspaceId, userId, role) => {
        const { count } = await supabase.from('workspace_members')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('user_id', userId);
        if (count) return;

        const { error } = await supabase.from('workspace_members').insert({
            workspace_id: workspaceId,
            user_id: userId,
            role
        });
        if (error) throw error;

        get().logActivity('workspace_member_added_by_admin', 'workspace', workspaceId, { user_id: userId, role });
    },

    transferWorkspaceOwnership: async (workspaceId, newOwnerUserId) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const previousOwnerId = user.id;

        // Optimistic update so the UI reflects the new owner immediately
        set(state => ({
            workspaces: state.workspaces.map(w => w.id === workspaceId ? { ...w, owner_id: newOwnerUserId } : w)
        }));

        try {
            // 1. The workspace's owner_id is the single source of truth for "who is owner"
            const { error: wsError } = await supabase
                .from('workspaces')
                .update({ owner_id: newOwnerUserId })
                .eq('id', workspaceId);
            if (wsError) throw wsError;

            // 2. Demote the previous owner's membership row to member, so it displays
            // correctly once they no longer match the workspace's owner_id. Owners (like
            // the one created by addWorkspace) often have no existing workspace_members
            // row — update() silently no-ops in that case, so fall back to inserting one.
            const { data: demoteRows, error: demoteError } = await supabase
                .from('workspace_members')
                .update({ role: 'member' })
                .eq('workspace_id', workspaceId)
                .eq('user_id', previousOwnerId)
                .select('id');
            if (demoteError) {
                console.error('[TransferOwnership] Failed to demote previous owner:', demoteError);
            } else if (!demoteRows || demoteRows.length === 0) {
                const { error: insErr } = await supabase.from('workspace_members')
                    .insert({ workspace_id: workspaceId, user_id: previousOwnerId, role: 'member' });
                if (insErr) console.error('[TransferOwnership] Failed to insert membership row for previous owner:', insErr);
            }

            // 3. Keep the new owner's membership role field consistent (display logic
            // already overrides via owner_id match, but keep the stored value accurate).
            // Same update-or-insert fallback as above.
            const { data: promoteRows, error: promoteError } = await supabase
                .from('workspace_members')
                .update({ role: 'owner' })
                .eq('workspace_id', workspaceId)
                .eq('user_id', newOwnerUserId)
                .select('id');
            if (promoteError) {
                console.error('[TransferOwnership] Failed to update new owner role field:', promoteError);
            } else if (!promoteRows || promoteRows.length === 0) {
                const { error: insErr2 } = await supabase.from('workspace_members')
                    .insert({ workspace_id: workspaceId, user_id: newOwnerUserId, role: 'owner' });
                if (insErr2) console.error('[TransferOwnership] Failed to insert membership row for new owner:', insErr2);
            }

            // Reflect the new role for the current session immediately (this function
            // always runs as the previous owner, so update their own local role state).
            set(state => ({
                userWorkspaceRoles: { ...state.userWorkspaceRoles, [workspaceId]: 'member' }
            }));

            get().logActivity('workspace_ownership_transferred', 'workspace', workspaceId, {
                previous_owner_user_id: previousOwnerId,
                new_owner_user_id: newOwnerUserId
            });
        } catch (err) {
            console.error('[TransferOwnership] Failed, reverting:', err);
            await get().loadUserData(true);
            throw err;
        }
    },

    reorderWorkspaces: async (sourceId, destinationId) => {
        const { workspaces } = get();
        const sourceIndex = workspaces.findIndex(w => w.id === sourceId);
        const destIndex = workspaces.findIndex(w => w.id === destinationId);
        
        if (sourceIndex === -1 || destIndex === -1 || sourceIndex === destIndex) return;

        const newWorkspaces = [...workspaces];
        const [moved] = newWorkspaces.splice(sourceIndex, 1);
        newWorkspaces.splice(destIndex, 0, moved);

        const updatedWorkspaces = newWorkspaces.map((w, index) => ({ ...w, order: index }));
        set({ workspaces: updatedWorkspaces });

        try {
            const workspaceIds = updatedWorkspaces.map(w => w.id);
            await supabase.rpc('reorder_workspaces', { _workspace_ids: workspaceIds });
        } catch (error) {
            console.error('[ReorderWorkspaces] Failed to save new order:', error);
            get().loadUserData(true);
        }
    }
});
