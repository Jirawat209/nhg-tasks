import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ChevronDown, Copy, ExternalLink, MoreHorizontal, Pencil, Reply, ThumbsUp, Trash2 } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import { displayUpdateHtml } from '../../lib/linkify';
import { getDedupedUpdates, repliesTo, splitThreads } from '../../lib/updates';
import type { Comment, FileLink, Item } from '../../types';
import { Avatar, AvatarStack, BottomSheet, CenteredSpinner, EmptyState, PrimaryButton, mobileToast, shortAge, type PersonInfo } from '../ui';
import { FileIcon } from '../cells/CellView';
import type { ComposerMode } from './Composer';

interface Me {
    id: string;
    name: string;
    avatar?: string;
}

/** Desktop's rule: you may edit or delete what you posted. */
const isMine = (update: Comment, me: Me) => update.userId === me.id || update.author === me.name;

/** An update's words, with its paragraphs and line breaks, for the clipboard. */
const htmlToText = (html: string) => {
    const withBreaks = sanitizeHtml(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
};

/** A link tapped inside an update opens beside the app rather than replacing it. */
const openLinksOutside = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!anchor || !href) return;
    e.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
};

const Attachments = ({ files }: { files: FileLink[] }) => (
    <div className="m-update__files">
        {files.map(file => (
            <a key={file.id} className="m-update__file" href={file.url} target="_blank" rel="noopener noreferrer">
                <FileIcon file={file} size={18} />
                <span className="m-truncate">{file.name}</span>
                <ExternalLink size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
            </a>
        ))}
    </div>
);

/** One post or reply's head: picture, name, how long ago, and its "…". */
const UpdateHead = ({ update, avatarUrl, size, onMore }: { update: Comment; avatarUrl: string | null; size: number; onMore: () => void }) => (
    <header className="m-update__head">
        <Avatar name={update.author} src={avatarUrl} size={size} />
        <div className="m-update__who">
            <span className="m-update__author m-truncate">{update.author}</span>
            <span className="m-update__time">{shortAge(update.createdAt)}</span>
        </div>
        <button type="button" className="m-update__more" onClick={onMore} aria-label="More actions">
            <MoreHorizontal size={22} />
        </button>
    </header>
);

const UpdateBody = ({ update }: { update: Comment }) => (
    <>
        {/* Stored as typed and live in every teammate's session: always through sanitizeHtml (displayUpdateHtml), plain addresses made links. */}
        <div className="m-update__body narai-update-content m-rich" onClick={openLinksOutside} dangerouslySetInnerHTML={{ __html: displayUpdateHtml(update.content) }} />
        {update.files && update.files.length > 0 && <Attachments files={update.files} />}
    </>
);

/** A post — reference screenshot 19: author, text, replies and likes, then Like | Reply. */
const UpdateCard = memo(({ update, replies, me, avatarOf, expanded, onToggleReplies, onLike, onReply, onMore }: {
    update: Comment;
    replies: Comment[];
    me: Me;
    avatarOf: (userId?: string) => string | null;
    expanded: boolean;
    onToggleReplies: (id: string) => void;
    onLike: (update: Comment) => void;
    onReply: (update: Comment) => void;
    onMore: (update: Comment) => void;
}) => {
    const likes = update.likedBy?.length || 0;
    const liked = !!update.likedBy?.includes(me.id);
    // Oldest first under a post, so a thread reads as a conversation.
    const thread = useMemo(() => [...replies].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')), [replies]);
    const repliers = useMemo(() => {
        const seen = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
        thread.forEach(r => {
            const key = r.userId || r.author;
            if (!seen.has(key)) seen.set(key, { id: key, name: r.author, avatarUrl: avatarOf(r.userId) });
        });
        return [...seen.values()];
    }, [thread, avatarOf]);

    return (
        <article className="m-update" data-testid="m-update" data-update-id={update.id}>
            <div className="m-update__main">
                <UpdateHead update={update} avatarUrl={avatarOf(update.userId)} size={46} onMore={() => onMore(update)} />
                <UpdateBody update={update} />

                {(thread.length > 0 || likes > 0) && (
                    <div className="m-update__meta">
                        {thread.length > 0 && (
                            <button type="button" className="m-update__replies-toggle" onClick={() => onToggleReplies(update.id)} aria-expanded={expanded}>
                                <AvatarStack people={repliers} max={2} size={24} />
                                <span>{thread.length} {thread.length === 1 ? 'reply' : 'replies'}</span>
                                <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                            </button>
                        )}
                        {thread.length > 0 && likes > 0 && <span className="m-update__meta-sep" aria-hidden="true" />}
                        {likes > 0 && (
                            <span className="m-update__likes" aria-label={`${likes} ${likes === 1 ? 'like' : 'likes'}`}>
                                <ThumbsUp size={16} fill="#fdab3d" color="#d48806" /> {likes}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {expanded && thread.length > 0 && (
                <div className="m-update__thread">
                    {thread.map(reply => (
                        <div key={reply.id} className="m-reply" data-update-id={reply.id}>
                            <UpdateHead update={reply} avatarUrl={avatarOf(reply.userId)} size={34} onMore={() => onMore(reply)} />
                            <div className="m-reply__body"><UpdateBody update={reply} /></div>
                        </div>
                    ))}
                </div>
            )}

            <div className="m-update__actions">
                <button type="button" className={`m-update__action${liked ? ' m-update__action--on' : ''}`} onClick={() => onLike(update)} aria-pressed={liked}>
                    <ThumbsUp size={22} strokeWidth={1.6} fill={liked ? '#fdab3d' : 'none'} color={liked ? '#d48806' : 'currentColor'} />
                    Like
                </button>
                <button type="button" className="m-update__action" onClick={() => onReply(update)}>
                    <Reply size={22} strokeWidth={1.6} />
                    Reply
                </button>
            </div>
        </article>
    );
});
UpdateCard.displayName = 'UpdateCard';

/**
 * The item's updates, newest post first — the same list as the desktop panel
 * (getDedupedUpdates → splitThreads), loaded on open if the board only had the
 * counts so far.
 */
export const UpdatesTab = ({ item, people, onCompose, expandedThreads, onToggleThread, onExpandThread }: {
    item: Item;
    people: Map<string, PersonInfo>;
    onCompose: (mode: ComposerMode) => void;
    expandedThreads: Set<string>;
    onToggleThread: (id: string) => void;
    /** Opens a thread (and leaves it open if it already is). */
    onExpandThread: (id: string) => void;
}) => {
    const loadItemUpdates = useBoardStore(state => state.loadItemUpdates);
    const toggleUpdateLike = useBoardStore(state => state.toggleUpdateLike);
    const deleteUpdate = useBoardStore(state => state.deleteUpdate);
    const currentUser = useUserStore(state => state.currentUser);
    const [menuFor, setMenuFor] = useState<Comment | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

    useEffect(() => {
        if (item.updatesLoaded === false) void loadItemUpdates(item.id);
    }, [item.id, item.updatesLoaded, loadItemUpdates]);

    const updates = useMemo(() => getDedupedUpdates(item.updates) as Comment[], [item.updates]);

    // Opened from a notification or a link about one update: open its thread if it
    // is a reply, scroll to it and let it glow (the same flash as the desktop panel).
    const highlightedUpdateId = useBoardStore(state => state.highlightedUpdateId);
    const setHighlightedUpdate = useBoardStore(state => state.setHighlightedUpdate);
    useEffect(() => {
        if (!highlightedUpdateId) return;
        const target = updates.find(u => u.id === highlightedUpdateId);
        if (target?.parentId) onExpandThread(target.parentId);
        let tries = 0;
        const timer = window.setInterval(() => {
            const el = document.querySelector<HTMLElement>(`[data-update-id="${CSS.escape(highlightedUpdateId)}"]`);
            if (el) {
                window.clearInterval(timer);
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.remove('update-flash');
                void el.offsetWidth;
                el.classList.add('update-flash');
                window.setTimeout(() => el.classList.remove('update-flash'), 3400);
                setHighlightedUpdate(null);
            } else if (++tries > 40) {
                window.clearInterval(timer);
                setHighlightedUpdate(null);
            }
        }, 150);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightedUpdateId, updates.length]);
    const { topLevel, replies } = useMemo(() => splitThreads(updates) as { topLevel: Comment[]; replies: Comment[] }, [updates]);

    const me: Me = useMemo(() => ({ id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar }), [currentUser.id, currentUser.name, currentUser.avatar]);
    // Board members' pictures, then your own for what you just posted (desktop's rule).
    const avatarOf = useMemo(() => (userId?: string): string | null => {
        if (!userId) return null;
        const person = people.get(userId);
        if (person?.avatarUrl) return person.avatarUrl;
        if (userId === me.id && me.avatar?.startsWith('http')) return me.avatar;
        return null;
    }, [people, me]);

    const like = (update: Comment) => void toggleUpdateLike(item.id, update.id, { id: me.id, name: me.name });

    if (item.updatesLoaded === false && (item.updatesCount ?? 0) > 0) {
        return <CenteredSpinner message="Loading updates…" />;
    }

    return (
        <>
            {topLevel.length === 0 ? (
                <EmptyState title="No updates yet">Share progress, mention someone or attach a file — it all lives here.</EmptyState>
            ) : (
                <div className="m-updates">
                    {topLevel.map(update => (
                        <UpdateCard
                            key={update.id}
                            update={update}
                            replies={repliesTo(replies, update)}
                            me={me}
                            avatarOf={avatarOf}
                            expanded={expandedThreads.has(update.id)}
                            onToggleReplies={onToggleThread}
                            onLike={like}
                            onReply={(parent) => onCompose({ kind: 'reply', parent })}
                            onMore={setMenuFor}
                        />
                    ))}
                </div>
            )}

            <BottomSheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.contentType === 'Reply' || menuFor?.parentId ? 'Reply' : 'Update'}>
                <div style={{ padding: '6px 0 16px' }}>
                    {menuFor && isMine(menuFor, me) && (
                        <button type="button" className="m-action" onClick={() => { const u = menuFor; setMenuFor(null); onCompose({ kind: 'edit', update: u }); }}>
                            <span className="m-action__icon"><Pencil size={20} /></span>
                            <span style={{ flex: 1 }}>Edit</span>
                        </button>
                    )}
                    <button
                        type="button"
                        className="m-action"
                        onClick={() => {
                            const text = menuFor ? htmlToText(menuFor.content) : '';
                            setMenuFor(null);
                            navigator.clipboard?.writeText(text).then(() => mobileToast('Text copied')).catch(() => mobileToast('Could not copy', 'error'));
                        }}
                    >
                        <span className="m-action__icon"><Copy size={20} /></span>
                        <span style={{ flex: 1 }}>Copy text</span>
                    </button>
                    {menuFor && isMine(menuFor, me) && (
                        <button type="button" className="m-action m-action--danger" onClick={() => { const u = menuFor; setMenuFor(null); setConfirmDelete(u); }}>
                            <span className="m-action__icon"><Trash2 size={20} /></span>
                            <span style={{ flex: 1 }}>Delete</span>
                        </button>
                    )}
                </div>
            </BottomSheet>

            <BottomSheet open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this update?">
                <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 15, color: 'hsl(var(--m-text-2))' }}>It will be removed for everyone on this board.</div>
                    <PrimaryButton
                        style={{ background: 'hsl(var(--color-danger))' }}
                        onClick={() => {
                            const target = confirmDelete;
                            setConfirmDelete(null);
                            if (target) void deleteUpdate(item.id, target.id);
                        }}
                    >
                        Delete
                    </PrimaryButton>
                </div>
            </BottomSheet>
        </>
    );
};
