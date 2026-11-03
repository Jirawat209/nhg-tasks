import type { StateCreator } from 'zustand';
import { APP_URL } from '../../lib/appUrl';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Item, FileLink, Comment, Column, ColumnScope } from '../../types';
import type { BoardState } from '../useBoardStore';
import { itemColumns, subitemColumns, planCarry } from '../../lib/columnScope';
import { tableRows } from '../../lib/boardRows';
import { checkableRows, rangeBetween } from '../../lib/selectionRange';
import { showToast } from '../../utils/toast';
import { offerUndo } from '../useUndoToast';
import { useUserStore } from '../useUserStore';
import { describeChange } from '../../lib/itemChangeText';
import { peopleToNotify } from '../../lib/itemPeople';

// Rows changing place: `rows` leave the columns `from` for the item columns
// (scope 'item') or a group's sub-item columns, and with `regroup` their
// group_id changes too (sub-items following a parent to another group).
interface CarryMove {
    rows: Item[];
    from: Column[];
    scope: ColumnScope;
    groupId?: string;
    createMissing: boolean;
    regroup?: string;
    /** 'type' for rows arriving from another board (see planCarry). */
    match?: 'title' | 'type';
}

// Takes moved rows' values along to the columns of where they went, adding the
// columns that takes (see planCarry). Items and each group's sub-items have
// separate columns, so a value keyed by the old place's column would otherwise
// still be stored but no longer shown anywhere.
const carryValues = async (set: any, get: () => BoardState, boardId: string, moves: CarryMove[]) => {
    const board = get().boards.find(b => b.id === boardId);
    if (!board || moves.length === 0) return;

    let working = board.columns;
    const added: Column[] = [];
    const changed = new Map<string, Column>();
    const rowUpdates = new Map<string, { values: Record<string, any>; groupId?: string }>();

    for (const move of moves) {
        const to = move.scope === 'subitem' ? subitemColumns(working, move.groupId) : itemColumns(working);
        const plan = planCarry(move.rows, move.from, to, { scope: move.scope, groupId: move.groupId }, uuidv4, move.createMissing, move.match);
        plan.updated.forEach(c => changed.set(c.id, c));
        added.push(...plan.created);
        working = [...working.map(c => changed.get(c.id) || c), ...plan.created];
        move.rows.forEach(row => {
            const values = plan.remap(rowUpdates.get(row.id)?.values || row.values || {});
            rowUpdates.set(row.id, { values, groupId: move.regroup ?? rowUpdates.get(row.id)?.groupId });
        });
    }

    const apply = (item: Item): Item => {
        const u = rowUpdates.get(item.id);
        return u ? { ...item, values: u.values, groupId: u.groupId ?? item.groupId } : item;
    };
    const now = Date.now();
    set((state: BoardState) => ({
        boards: state.boards.map(b => b.id === boardId ? {
            ...b,
            columns: [...b.columns.map(c => changed.get(c.id) || c), ...added.filter(a => !b.columns.some(c => c.id === a.id))],
            items: b.items.map(apply),
            groups: b.groups.map(g => ({ ...g, items: g.items.map(apply) }))
        } : b),
        lastOptimisticUpdate: [...rowUpdates.keys()].reduce((acc, id) => ({ ...acc, [id]: now }), state.lastOptimisticUpdate)
    }));

    if (added.length > 0) {
        const { error } = await supabase.from('columns').insert(added.map(c => ({
            id: c.id, board_id: boardId, title: c.title, type: c.type, order: c.order, width: c.width,
            options: c.options || [], aggregation: c.aggregation, number_format: c.numberFormat,
            currency_code: c.currencyCode, number_align: c.numberAlign,
            scope: c.scope === 'subitem' ? 'subitem' : 'item', group_id: c.scope === 'subitem' ? c.groupId : null
        })));
        if (error) console.error('[carryValues] Failed to add columns:', error);
    }
    await Promise.all([...changed.values()].map(c => supabase.from('columns').update({ options: c.options }).eq('id', c.id)));
    await Promise.all([...rowUpdates.entries()].map(([id, u]) =>
        supabase.from('items').update(u.groupId ? { values: u.values, group_id: u.groupId } : { values: u.values }).eq('id', id)
    ));
};

/**
 * Puts rows back exactly where they were before a move: board, group, parent
 * and values (a cross-board move rewrites the values onto the other board's
 * columns, so the originals are restored whole). `originals` are the rows as
 * they were before the move. Parents are written first, then the rows under
 * them, as the move itself did.
 */
const restoreMovedRows = async (set: any, get: () => BoardState, originals: Item[]) => {
    const ids = new Set(originals.map(o => o.id));
    const current = new Map<string, Item>();
    get().boards.forEach(b => b.items.forEach(i => { if (ids.has(i.id)) current.set(i.id, i); }));
    const back = originals.map(o => ({ ...(current.get(o.id) || o), groupId: o.groupId, boardId: o.boardId, parentId: o.parentId, values: o.values }));
    const now = Date.now();
    set((state: BoardState) => ({
        boards: state.boards.map(b => {
            const returning = back.filter(r => r.boardId === b.id);
            const strip = (list: Item[]) => list.filter(i => !ids.has(i.id));
            return {
                ...b,
                items: [...strip(b.items), ...returning],
                groups: b.groups.map(g => ({ ...g, items: [...strip(g.items), ...returning.filter(r => r.groupId === g.id)] })),
            };
        }),
        lastOptimisticUpdate: [...ids].reduce((acc, id) => ({ ...acc, [id]: now }), state.lastOptimisticUpdate),
    }));
    const write = (o: Item) => supabase.from('items')
        .update({ group_id: o.groupId, board_id: o.boardId, parent_id: o.parentId ?? null, values: o.values })
        .eq('id', o.id);
    const results = [
        ...(await Promise.all(originals.filter(o => !o.parentId).map(write))),
        ...(await Promise.all(originals.filter(o => o.parentId).map(write))),
    ];
    if (results.some(r => r.error)) {
        console.error('[Undo move] Failed to restore some rows:', results.find(r => r.error)?.error);
        void get().loadUserData(true);
    }
};

// Every write to items.updates replaces the whole JSON array, so the array sent
// has to be built on the row as it stands in the database — never on local
// state. A board now opens with updates: [] on every item and fills the comment
// bodies in afterwards, so building on local state would send that empty array
// back and erase the item's entire comment history. Reading first also stops
// two people commenting at the same moment from dropping each other's comment.
//
// Returns null when nothing was written. Callers must treat that as a failure
// and undo their optimistic change — a comment that only ever existed on screen
// is worse than one that visibly failed to send, because the author walks away
// believing it was posted.
const rewriteUpdates = async (
    set: any,
    activeBoardId: string | null,
    itemId: string,
    apply: (current: Comment[]) => Comment[]
): Promise<Comment[] | null> => {
    let next: Comment[];

    try {
        const { data, error } = await supabase
            .from('items')
            .select('updates')
            .eq('id', itemId)
            .single();

        // No guessing at the current value: without it, any write would be a
        // wholesale overwrite of comments that are still in the database.
        if (error || !data) {
            console.error('Could not read updates before writing — write skipped', error);
            return null;
        }

        const current: Comment[] = Array.isArray(data.updates) ? (data.updates as Comment[]) : [];
        next = apply(current);

        const { error: writeError } = await supabase.from('items').update({ updates: next }).eq('id', itemId);
        if (writeError) {
            console.error('Failed to write updates', writeError);
            return null;
        }
    } catch (e) {
        // A rejected request (timeout, dropped connection, a payload the server
        // refuses) throws rather than returning an error, and used to take the
        // rest of the caller with it — no write, no activity log, and the
        // comment left sitting on screen as though it had been saved.
        console.error('Update write threw', e);
        return null;
    }

    // The row was just read in full, so local state can be marked authoritative.
    const fill = (i: Item): Item => i.id !== itemId
        ? i
        : { ...i, updates: next, updatesCount: next.length, updatesLoaded: true };

    set((state: BoardState) => ({
        boards: state.boards.map(b => b.id !== activeBoardId ? b : {
            ...b,
            items: b.items.map(fill),
            groups: b.groups.map(g => ({ ...g, items: g.items.map(fill) }))
        })
    }));

    return next;
};

// activeBoardMembers only holds this board's board_members rows, but a
// people-column value can point at someone who isn't one — most commonly an
// assignee copied over by the linked-groups mirror trigger onto a board they
// were never individually added to. The in-app notification only needs the
// user id and still fires correctly for them; the email was silently
// skipped because the lookup came back empty. Fall back to a direct profile
// read so a valid assignee always gets the email regardless of board
// membership.
const resolveAssigneeEmail = async (get: () => BoardState, userId: string): Promise<string | null> => {
    const cached = get().activeBoardMembers.find((m: any) => m.user_id === userId)?.profiles?.email;
    if (cached) return cached;
    const { data } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle();
    return data?.email || null;
};

export interface ItemSlice {
    selectedItemIds: string[];
    /** The item whose checkbox was clicked last: where a Shift-click range starts. */
    lastSelectedItemId: string | null;
    showHiddenItems: boolean;
    activeItemId: string | null;
    highlightedItemId: string | null;
    /** The update or reply to scroll to and flash when the item panel opens (from a notification or an emailed link). */
    highlightedUpdateId: string | null;
    searchQuery: string;
    lastOptimisticUpdate: Record<string, number>;

    // Actions
    addItem: (title: string, groupId: string, parentId?: string) => Promise<void>;
    updateItemValue: (itemId: string, columnId: string, value: any) => Promise<void>;
    updateItemTitle: (itemId: string, newTitle: string, shouldLog?: boolean) => Promise<void>;
    updateItemFiles: (itemId: string, files: FileLink[]) => Promise<void>;
    deleteItem: (itemId: string) => Promise<void>;
    restoreItem: (itemId: string, boardId: string, itemTitle?: string) => Promise<void>;
    moveItem: (activeId: string, overId: string) => Promise<void>;

    // Update/Comment
    // Resolves false when the comment could not be saved, so the composer can
    // hand the author their text back instead of dropping it.
    addUpdate: (itemId: string, content: string, author: { name: string; id: string; userId: string }, files?: import('../../types').FileLink[], parentId?: string) => Promise<boolean>;
    deleteUpdate: (itemId: string, updateId: string) => Promise<void>;
    editUpdate: (itemId: string, updateId: string, newContent: string, files?: import('../../types').FileLink[]) => Promise<void>;
    toggleUpdateLike: (itemId: string, updateId: string, user: { id: string; name: string }) => Promise<void>;

    // View Options
    toggleShowHiddenItems: () => void;
    setActiveItem: (itemId: string | null) => void;
    setHighlightedItem: (itemId: string | null) => void;
    setHighlightedUpdate: (updateId: string | null) => void;
    setSearchQuery: (query: string) => void;

    // Selection
    toggleItemSelection: (itemId: string, selected: boolean) => void;
    /** Switch the signed-in person's own notifications for the item on or off (everyone on it is on by default). Nobody can change anyone else's. */
    setMyItemNotifications: (itemId: string, on: boolean) => Promise<void>;
    selectItemRange: (itemId: string) => void;
    selectGroupItems: (groupId: string) => void;
    clearSelection: () => void;
    deleteSelectedItems: () => void;

    // Batch Actions
    duplicateSelectedItems: () => Promise<void>;
    hideSelectedItems: () => Promise<void>;
    unhideSelectedItems: () => Promise<void>;
    moveSelectedItemsToTarget: (groupId: string, targetBoardId: string, parentId?: string | null) => Promise<void>;

    // UI/Drafts
    drafts: Record<string, string>;
    setDraft: (itemId: string, content: string) => void;

    // Concurrency
    setLastOptimisticUpdate: (itemId: string, timestamp: number) => void;
}



export const createItemSlice: StateCreator<
    BoardState,
    [],
    [],
    ItemSlice
> = (set, get) => ({
    selectedItemIds: [],
    lastSelectedItemId: null,
    showHiddenItems: false,
    activeItemId: null,
    highlightedItemId: null,
    highlightedUpdateId: null,
    searchQuery: '',
    drafts: {},
    lastOptimisticUpdate: {},

    setLastOptimisticUpdate: (itemId, timestamp) => {
        set(state => ({ lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: timestamp } }));
    },

    addItem: async (title, groupId, parentId) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        const currentGroupItems = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId)?.items || [];
        const maxOrder = currentGroupItems.length > 0
            ? Math.max(...currentGroupItems.map(item => item.order || 0))
            : 0;
        const nextOrder = maxOrder + 1;

        const newItem: Item = {
            id: uuidv4(),
            title,
            groupId,
            boardId: activeBoardId,
            values: {},
            updates: [],
            createdAt: new Date().toISOString(),
            order: nextOrder,
            parentId
        };

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: [...b.items, newItem],
                        groups: b.groups.map(g =>
                            g.id === groupId
                                ? { ...g, items: [...g.items, newItem] }
                                : g
                        )
                    }
                    : b
            )
        }));

        const { error } = await supabase.from('items').insert({
            id: newItem.id,
            title: newItem.title,
            board_id: activeBoardId,
            group_id: groupId,
            values: {},
            order: nextOrder,
            parent_id: parentId
        });

        if (!error) {
            const groupTitle = get().boards.find(b => b.id === activeBoardId)?.groups.find(g => g.id === groupId)?.title;
            get().logActivity('item_created', 'item', newItem.id, {
                board_id: activeBoardId,
                item_title: title,
                group_title: groupTitle
            });
        }
    },

    updateItemValue: async (itemId, columnId, value) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId) return;

        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;
        const column = board.columns.find(c => c.id === columnId);
        const item = board.items.find(i => i.id === itemId);

        // Captured before the optimistic write below overwrites it — the
        // dependency cascade needs the previous dates to work out how far this
        // item moved.
        const previousValue = item?.values?.[columnId];

        let logMeta: any = null;
        if (column && item) {
            const oldValue = previousValue;
            const newValue = value;
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                logMeta = {
                    board_id: activeBoardId,
                    column_title: column.title,
                    column_type: column.type,
                    old_value: oldValue,
                    new_value: newValue,
                    item_title: item.title,
                };

                if (column.type === 'status') {
                    const oldOption = column.options?.find(o => o.id === oldValue);
                    const newOption = column.options?.find(o => o.id === newValue);
                    logMeta.old_label = oldOption?.label || 'None';
                    logMeta.old_color = oldOption?.color;
                    logMeta.new_label = newOption?.label || 'None';
                    logMeta.new_color = newOption?.color;
                }
            }
        }

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [columnId]: value } } : i),
                        groups: b.groups.map(g => ({
                            ...g,
                            items: g.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [columnId]: value } } : i)
                        }))
                    }
                    : b
            ),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        const currentItem = get().boards.find(b => b.id === activeBoardId)?.items.find(i => i.id === itemId);
        if (currentItem) {
            await supabase.from('items').update({ values: currentItem.values }).eq('id', itemId);
            if (logMeta) {
                if (column?.type === 'status') {
                    get().logActivity('item_status_updated', 'item', itemId, logMeta);

                    // Notify assignees (people-type column values) that the status
                    // changed — same assignee-lookup convention as the plain-comment
                    // notification below. Both in-app and email, since a status
                    // change is high-signal enough to warrant an email the way
                    // assignment/mention already do.
                    const { data: { user: actor } } = await supabase.auth.getUser();
                    // Everyone on the item except those switched off for it
                    if (actor && peopleToNotify(board, currentItem).length > 0) {
                        const actorName = actor.user_metadata?.full_name || actor.user_metadata?.name || actor.email?.split('@')[0] || 'Someone';
                        const assigneeIds = new Set(peopleToNotify(board, currentItem));
                        const oldLabel = logMeta.old_label || 'None';
                        const newLabel = logMeta.new_label || 'a new status';
                        for (const assigneeId of assigneeIds) {
                            if (assigneeId === actor.id) continue;
                            await get().createNotification(
                                assigneeId,
                                'status_update',
                                `${actorName} changed the status of "${currentItem.title || 'a task'}" to "${newLabel}"`,
                                itemId,
                                { board_id: activeBoardId, old_label: logMeta.old_label, new_label: newLabel }
                            );

                            const assigneeEmail = await resolveAssigneeEmail(get, assigneeId);
                            if (assigneeEmail) {
                                supabase.functions.invoke('invite-user', {
                                    body: {
                                        action: 'status_update',
                                        email: assigneeEmail,
                                        inviterName: actorName,
                                        itemName: currentItem.title || 'an item',
                                        boardName: board.title || 'a board',
                                        oldStatus: oldLabel,
                                        newStatus: newLabel,
                                        itemLink: `${APP_URL}/?boardId=${activeBoardId}&itemId=${itemId}`
                                    }
                                }).catch((e: unknown) => console.error('Status update email error:', e));
                            }
                        }
                    }
                } else {
                    get().logActivity('item_value_updated', 'item', itemId, logMeta);

                    // A change to one of the item's other fields, told to the people on
                    // it when the item's switch is on (People and Files have their own
                    // messages, so describeChange gives nothing for them).
                    const summary = column && peopleToNotify(board, currentItem).length > 0 ? describeChange(column, logMeta.old_value, logMeta.new_value) : null;
                    if (summary) {
                        const { data: { user: actor } } = await supabase.auth.getUser();
                        if (actor) {
                            const actorName = actor.user_metadata?.full_name || actor.user_metadata?.name || actor.email?.split('@')[0] || 'Someone';
                            for (const personId of peopleToNotify(board, currentItem)) {
                                if (personId === actor.id) continue;
                                await get().createNotification(
                                    personId,
                                    'item_change',
                                    `${actorName} updated "${currentItem.title || 'a task'}" — ${summary}`,
                                    itemId,
                                    { board_id: activeBoardId, change: summary }
                                );
                                const personEmail = await resolveAssigneeEmail(get, personId);
                                if (personEmail) {
                                    supabase.functions.invoke('invite-user', {
                                        body: {
                                            action: 'item_change',
                                            email: personEmail,
                                            inviterName: actorName,
                                            itemName: currentItem.title || 'an item',
                                            boardName: board.title || 'a board',
                                            changeSummary: summary,
                                            itemLink: `${APP_URL}/?boardId=${activeBoardId}&itemId=${itemId}`
                                        }
                                    }).catch((e: unknown) => console.error('Item change email error:', e));
                                }
                            }
                        }
                    }
                }
            }
        }

        // Finish-to-Start: if this item anchors a Timeline bar and it just moved,
        // carry every downstream item along by the same number of days. Covers
        // every edit path — the picker, the date cell, and the Timeline drag.
        if (column && ['timeline', 'date', 'due_date'].includes(column.type)) {
            await get().cascadeFromPredecessor(itemId, columnId, previousValue, value);
        }
    },

    updateItemTitle: async (itemId, newTitle, shouldLog = false) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        const oldItem = get().boards.find(b => b.id === activeBoardId)?.items.find(i => i.id === itemId);
        const oldTitle = oldItem?.title;

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.map(i => i.id === itemId ? { ...i, title: newTitle } : i),
                        groups: b.groups.map(g => ({
                            ...g,
                            items: g.items.map(i => i.id === itemId ? { ...i, title: newTitle } : i)
                        }))
                    }
                    : b
            ),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        await supabase.from('items').update({ title: newTitle }).eq('id', itemId);

        if (shouldLog && oldTitle && oldTitle !== newTitle) {
            get().logActivity('item_renamed', 'item', itemId, {
                board_id: activeBoardId,
                old_title: oldTitle,
                new_title: newTitle
            });
        }
    },

    updateItemFiles: async (itemId, files) => {
        const { boards, activeBoardId, logActivity } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => i.id === itemId ? { ...i, files } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => i.id === itemId ? { ...i, files } : i)
                }))
            } : b),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [itemId]: Date.now() }
        }));

        try {
            const filesPayload = files.length > 0 ? files : [];
            const { error } = await supabase.from('items').update({ files: filesPayload }).eq('id', itemId);
            if (error) throw error;
            await logActivity('item_files_updated', 'item', itemId, { fileName: files.length > 0 ? files[files.length - 1].name : 'File removed' });
        } catch (e) {
            console.error('Failed to update files:', e);
            get().loadUserData(true);
        }
    },

    deleteItem: async (itemId) => {
        const { activeBoardId } = get();
        const board = get().boards.find(b => b.id === activeBoardId);
        const item = board?.items.find(i => i.id === itemId);
        const title = item?.title;
        // Cascade: a deleted parent's sub-items would otherwise become
        // orphaned and unreachable (their row only exists nested inside the
        // now-archived parent's expanded view).
        const childIds = (board?.items || []).filter(i => i.parentId === itemId).map(i => i.id);
        const idsToArchive = [itemId, ...childIds];

        set(state => ({
            boards: state.boards.map(b =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        items: b.items.filter(i => !idsToArchive.includes(i.id)),
                        groups: b.groups.map(g => ({ ...g, items: g.items.filter(i => !idsToArchive.includes(i.id)) }))
                    }
                    : b
            ),
            selectedItemIds: state.selectedItemIds.filter(id => !idsToArchive.includes(id))
        }));

        await supabase.from('items').update({ is_archived: true }).in('id', idsToArchive);
        if (activeBoardId) {
            get().logActivity('item_deleted', 'board', activeBoardId, {
                board_id: activeBoardId,
                item_title: title || 'Unknown'
            });
        }
    },

    restoreItem: async (itemId, boardId, itemTitle) => {
        await supabase.from('items').update({ is_archived: false }).eq('id', itemId);
        // Cascade restore: bring back any direct children that were archived
        // alongside this item by deleteItem's cascade above. A child that was
        // separately archived on its own later is the rare edge case this
        // over-restores, accepted as a reasonable default.
        await supabase.from('items').update({ is_archived: false }).eq('parent_id', itemId).eq('is_archived', true);

        // loadBoardData() short-circuits once a board is already loaded (it only
        // refreshes items for linked groups) — it never re-queries with the
        // is_archived filter. Marking the board as not-loaded routes the next
        // load through the full fetch path instead of duplicating that logic here.
        set(state => ({
            boards: state.boards.map(b => b.id === boardId ? { ...b, isDataLoaded: false } : b)
        }));

        get().logActivity('item_restored', 'board', boardId, {
            board_id: boardId,
            item_title: itemTitle || 'Unknown'
        });
    },

    moveItem: async (activeId, overId) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId || activeId === overId) return;
        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const activeItem = board.items.find(i => i.id === activeId);
        if (!activeItem) return;

        const normalizedOverId = overId.replace(/-header$/, '').replace(/-footer$/, '');
        const overGroup = board.groups.find(g => g.id === normalizedOverId);

        let newItems = [...board.items];
        let newGroupId = activeItem.groupId;

        if (overGroup) {
            newGroupId = overGroup.id;
            const activeIndex = newItems.findIndex(i => i.id === activeId);
            if (activeIndex !== -1) newItems.splice(activeIndex, 1);

            const firstItemInGroupIndex = newItems.findIndex(i => i.groupId === newGroupId);
            const movedItem = { ...activeItem, groupId: newGroupId };

            if (firstItemInGroupIndex !== -1) {
                newItems.splice(firstItemInGroupIndex, 0, movedItem);
            } else {
                newItems.push(movedItem);
            }
        } else {
            const overItem = board.items.find(i => i.id === overId);
            if (!overItem) return;

            if (activeItem.groupId === overItem.groupId) {
                const activeIndex = board.items.findIndex(i => i.id === activeId);
                const overIndex = board.items.findIndex(i => i.id === overId);
                newItems = arrayMove(newItems, activeIndex, overIndex);
            } else {
                newGroupId = overItem.groupId;
                newItems = newItems.filter(i => i.id !== activeId);
                const overIndexInNewArray = newItems.findIndex(i => i.id === overId);
                const movedItem = { ...activeItem, groupId: newGroupId };
                newItems.splice(overIndexInNewArray, 0, movedItem);
            }
        }

        const updatedBoards = boards.map(b => {
            if (b.id !== activeBoardId) return b;
            const updatedItems = newItems.map((item, index) => ({ ...item, order: index }));
            return {
                ...b,
                items: updatedItems,
                groups: b.groups.map(g => ({
                    ...g,
                    items: updatedItems.filter(i => i.groupId === g.id)
                }))
            };
        });

        set(state => ({
            boards: updatedBoards,
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [activeId]: Date.now() }
        }));

        try {
            if (activeItem.groupId !== newGroupId) {
                await supabase.from('items').update({ group_id: newGroupId }).eq('id', activeId);
                // Its sub-items go with it, onto the new group's sub-item columns.
                const subItems = board.items.filter(i => i.parentId === activeId);
                if (!activeItem.parentId && subItems.length > 0) {
                    await carryValues(set, get, activeBoardId, [{
                        rows: subItems,
                        from: subitemColumns(board.columns, activeItem.groupId),
                        scope: 'subitem',
                        groupId: newGroupId,
                        createMissing: true,
                        regroup: newGroupId
                    }]);
                }
            }
            await supabase.rpc('reorder_items', { _board_id: activeBoardId, _item_ids: newItems.map(i => i.id) });
        } catch (err) {
            console.error('[moveItem] Exception during persistence:', err);
        }
    },

    addUpdate: async (itemId, content, author, files, parentId) => {
        const { activeBoardId } = get();
        const newUpdate: Comment = {
            id: uuidv4(),
            content,
            author: author.name,
            userId: author.id,
            createdAt: new Date().toISOString(),
            ...(files && files.length > 0 ? { files } : {}),
            ...(parentId ? { parentId, contentType: 'Reply' as const } : {})
        };

        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : { ...i, updates: [newUpdate, ...(i.updates || [])] })
                };
            })
        }));

        const board = get().boards.find(b => b.id === activeBoardId);
        const item = board?.items.find(i => i.id === itemId);

        const written = await rewriteUpdates(set, activeBoardId, itemId, current => [newUpdate, ...current]);

        // Nothing was saved. Take the comment back off screen rather than leaving
        // it there looking posted, and tell the caller so the author gets their
        // text back instead of losing it to a silent failure.
        if (!written) {
            set(state => ({
                boards: state.boards.map(b => b.id !== activeBoardId ? b : {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : {
                        ...i,
                        updates: (i.updates || []).filter(u => u.id !== newUpdate.id)
                    }),
                    groups: b.groups.map(g => ({
                        ...g,
                        items: g.items.map(i => i.id !== itemId ? i : {
                            ...i,
                            updates: (i.updates || []).filter(u => u.id !== newUpdate.id)
                        })
                    }))
                })
            }));
            return false;
        }

        get().logActivity('item_comment_added', 'item', itemId, { board_id: activeBoardId, item_title: item?.title || 'Unknown Task' });

        // Mentions Logic
        // The text of the update, for the notification and the email; an update with only a
        // picture or a file has no words to show.
        const plainText = content.replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        const textPreview = plainText.substring(0, 300) || (/<img/i.test(content) ? '(image or GIF)' : (files && files.length > 0 ? '(attachment)' : ''));
        // Every notification link — email and in-app alike — resolves to the same
        // place: the board with the item open. Keep these in step if either side
        // changes.
        // updateId takes the link to this very update (or reply) inside the item.
        const itemLink = `${APP_URL}/?boardId=${activeBoardId}&itemId=${itemId}&updateId=${newUpdate.id}`;
        const dataIdRegex = /data-id="([^"]+)"/g;
        let dataIdMatch;
        const mentionedUserIds = new Set<string>();
        while ((dataIdMatch = dataIdRegex.exec(content)) !== null) {
            const mentionedUserId = dataIdMatch[1];
            if (mentionedUserId && mentionedUserId !== author.id) {
                mentionedUserIds.add(mentionedUserId);
                // Resolve mentioned user's display name from board members
                const mentionedMember = get().activeBoardMembers.find((m: any) => m.user_id === mentionedUserId);
                const mentionedUserName = mentionedMember?.profiles?.full_name || 'Someone';

                // In-app notification
                await get().createNotification(
                    mentionedUserId,
                    'mention',
                    `${author.name} mentioned you in "${item?.title || 'an update'}"`,
                    itemId,
                    { board_id: activeBoardId, updatePreview: textPreview, update_id: newUpdate.id }
                );

                // Board activity log
                get().logActivity('item_mention', 'item', itemId, {
                    board_id: activeBoardId,
                    item_title: item?.title || 'Unknown Task',
                    mentioned_user_name: mentionedUserName,
                });

                // Email notification (fire-and-forget)
                supabase.functions.invoke('invite-user', {
                    body: {
                        action: 'mention',
                        userId: mentionedUserId,
                        mentionedBy: author.name,
                        itemName: item?.title || 'an item',
                        boardName: board?.title || 'a board',
                        updatePreview: textPreview,
                        itemLink
                    }
                }).catch((e: unknown) => console.error('Mention email error:', e));
            }
        }

        // Plain-comment notification: alert the people on an item with its switch on,
        // even when they weren't @mentioned.
        // "Assignee" mirrors the convention already used for dashboard people-stats
        // (WorkspaceDashboardPage.tsx) — any people-type column's value, not just
        // one hardcoded "Person" column.
        // Everyone on the item except those switched off for it (a @mention above always notifies).
        const assigneeIds = new Set(peopleToNotify(board, item));
        for (const assigneeId of assigneeIds) {
            if (assigneeId === author.id || mentionedUserIds.has(assigneeId)) continue;
            await get().createNotification(
                assigneeId,
                'comment',
                parentId ? `${author.name} replied on "${item?.title || 'a task'}"` : `${author.name} posted an update on "${item?.title || 'a task'}"`,
                itemId,
                { board_id: activeBoardId, updatePreview: textPreview, update_id: newUpdate.id }
            );

            const assigneeEmail = await resolveAssigneeEmail(get, assigneeId);
            if (assigneeEmail) {
                supabase.functions.invoke('invite-user', {
                    body: {
                        action: 'comment',
                        email: assigneeEmail,
                        commenterName: author.name,
                        itemName: item?.title || 'an item',
                        boardName: board?.title || 'a board',
                        updatePreview: textPreview,
                        itemLink
                    }
                }).catch((e: unknown) => console.error('Comment email error:', e));
            }
        }

        return true;
    },

    deleteUpdate: async (itemId, updateId) => {
        const { activeBoardId } = get();
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : { ...i, updates: (i.updates || []).filter(u => u.id !== updateId) })
                };
            })
        }));

        await rewriteUpdates(set, activeBoardId, itemId, current => current.filter(u => u.id !== updateId));
    },

    toggleUpdateLike: async (itemId, updateId, user) => {
        const { activeBoardId } = get();
        let wasLiked = false;
        let updateAuthorId: string | undefined;
        let itemTitle: string | undefined;

        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => {
                        if (i.id !== itemId) return i;
                        itemTitle = i.title;
                        return {
                            ...i,
                            updates: (i.updates || []).map(u => {
                                if (u.id !== updateId) return u;
                                updateAuthorId = u.userId;
                                const likedBy = u.likedBy || [];
                                wasLiked = likedBy.includes(user.id);
                                return {
                                    ...u,
                                    likedBy: wasLiked ? likedBy.filter(id => id !== user.id) : [...likedBy, user.id]
                                };
                            })
                        };
                    })
                };
            })
        }));

        await rewriteUpdates(set, activeBoardId, itemId, current => current.map(u => {
            if (u.id !== updateId) return u;
            const likedBy = u.likedBy || [];
            return {
                ...u,
                likedBy: wasLiked ? likedBy.filter(id => id !== user.id) : [...likedBy, user.id]
            };
        }));

        // Notify the update's author when someone else likes it — not on unlike,
        // and not when liking your own update.
        if (!wasLiked && updateAuthorId && updateAuthorId !== user.id) {
            await get().createNotification(
                updateAuthorId,
                'like',
                `${user.name} liked your update on "${itemTitle || 'a task'}"`,
                itemId,
                { board_id: activeBoardId, update_id: updateId }
            );

            const authorEmail = await resolveAssigneeEmail(get, updateAuthorId);
            if (authorEmail) {
                supabase.functions.invoke('invite-user', {
                    body: {
                        action: 'like',
                        email: authorEmail,
                        likerName: user.name,
                        itemName: itemTitle || 'an item',
                        boardName: get().boards.find(b => b.id === activeBoardId)?.title || 'a board',
                        itemLink: `${APP_URL}/?boardId=${activeBoardId}&itemId=${itemId}&updateId=${updateId}`
                    }
                }).catch((e: unknown) => console.error('Like email error:', e));
            }
        }
    },

    editUpdate: async (itemId, updateId, newContent, files) => {
        const { activeBoardId } = get();
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    items: b.items.map(i => i.id !== itemId ? i : {
                        ...i,
                        updates: (i.updates || []).map(u => {
                            if (u.id !== updateId) return u;
                            const updated = { ...u, content: newContent };
                            if (files !== undefined) updated.files = files;
                            return updated;
                        })
                    })
                };
            })
        }));

        await rewriteUpdates(set, activeBoardId, itemId, current => current.map(u => {
            if (u.id !== updateId) return u;
            const updated: Comment = { ...u, content: newContent };
            if (files !== undefined) updated.files = files;
            return updated;
        }));
    },

    toggleShowHiddenItems: () => set(state => ({ showHiddenItems: !state.showHiddenItems })),
    setActiveItem: (itemId) => set({ activeItemId: itemId }),
    setHighlightedItem: (itemId) => set({ highlightedItemId: itemId }),
    setHighlightedUpdate: (updateId) => set({ highlightedUpdateId: updateId }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    setMyItemNotifications: async (itemId, on) => {
        const { activeBoardId } = get();
        const found = get().boards.flatMap(b => b.items).find(i => i.id === itemId);
        const me = useUserStore.getState().currentUser;
        if (!found || !me?.id) return;
        // What is stored is who is switched OFF
        const before = found.notifyMutedUserIds || [];
        const after = on ? before.filter(id => id !== me.id) : (before.includes(me.id) ? before : [...before, me.id]);
        if (after.length === before.length) return;
        const apply = (ids: string[]) => set(state => ({
            boards: state.boards.map(b => ({
                ...b,
                items: b.items.map(i => i.id === itemId ? { ...i, notifyMutedUserIds: ids } : i),
                groups: b.groups.map(g => ({ ...g, items: g.items.map(i => i.id === itemId ? { ...i, notifyMutedUserIds: ids } : i) })),
            })),
        }));
        apply(after);
        // Through the function, which (like a trigger on the table) only ever
        // touches the caller's own id, and works for people who cannot edit the item.
        const { error } = await supabase.rpc('set_item_notifications', { p_item_id: itemId, p_on: on });
        if (error) {
            console.error('[Notifications switch] Failed to save:', error);
            apply(before);
            return;
        }
        void get().logActivity(on ? 'item_notifications_on' : 'item_notifications_off', 'item', itemId, {
            board_id: activeBoardId, item_title: found.title || 'Unknown Task', person_names: [me.name || 'Someone'],
        });
    },
    toggleItemSelection: (itemId, selected) => {
        set(state => {
            const current = new Set(state.selectedItemIds);
            if (selected) current.add(itemId); else current.delete(itemId);
            return { selectedItemIds: Array.from(current), lastSelectedItemId: itemId };
        });
    },
    // Shift-click on a checkbox: tick every row between the last one ticked and
    // this one, in the order the table shows them (so a filter, a sort, grouping
    // and collapsed groups all count). The start has to still be ticked: after
    // the selection was cleared or the item unticked, a Shift-click is just an
    // ordinary tick, not a range from something the person has let go of.
    selectItemRange: (itemId) => {
        const { activeBoardId, boards, selectedItemIds, lastSelectedItemId, searchQuery, showHiddenItems } = get();
        const board = boards.find(b => b.id === activeBoardId);
        const anchor = lastSelectedItemId && selectedItemIds.includes(lastSelectedItemId) ? lastSelectedItemId : null;
        const range = board && anchor
            ? rangeBetween(checkableRows(tableRows(board, { searchQuery, showHiddenItems })), anchor, itemId)
            : null;
        if (!range) {
            get().toggleItemSelection(itemId, !selectedItemIds.includes(itemId));
            return;
        }
        set(state => ({
            selectedItemIds: Array.from(new Set([...state.selectedItemIds, ...range])),
            lastSelectedItemId: itemId
        }));
    },
    selectGroupItems: (groupId) => {
        const { activeBoardId, boards } = get();
        const board = boards.find(b => b.id === activeBoardId);
        const items = board?.items.filter(i => i.groupId === groupId) || [];
        set(state => {
            const current = new Set(state.selectedItemIds);
            items.forEach(i => current.add(i.id));
            return { selectedItemIds: Array.from(current) };
        });
    },
    clearSelection: () => set({ selectedItemIds: [], lastSelectedItemId: null }),
    deleteSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;
        const board = get().boards.find(b => b.id === activeBoardId);
        const childIds = (board?.items || [])
            .filter(i => i.parentId && selectedItemIds.includes(i.parentId))
            .map(i => i.id);
        const idsToArchive = [...new Set([...selectedItemIds, ...childIds])];

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.filter(i => !idsToArchive.includes(i.id)),
                groups: b.groups.map(g => ({ ...g, items: g.items.filter(i => !idsToArchive.includes(i.id)) }))
            } : b),
            selectedItemIds: []
        }));
        await supabase.from('items').update({ is_archived: true }).in('id', idsToArchive);
        get().logActivity('item_deleted', 'board', activeBoardId, {
            board_id: activeBoardId,
            count: idsToArchive.length
        });
    },

    duplicateSelectedItems: async () => {
        const { activeBoardId, selectedItemIds, boards } = get();
        if (!activeBoardId) return;
        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const selected = new Set(selectedItemIds);
        if (!board.items.some(i => selected.has(i.id))) return;

        // Copies used to be inserted as the client-side Item objects themselves —
        // groupId, boardId, parentId, updatesCount… none of which are columns on
        // `items` — with `order: source.order + 0.5` into an integer column. Every
        // insert was rejected, the error only went to the console, and the copy
        // that was already on screen vanished on the next load. Nothing anyone
        // duplicated (or renamed, or attached files to afterwards) was ever saved.
        //
        // Each copy now goes right after its source, and the board's order is
        // renumbered and saved the way a drag does (reorder_items).
        const now = new Date().toISOString();
        const copies: Item[] = [];
        const ordered = [...board.items].sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
        const withCopies: Item[] = [];
        ordered.forEach(item => {
            withCopies.push(item);
            if (!selected.has(item.id)) return;
            const copy: Item = {
                ...item,
                id: uuidv4(),
                title: `${item.title} (Copy)`,
                createdAt: now,
                // A copy starts its own conversation; the source keeps its comments.
                updates: [],
                updatesCount: 0,
                lastUpdateAt: undefined,
                updatesLoaded: true
            };
            copies.push(copy);
            withCopies.push(copy);
        });
        const renumbered = withCopies.map((item, index) => ({ ...item, order: index }));
        const copyIds = new Set(copies.map(c => c.id));

        const previous = { items: board.items, groups: board.groups };
        const applyItems = (items: Item[]) => set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items,
                groups: b.groups.map(g => ({ ...g, items: items.filter(i => i.groupId === g.id && !i.parentId) }))
            } : b)
        }));

        applyItems(renumbered);
        set({ selectedItemIds: [] });

        const { error } = await supabase.from('items').insert(renumbered.filter(i => copyIds.has(i.id)).map(c => ({
            id: c.id,
            board_id: activeBoardId,
            group_id: c.groupId,
            parent_id: c.parentId ?? null,
            title: c.title,
            values: c.values ?? {},
            files: c.files ?? [],
            is_hidden: c.isHidden ?? false,
            order: c.order
        })));

        if (error) {
            console.error('Failed to duplicate items:', error);
            set(state => ({
                boards: state.boards.map(b => b.id === activeBoardId ? { ...b, items: previous.items, groups: previous.groups } : b)
            }));
            showToast('Could not duplicate. Nothing was copied — please try again.', 'error');
            return;
        }

        await supabase.rpc('reorder_items', { _board_id: activeBoardId, _item_ids: renumbered.map(i => i.id) });

        copies.forEach(c => {
            get().logActivity('item_created', 'item', c.id, {
                board_id: activeBoardId,
                item_title: c.title,
                group_title: board.groups.find(g => g.id === c.groupId)?.title
            });
        });
    },

    hideSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: true } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: true } : i)
                }))
            } : b),
            selectedItemIds: []
        }));

        await supabase.from('items').update({ is_hidden: true }).in('id', selectedItemIds);
    },

    unhideSelectedItems: async () => {
        const { activeBoardId, selectedItemIds } = get();
        if (!activeBoardId) return;

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b,
                items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: false } : i),
                groups: b.groups.map(g => ({
                    ...g,
                    items: g.items.map(i => selectedItemIds.includes(i.id) ? { ...i, isHidden: false } : i)
                }))
            } : b),
            selectedItemIds: []
        }));

        await supabase.from('items').update({ is_hidden: false }).in('id', selectedItemIds);
    },

    moveSelectedItemsToTarget: async (groupId, targetBoardId, parentId = null) => {
        const { activeBoardId, selectedItemIds, boards } = get();
        if (!activeBoardId) return;

        const isCrossBoard = targetBoardId !== activeBoardId;

        // How the rows looked before the move: the Activity entry names where
        // they came from, and the Undo button puts them back as they were. A
        // parent's sub-items travel with it across boards (and are re-grouped
        // within one), so they are kept too.
        const moveStart = boards.find(b => b.id === activeBoardId);
        const chosen = new Set(selectedItemIds);
        const originals: Item[] = (moveStart?.items || []).filter(i => chosen.has(i.id) || (i.parentId && chosen.has(i.parentId)));
        const movedTitles = (moveStart?.items || []).filter(i => chosen.has(i.id)).map(i => i.title);
        const fromGroupTitles = [...new Set((moveStart?.items || []).filter(i => chosen.has(i.id)).map(i => moveStart?.groups.find(g => g.id === i.groupId)?.title).filter(Boolean))] as string[];
        const fromBoardTitle = moveStart?.title || '';

        // Within the board, work out where each moving row's values have to go
        // before anything moves: a parent changing group takes its sub-items to
        // that group's sub-item columns; a row becoming a sub-item goes to its new
        // parent's group's; a sub-item becoming an item goes to the item columns,
        // matched by name only (adding board-wide columns for one row would be a
        // surprise; an unmatched value stays stored, just not shown).
        const carry: CarryMove[] = [];
        const sourceBoard = boards.find(b => b.id === activeBoardId);
        if (!isCrossBoard && sourceBoard) {
            const byId = new Map(sourceBoard.items.map(i => [i.id, i]));
            const selected = new Set(selectedItemIds);
            const newParent = parentId ? byId.get(parentId) : undefined;
            selectedItemIds.forEach(id => {
                const item = byId.get(id);
                if (!item) return;
                const columnGroup = item.parentId ? (byId.get(item.parentId)?.groupId || item.groupId) : item.groupId;
                const from = item.parentId ? subitemColumns(sourceBoard.columns, columnGroup) : itemColumns(sourceBoard.columns);
                if (parentId) {
                    const targetGroup = newParent?.groupId || groupId;
                    if (!item.parentId || columnGroup !== targetGroup) {
                        carry.push({ rows: [item], from, scope: 'subitem', groupId: targetGroup, createMissing: true });
                    }
                } else if (item.parentId) {
                    carry.push({ rows: [item], from, scope: 'item', createMissing: false });
                } else if (item.groupId !== groupId) {
                    const subItems = sourceBoard.items.filter(i => i.parentId === item.id && !selected.has(i.id));
                    if (subItems.length > 0) {
                        carry.push({ rows: subItems, from: subitemColumns(sourceBoard.columns, item.groupId), scope: 'subitem', groupId, createMissing: true, regroup: groupId });
                    }
                }
            });
        }

        if (isCrossBoard) {
            // The target's columns are where the values go. The move menu opens
            // (loads) a board before offering its groups; make sure all the same.
            if (!get().boards.find(b => b.id === targetBoardId)?.isDataLoaded) {
                await get().loadBoardData(targetBoardId);
            }
            const sourceItems = boards.find(bd => bd.id === activeBoardId)?.items || [];
            const movingItems = sourceItems
                .filter(i => selectedItemIds.includes(i.id))
                .map(i => ({ ...i, groupId, boardId: targetBoardId, parentId: parentId || undefined }));

            // A parent's sub-items travel with it. Rows are loaded per board, so a
            // sub-item left behind has a parent that isn't on its board: it
            // disappears from the old board (no parent there any more) and never
            // shows on the new one (its board_id is still the old one). Only when
            // the rows stay top-level — one that becomes a sub-item has nothing
            // under it to bring.
            const selected = new Set(selectedItemIds);
            const followers = parentId
                ? []
                : sourceItems
                    .filter(i => i.parentId && selected.has(i.parentId) && !selected.has(i.id))
                    .map(i => ({ ...i, groupId, boardId: targetBoardId }));
            const leaving = new Set([...selectedItemIds, ...followers.map(i => i.id)]);
            const arriving = [...movingItems, ...followers];

            set(state => ({
                boards: state.boards.map(b => {
                    if (b.id === activeBoardId) {
                        return {
                            ...b,
                            items: b.items.filter(i => !leaving.has(i.id)),
                            groups: b.groups.map(g => ({
                                ...g,
                                items: g.items.filter(i => !leaving.has(i.id))
                            }))
                        };
                    }
                    if (b.id === targetBoardId && b.isDataLoaded) {
                        return {
                            ...b,
                            items: [...b.items, ...arriving],
                            groups: b.groups.map(g => g.id === groupId
                                ? { ...g, items: [...g.items, ...arriving] }
                                : g
                            )
                        };
                    }
                    return b;
                }),
                selectedItemIds: []
            }));

            // Parents first: a sub-item's group/board are those of the parent it
            // ends up under.
            await supabase.from('items')
                .update({ group_id: groupId, board_id: targetBoardId, parent_id: parentId })
                .in('id', selectedItemIds);
            if (followers.length > 0) {
                await supabase.from('items')
                    .update({ group_id: groupId, board_id: targetBoardId })
                    .in('id', followers.map(i => i.id));
            }

            // Values are keyed by column id and every board has its own columns,
            // so a moved row kept its name and updates and showed nothing else.
            // Each value goes to the target's column of the same type (the same
            // title first, then the next of that type), status labels by name.
            // Items fill the target's own columns only; sub-items get their new
            // group's sub-item columns, missing ones added, as when a parent
            // changes group. A value with no column of its type there stays
            // stored under its old column — moved back, it shows again.
            const target = get().boards.find(b => b.id === targetBoardId);
            if (sourceBoard && target?.isDataLoaded) {
                const byId = new Map(sourceBoard.items.map(i => [i.id, i]));
                const subGroupOf = (row: Item) => (row.parentId ? byId.get(row.parentId)?.groupId : undefined) || row.groupId;
                const targetParentGroup = parentId
                    ? target.items.find(i => i.id === parentId)?.groupId || groupId
                    : groupId;
                const sets = new Map<string, { rows: Item[]; from: Column[] }>();
                const addTo = (key: string, from: () => Column[], row: Item) => {
                    const set = sets.get(key) || { rows: [], from: from() };
                    set.rows.push(row);
                    sets.set(key, set);
                };
                selectedItemIds.forEach(id => {
                    const row = byId.get(id);
                    if (!row) return;
                    if (row.parentId) addTo(`sub:${subGroupOf(row)}`, () => subitemColumns(sourceBoard.columns, subGroupOf(row)), row);
                    else addTo('item', () => itemColumns(sourceBoard.columns), row);
                });
                const crossCarry: CarryMove[] = [...sets.values()].map(({ rows, from }) => parentId
                    ? { rows, from, scope: 'subitem' as const, groupId: targetParentGroup, createMissing: true, match: 'type' as const }
                    : { rows, from, scope: 'item' as const, createMissing: false, match: 'type' as const });
                const followersBySourceGroup = new Map<string, Item[]>();
                followers.forEach(f => {
                    const original = byId.get(f.id);
                    if (!original) return;
                    const key = subGroupOf(original);
                    followersBySourceGroup.set(key, [...(followersBySourceGroup.get(key) || []), original]);
                });
                followersBySourceGroup.forEach((rows, sourceGroup) => crossCarry.push({
                    rows, from: subitemColumns(sourceBoard.columns, sourceGroup), scope: 'subitem', groupId, createMissing: true, match: 'type',
                }));
                await carryValues(set, get, targetBoardId, crossCarry);
            }
        } else {
            set(state => ({
                boards: state.boards.map(b => b.id === activeBoardId ? {
                    ...b,
                    items: b.items.map(i => selectedItemIds.includes(i.id) ? { ...i, groupId, parentId: parentId || undefined } : i),
                    groups: b.groups.map(g => {
                        if (g.id === groupId) {
                            const currentItems = g.items;
                            const incoming = boards.find(bd => bd.id === activeBoardId)?.items.filter(i => selectedItemIds.includes(i.id)) || [];
                            return { ...g, items: [...currentItems, ...incoming.map(i => ({ ...i, groupId, parentId: parentId || undefined }))] };
                        }
                        return { ...g, items: g.items.filter(i => !selectedItemIds.includes(i.id)) };
                    })
                } : b),
                selectedItemIds: []
            }));

            await supabase.from('items').update({ group_id: groupId, parent_id: parentId }).in('id', selectedItemIds);
            await carryValues(set, get, activeBoardId, carry);
        }

        // Where they went, for the Activity panel (it shows on both boards) and the message
        const targetBoard = get().boards.find(b => b.id === targetBoardId);
        const toBoardTitle = targetBoard?.title || '';
        const toGroupTitle = targetBoard?.groups.find(g => g.id === groupId)?.title || '';
        const count = movedTitles.length;
        if (count === 0) return;
        const meta = {
            board_id: activeBoardId,
            from_board_id: activeBoardId,
            to_board_id: targetBoardId,
            from_board_title: fromBoardTitle,
            to_board_title: toBoardTitle,
            from_group_titles: fromGroupTitles,
            to_group_title: toGroupTitle,
            count,
            item_titles: movedTitles.slice(0, 5),
            as_subitems: !!parentId,
        };
        // One entry on each board it touches: the Activity panel and the access rule
        // for who may read an entry both go by the board it is filed under.
        const logMove = (action: string) => {
            void get().logActivity(action, 'board', activeBoardId, meta);
            if (isCrossBoard) void get().logActivity(action, 'board', targetBoardId, { ...meta, board_id: targetBoardId });
        };
        logMove('items_moved');
        const what = count === 1 ? `"${movedTitles[0]}"` : `${count} tasks`;
        offerUndo(
            isCrossBoard ? `Moved ${what} to ${toBoardTitle ? `"${toBoardTitle}"` : 'another board'}` : `Moved ${what} to ${toGroupTitle ? `"${toGroupTitle}"` : 'another group'}`,
            async () => {
                await restoreMovedRows(set, get, originals);
                logMove('items_move_undone');
            }
        );
    },

    setDraft: (itemId, content) => set(state => ({ drafts: { ...state.drafts, [itemId]: content } })),
});
