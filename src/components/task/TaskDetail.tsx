import { useState, useEffect, useRef } from 'react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { X, MessageSquare, FileText, Trash2, Plus, ExternalLink, Edit2, Paperclip, Link2, ChevronDown, ThumbsUp, Reply as ReplyIcon } from 'lucide-react';
import { GifStickerPicker } from '../ui/GifStickerPicker';
import { ConfirmModal } from '../ui/ConfirmModal';
import { RichTextEditor } from '../ui/RichTextEditor';
import { fileLinkFromUrl, ONEDRIVE_ICON } from '../../lib/fileLinks';
import { LOCAL_ICONS } from '../../lib/localIcons';
import { useCloudDrives } from '../../hooks/useCloudDrives';
import { v4 as uuidv4 } from 'uuid';
import type { FileLink } from '../../types';
import { useGooglePicker } from '../../hooks/useGooglePicker';
import { DependenciesSection } from './DependenciesSection';
import { ItemNotifySwitch } from './ItemNotifySwitch';
import { displayUpdateHtml } from '../../lib/linkify';
import { getDedupedUpdates, hasHtmlContent, repliesTo, splitThreads } from '../../lib/updates';

export const TaskDetail = ({ itemId, onClose }: { itemId: string; onClose: () => void }) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId));
    const activeItem = board?.items.find(i => i.id === itemId);
    const addUpdate = useBoardStore(state => state.addUpdate);
    const editUpdate = useBoardStore(state => state.editUpdate);
    const deleteUpdate = useBoardStore(state => state.deleteUpdate);
    const toggleUpdateLike = useBoardStore(state => state.toggleUpdateLike);
    const loadItemUpdates = useBoardStore(state => state.loadItemUpdates);
    const [sendError, setSendError] = useState<string | null>(null);
    const updateItemTitle = useBoardStore(state => state.updateItemTitle);
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);

    // Global Draft State (Persistence)
    const draftText = useBoardStore(state => state.drafts[itemId] || '');
    const setDraft = useBoardStore(state => state.setDraft);

    const { currentUser } = useUserStore();

    // Resolve a post author's real profile picture: board members first, falling back
    // to the signed-in user's own avatar when the post is theirs (e.g. just-created updates).
    const getAuthorAvatarUrl = (userId?: string): string | null => {
        if (!userId) return null;
        const member = activeBoardMembers.find((m: any) => m.user_id === userId);
        if (member?.profiles?.avatar_url) return member.profiles.avatar_url;
        if (userId === currentUser.id && currentUser.avatar?.startsWith('http')) return currentUser.avatar;
        return null;
    };

    const [activeTab, setActiveTab] = useState<'updates' | 'files'>('updates');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
    const [editUpdateContent, setEditUpdateContent] = useState<string>('');

    // Reply State — every top-level update shows its own always-visible reply box
    // (Monday.com style), so drafts/files/popovers are keyed by the parent update's id
    // rather than a single shared field.
    const [openReplyBoxId, setOpenReplyBoxId] = useState<string | null>(null);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [replyFiles, setReplyFiles] = useState<Record<string, FileLink[]>>({});
    const [replyActiveUrlId, setReplyActiveUrlId] = useState<string | null>(null);
    const [replyAttachUrl, setReplyAttachUrl] = useState('');
    const [replyAttachError, setReplyAttachError] = useState<string | null>(null);
    const [replyActiveGifId, setReplyActiveGifId] = useState<string | null>(null);
    const [replyGifPickerPos, setReplyGifPickerPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
    const [replyActiveEmojiId, setReplyActiveEmojiId] = useState<string | null>(null);
    const [replyEmojiPickerPos, setReplyEmojiPickerPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
    const [replyEmojiSearch, setReplyEmojiSearch] = useState('');
    const replyEmojiButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const replyGifButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const replyEmojiPickerRef = useRef<HTMLDivElement>(null);
    // File Tab State
    const [fileUrl, setFileUrl] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileError, setFileError] = useState<string | null>(null);

    // Updates Attach State
    const [draftFiles, setDraftFiles] = useState<FileLink[]>([]);
    const [showUrlPanel, setShowUrlPanel] = useState(false);
    const [attachUrl, setAttachUrl] = useState('');
    const [attachError, setAttachError] = useState<string | null>(null);
    const [showEmojiPanel, setShowEmojiPanel] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifPickerPos, setGifPickerPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
    const [emojiPickerPos, setEmojiPickerPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
    const [emojiSearch, setEmojiSearch] = useState('');
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const gifButtonRef = useRef<HTMLButtonElement>(null);
    const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Edit mode action bar state
    const [showEditEmojiPanel, setShowEditEmojiPanel] = useState(false);
    const [showEditGifPicker, setShowEditGifPicker] = useState(false);
    const [editGifPickerPos, setEditGifPickerPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
    const [editEmojiPickerPos, setEditEmojiPickerPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
    const [editEmojiSearch, setEditEmojiSearch] = useState('');
    const [showEditUrlPanel, setShowEditUrlPanel] = useState(false);
    const [editAttachUrl, setEditAttachUrl] = useState('');
    const [editDraftFiles, setEditDraftFiles] = useState<FileLink[]>([]);
    const editEmojiButtonRef = useRef<HTMLButtonElement>(null);
    const editEmojiPickerRef = useRef<HTMLDivElement>(null);
    const editGifButtonRef = useRef<HTMLButtonElement>(null);

    // The board opens on comment counts alone and fills the bodies in behind it.
    // Waiting on that pass would leave this panel on "Loading updates…" for as
    // long as it takes — or for good, if it failed for this item — so the open
    // task fetches its own comments straight away.
    useEffect(() => {
        if (activeItem && activeItem.updatesLoaded === false) {
            loadItemUpdates(itemId);
        }
    }, [itemId, activeItem?.updatesLoaded, activeItem, loadItemUpdates]);

    // Opened from a notification or an emailed link about one update: show the
    // Updates tab, scroll to that update (or reply) and let it glow. The update may
    // not be on screen yet (the panel is sliding in, the comments are still
    // loading), so look for it for a few seconds before giving up.
    const highlightedUpdateId = useBoardStore(state => state.highlightedUpdateId);
    const setHighlightedUpdate = useBoardStore(state => state.setHighlightedUpdate);
    useEffect(() => {
        if (!highlightedUpdateId) return;
        setActiveTab('updates');
        let tries = 0;
        const timer = window.setInterval(() => {
            const el = document.querySelector<HTMLElement>(`[data-update-id="${CSS.escape(highlightedUpdateId)}"]`);
            if (el) {
                window.clearInterval(timer);
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.remove('update-flash');
                void el.offsetWidth; // restart the animation if it is flashed again
                el.classList.add('update-flash');
                window.setTimeout(() => el.classList.remove('update-flash'), 3400);
                setHighlightedUpdate(null);
            } else if (++tries > 40) {
                window.clearInterval(timer);
                setHighlightedUpdate(null);
            }
        }, 150);
        return () => window.clearInterval(timer);
    }, [highlightedUpdateId, itemId, setHighlightedUpdate]);

    // Auto-grow the item title textarea up to 2 lines as content changes
    useEffect(() => {
        const el = titleTextareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 64)}px`;
    }, [activeItem?.title]);

    useEffect(() => {
        if (!showEmojiPanel) return;
        const handler = (e: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node) &&
                emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) {
                setShowEmojiPanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showEmojiPanel]);

    useEffect(() => {
        if (!replyActiveEmojiId) return;
        const handler = (e: MouseEvent) => {
            const btn = replyEmojiButtonRefs.current[replyActiveEmojiId];
            if (replyEmojiPickerRef.current && !replyEmojiPickerRef.current.contains(e.target as Node) &&
                btn && !btn.contains(e.target as Node)) {
                setReplyActiveEmojiId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [replyActiveEmojiId]);

    useEffect(() => {
        if (!showEditEmojiPanel) return;
        const handler = (e: MouseEvent) => {
            if (editEmojiPickerRef.current && !editEmojiPickerRef.current.contains(e.target as Node) &&
                editEmojiButtonRef.current && !editEmojiButtonRef.current.contains(e.target as Node)) {
                setShowEditEmojiPanel(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showEditEmojiPanel]);


    const updateItemFiles = useBoardStore(state => state.updateItemFiles);
    const { openPicker } = useGooglePicker();
    const drives = useCloudDrives();

    const handleAddFile = () => {
        if (!fileUrl.trim()) return;

        const newFile = fileLinkFromUrl(fileUrl, fileName, uuidv4);
        if (!newFile || newFile.type === 'file-url') {
            setFileError('Only Google Drive or OneDrive / SharePoint links are allowed.');
            return;
        }

        const currentFiles = activeItem?.files || [];
        updateItemFiles(itemId, [...currentFiles, newFile]);

        // Reset form
        setFileUrl('');
        setFileName('');
        setFileError(null);
    };

    // FIX: Keep component mounted when reloading data to preserve typed text
    if (!activeItem) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '32px', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--color-text-tertiary))' }}>
                <div style={{
                    width: '24px',
                    height: '24px',
                    border: '3px solid hsl(var(--color-border))',
                    borderTop: '3px solid hsl(var(--color-brand-primary))',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                <p style={{ marginTop: '16px', fontSize: '14px' }}>Loading item...</p>
            </div>
        );
    }

    // Falls back to the count the board opened with, so the tab shows the right
    // number even in the moment before the comment bodies have arrived.
    const updatesTabCount = activeItem.updatesLoaded === false
        ? (activeItem.updatesCount ?? 0)
        : getDedupedUpdates(activeItem.updates).length;

    const EMOJI_CATEGORIES = [
        { label: 'Smileys & People', emojis: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😎','🤩','🥳','😢','😭','😤','😠','🤯','😳','🥺','😱','🤔','🤗','😴','🫡','😒','😏','🤭','🙄','😌'] },
        { label: 'Gestures', emojis: ['👍','👎','👋','✌️','🤞','👌','🙏','👏','🤝','💪','🤙','🫶','🤜','🤛','👊','✊','🖐️','👐','🤲','🫱'] },
        { label: 'Love & Symbols', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💯','🔥','⭐','✨','🌟','💫','🎊','🎉','🏆','🥇'] },
        { label: 'Objects & Alerts', emojis: ['✅','❌','⚠️','💡','📌','📎','🎯','🚀','💬','📝','🔑','💎','🎁','📅','📊','🔔','🎶','🌈','🍕','🌙'] },
    ];

    const handleEmojiSelect = (emoji: string) => {
        setDraft(itemId, draftText + emoji);
        setShowEmojiPanel(false);
    };

    const handleGifSelect = (url: string) => {
        setDraft(itemId, draftText + `<img src="${url}" alt="GIF" style="max-width:100%;border-radius:6px;margin:4px 0;" />`);
    };

    const handleAddEditAttachUrl = () => {
        if (!editAttachUrl.trim()) return;
        const attached = fileLinkFromUrl(editAttachUrl, '', uuidv4);
        if (!attached) return;
        setEditDraftFiles(prev => [...prev, attached]);
        setEditAttachUrl('');
        setShowEditUrlPanel(false);
    };

    const handleEditEmojiSelect = (emoji: string) => {
        setEditUpdateContent(editUpdateContent + emoji);
        setShowEditEmojiPanel(false);
    };

    const handleEditGifSelect = (url: string) => {
        setEditUpdateContent(editUpdateContent + `<img src="${url}" alt="GIF" style="max-width:100%;border-radius:6px;margin:4px 0;" />`);
    };

    const toggleEditGifPicker = () => {
        if (showEditGifPicker) { setShowEditGifPicker(false); return; }
        if (editGifButtonRef.current) {
            const rect = editGifButtonRef.current.getBoundingClientRect();
            setEditGifPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
        }
        setShowEditGifPicker(true);
    };

    const toggleGifPicker = () => {
        if (showGifPicker) {
            setShowGifPicker(false);
            return;
        }
        if (gifButtonRef.current) {
            const rect = gifButtonRef.current.getBoundingClientRect();
            setGifPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
        }
        setShowGifPicker(true);
        setShowUrlPanel(false);
    };

    const calcPickerPos = (rect: DOMRect): { top?: number; bottom?: number; left: number } => {
        const PICKER_HEIGHT = 390;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 328));
        if (rect.top > PICKER_HEIGHT + 8) {
            // Enough space above button → anchor from bottom (appear above)
            return { bottom: window.innerHeight - rect.top + 8, left };
        }
        // Not enough space above → appear below button
        return { top: rect.bottom + 8, left };
    };

    const toggleEmojiPicker = () => {
        if (showEmojiPanel) { setShowEmojiPanel(false); return; }
        if (emojiButtonRef.current) {
            setEmojiPickerPos(calcPickerPos(emojiButtonRef.current.getBoundingClientRect()));
        }
        setEmojiSearch('');
        setShowEmojiPanel(true);
    };

    const toggleEditEmojiPicker = () => {
        if (showEditEmojiPanel) { setShowEditEmojiPanel(false); return; }
        if (editEmojiButtonRef.current) {
            setEditEmojiPickerPos(calcPickerPos(editEmojiButtonRef.current.getBoundingClientRect()));
        }
        setEditEmojiSearch('');
        setShowEditEmojiPanel(true);
    };

    const handleAddAttachUrl = () => {
        if (!attachUrl.trim()) return;
        const attached = fileLinkFromUrl(attachUrl, '', uuidv4);
        if (!attached) return;
        setDraftFiles(prev => [...prev, attached]);
        setAttachUrl('');
        setAttachError(null);
        setShowUrlPanel(false);
    };

    const handleSendUpdate = async () => {
        // Strip HTML tags to check if empty
        const textOnly = draftText.replace(/<[^>]*>/g, '').trim();
        if (!textOnly && !draftText.includes('<img') && draftFiles.length === 0) return;

        const sentText = draftText;
        const sentFiles = draftFiles;

        setDraft(itemId, '');
        setDraftFiles([]);
        setShowUrlPanel(false);
        setSendError(null);

        const saved = await addUpdate(itemId, sentText, { name: currentUser.name, id: currentUser.id, userId: currentUser.id }, sentFiles);

        // The comment never reached the database. Put it back in the box: the
        // alternative is what used to happen — the composer cleared, the comment
        // showed in the thread until the next reload, and the text was gone.
        if (!saved) {
            setDraft(itemId, sentText);
            setDraftFiles(sentFiles);
            setSendError('Your comment was not saved. It is back in the box — please try again.');
        }
    };

    const handleDeleteClick = (updateId: string) => {
        setDeleteConfirmId(updateId);
    };

    const getReplyDraft = (updateId: string) => replyDrafts[updateId] || '';
    const setReplyDraftFor = (updateId: string, val: string) =>
        setReplyDrafts(prev => ({ ...prev, [updateId]: val }));

    const handleSendReply = async (parentId: string) => {
        const draft = getReplyDraft(parentId);
        const files = replyFiles[parentId] || [];
        if (!hasHtmlContent(draft) && files.length === 0) return;

        setReplyDrafts(prev => ({ ...prev, [parentId]: '' }));
        setReplyFiles(prev => ({ ...prev, [parentId]: [] }));
        setOpenReplyBoxId(null);
        setSendError(null);

        const saved = await addUpdate(itemId, draft, { name: currentUser.name, id: currentUser.id, userId: currentUser.id }, files, parentId);

        // Same as the main composer: a reply that failed to save is handed back
        // rather than dropped.
        if (!saved) {
            setReplyDrafts(prev => ({ ...prev, [parentId]: draft }));
            setReplyFiles(prev => ({ ...prev, [parentId]: files }));
            setOpenReplyBoxId(parentId);
            setSendError('Your reply was not saved. It is back in the box — please try again.');
        }
    };

    // Types into an update or reply editor at the caret (or at the end if it wasn't
    // focused), as if the user had — so '@' opens the mention list and an
    // emoji lands inside the text rather than after its closing tag.
    const insertIntoEditor = (elementId: string, text: string) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        if (document.activeElement !== el) {
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
        document.execCommand('insertText', false, text);
    };
    const insertIntoReply = (updateId: string, text: string) => insertIntoEditor(`reply-input-${updateId}`, text);

    const handleReplyEmojiSelect = (updateId: string, emoji: string) => {
        setReplyActiveEmojiId(null);
        insertIntoReply(updateId, emoji);
    };

    const toggleReplyEmojiPicker = (updateId: string) => {
        if (replyActiveEmojiId === updateId) { setReplyActiveEmojiId(null); return; }
        const btn = replyEmojiButtonRefs.current[updateId];
        if (btn) setReplyEmojiPickerPos(calcPickerPos(btn.getBoundingClientRect()));
        setReplyEmojiSearch('');
        setReplyActiveEmojiId(updateId);
        setReplyActiveGifId(null);
        setReplyActiveUrlId(null);
    };

    const toggleReplyGifPicker = (updateId: string) => {
        if (replyActiveGifId === updateId) { setReplyActiveGifId(null); return; }
        const btn = replyGifButtonRefs.current[updateId];
        if (btn) {
            const rect = btn.getBoundingClientRect();
            setReplyGifPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
        }
        setReplyActiveGifId(updateId);
        setReplyActiveEmojiId(null);
        setReplyActiveUrlId(null);
    };

    const handleReplyGifSelect = (updateId: string, url: string) => {
        setReplyFiles(prev => ({
            ...prev,
            [updateId]: [...(prev[updateId] || []), { id: uuidv4(), name: 'GIF', url, type: 'file-url' }]
        }));
        setReplyActiveGifId(null);
    };

    const handleAddReplyAttachUrl = (updateId: string) => {
        if (!replyAttachUrl.trim()) return;
        const attached = fileLinkFromUrl(replyAttachUrl, '', uuidv4);
        if (!attached) return;
        setReplyFiles(prev => ({ ...prev, [updateId]: [...(prev[updateId] || []), attached] }));
        setReplyAttachUrl('');
        setReplyAttachError(null);
        setReplyActiveUrlId(null);
    };

    const removeReplyFile = (updateId: string, fileId: string) => {
        setReplyFiles(prev => ({ ...prev, [updateId]: (prev[updateId] || []).filter(f => f.id !== fileId) }));
    };



    const tabs = [
        { id: 'updates', label: 'Updates', icon: MessageSquare },
        { id: 'files', label: 'Files', icon: FileText }
    ] as const;

    const itemGroup = board?.groups.find(g => g.id === activeItem.groupId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Glass Header with Narai Eyebrow & Display Title */}
            <div style={{
                padding: '20px 28px 16px',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px',
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.38) 0%, rgba(255, 250, 240, 0.12) 100%)'
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bh-eyebrow" style={{ marginBottom: '6px' }}>
                        <span>{board?.title || 'Board'}</span>
                        {itemGroup && (
                            <>
                                <span className="bh-eyebrow-dot" style={{ background: itemGroup.color || 'hsl(var(--color-text-tertiary))', width: '6px', height: '6px' }} />
                                <span style={{ color: 'hsl(var(--color-text-secondary))' }}>{itemGroup.title}</span>
                            </>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 className="narai-heading" style={{
                            margin: 0,
                            fontSize: '26px',
                            fontWeight: 600,
                            letterSpacing: '-0.015em',
                            fontFamily: 'var(--font-family-display)',
                            color: 'hsl(var(--color-text-primary))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: 1,
                            minWidth: 0
                        }}>
                            <textarea
                                ref={titleTextareaRef}
                                value={activeItem.title}
                                onChange={(e) => updateItemTitle(itemId, e.target.value, false)}
                                onBlur={(e) => updateItemTitle(itemId, e.target.value, true)} // Log only on blur
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault(); // Title is single-field; Enter commits instead of inserting a newline
                                        updateItemTitle(itemId, activeItem.title, true); // Log on Enter
                                        e.currentTarget.blur();
                                    }
                                }}
                                rows={1}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: 'inherit',
                                    fontWeight: 'inherit',
                                    letterSpacing: 'inherit',
                                    lineHeight: '1.22',
                                    width: '100%',
                                    outline: 'none',
                                    color: 'inherit',
                                    resize: 'none',
                                    overflow: 'hidden',
                                    maxHeight: '64px',
                                    display: 'block'
                                }}
                            />
                        </h2>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="glass-chip"
                    title="Close (Esc)"
                    style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'hsl(var(--color-text-secondary))',
                        flexShrink: 0,
                        transition: 'background-color 0.15s, color 0.15s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--glass-chip-hover)';
                        e.currentTarget.style.color = 'hsl(var(--color-text-primary))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--glass-chip)';
                        e.currentTarget.style.color = 'hsl(var(--color-text-secondary))';
                    }}
                >
                    <X size={18} />
                </button>
            </div>

            {/* Unified Glass Control Bar: Segmented View Pills + Waiting On + Notification */}
            <div style={{
                padding: '10px 28px',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                background: 'rgba(255, 255, 255, 0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
            }}>
                <div className="seg glass-chip">
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`seg-btn ${isActive ? 'is-active' : ''}`}
                                style={{ cursor: 'pointer' }}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                                {tab.id === 'updates' && updatesTabCount > 0 && (
                                    <span style={{
                                        background: isActive ? 'rgba(255, 239, 210, 0.22)' : 'hsl(var(--color-brand-primary))',
                                        color: '#FFEFD2',
                                        padding: '1px 6px',
                                        borderRadius: '999px',
                                        fontSize: '10.5px',
                                        fontWeight: 700,
                                        lineHeight: 1.3
                                    }}>{updatesTabCount}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: '260px' }}>
                    <div style={{ width: '100%' }}>
                        <DependenciesSection
                            itemId={activeItem.id}
                            boardId={activeItem.boardId}
                            compact
                            trailing={<ItemNotifySwitch itemId={activeItem.id} />}
                        />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 32px', backgroundColor: 'transparent' }}>
                {activeTab === 'updates' && (
                    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                        {/* Input Area (New WYSIWYG) */}
                        <div style={{ marginBottom: '24px' }}>
                            <RichTextEditor
                                id={`update-input-${itemId}`}
                                value={draftText}
                                onChange={(val) => setDraft(itemId, val)}
                                footer={
                                    <div>
                                        {/* URL attach panel */}
                                        {showUrlPanel && (
                                            <div style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--color-border))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={attachUrl}
                                                        onChange={(e) => { setAttachUrl(e.target.value); setAttachError(null); }}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddAttachUrl()}
                                                        placeholder="Paste link to attach..."
                                                        autoFocus
                                                        style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: attachError ? '1px solid hsl(var(--color-danger))' : '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))' }}
                                                    />
                                                    <button onClick={handleAddAttachUrl} disabled={!attachUrl.trim()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: attachUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)', color: '#FFEFD2', fontSize: '13px', fontWeight: 500, cursor: attachUrl.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                                    <button onClick={() => { setShowUrlPanel(false); setAttachUrl(''); setAttachError(null); }} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>✕</button>
                                                </div>
                                                {attachError && <div style={{ fontSize: '12px', color: 'hsl(var(--color-danger))' }}>{attachError}</div>}
                                            </div>
                                        )}

                                        {/* GIF Picker (rendered via fixed position) */}
                                        {showGifPicker && (
                                            <GifStickerPicker
                                                onSelect={handleGifSelect}
                                                onClose={() => setShowGifPicker(false)}
                                                anchorBottom={gifPickerPos.bottom}
                                                anchorLeft={gifPickerPos.left}
                                            />
                                        )}

                                        {/* Pending file chips */}
                                        {draftFiles.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                                {draftFiles.map(file => (
                                                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', color: 'hsl(var(--color-text-primary))', maxWidth: '200px' }}>
                                                        {file.type === 'onedrive' ? (
                                                            <img src={ONEDRIVE_ICON} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                        ) : file.type === 'google-drive' ? (
                                                            <img src={LOCAL_ICONS.drive} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                        ) : (
                                                            <Link2 size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                        )}
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                        <button onClick={() => setDraftFiles(prev => prev.filter(f => f.id !== file.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: 0, lineHeight: 1, fontSize: '11px', flexShrink: 0 }}>✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Action bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                                            {/* Left: action buttons */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                {/* @ mention */}
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); insertIntoEditor(`update-input-${itemId}`, '@'); }}
                                                    title="Mention someone"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >@</button>

                                                {/* Link / File URL */}
                                                <button
                                                    onClick={() => { setShowUrlPanel(!showUrlPanel); setShowGifPicker(false); }}
                                                    title="Attach file URL"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                ><Paperclip size={16} /></button>

                                                {/* GIF */}
                                                <button
                                                    ref={gifButtonRef}
                                                    onClick={toggleGifPicker}
                                                    title="Insert GIF or Sticker"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30px', padding: '0 7px', borderRadius: '5px', border: 'none', backgroundColor: showGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.03em' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                >GIF</button>

                                                {/* Emoji */}
                                                <button
                                                    ref={emojiButtonRef}
                                                    onClick={toggleEmojiPicker}
                                                    title="Add emoji"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '17px', padding: 0 }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                >😊</button>

                                                {/* Google Drive */}

                                                {drives.google && (
                                                <button
                                                    onClick={() => openPicker((result) => {
                                                        setDraftFiles(prev => [...prev, { id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType }]);
                                                    })}
                                                    title="Attach from Google Drive"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <img src={LOCAL_ICONS.drive} alt="Google Drive" style={{ width: '18px', height: '18px' }} />
                                                </button>

                                                )}
                                            </div>

                                            {/* Right: Update button */}
                                            {sendError && (
                                                <div style={{ color: 'hsl(var(--color-status-error, 0 72% 51%))', fontSize: '12px', marginRight: 'auto', paddingLeft: '4px', alignSelf: 'center' }}>
                                                    {sendError}
                                                </div>
                                            )}
                                            <div className="cmd-add" style={{ height: '32px' }}>
                                                <button
                                                    onClick={handleSendUpdate}
                                                    style={{ padding: '0 16px', fontSize: '12.5px', fontWeight: 600, color: '#FFEFD2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    className="cmd-add-more"
                                                    style={{ padding: '0 9px', color: '#FFEFD2', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                                >
                                                    <ChevronDown size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                        {/* Updates List */}
                        {/* Comment bodies land shortly after the board opens, so an item
                            opened in that window has a count but no content yet. Saying
                            "no updates yet" there would be wrong, not just early. */}
                        {(activeItem.updatesLoaded === false && (activeItem.updatesCount ?? 0) > 0) ? (
                            <div className="glass-chip" style={{ textAlign: 'center', color: 'hsl(var(--color-text-tertiary))', padding: '40px', fontSize: '14px', borderRadius: '18px' }}>
                                Loading updates…
                            </div>
                        ) : (getDedupedUpdates(activeItem.updates).length === 0) ? (
                            <div className="glass-chip" style={{
                                textAlign: 'center',
                                color: 'hsl(var(--color-text-secondary))',
                                padding: '44px 32px',
                                borderRadius: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(145deg, rgba(21, 42, 0, 0.08) 0%, rgba(167, 100, 0, 0.12) 100%)',
                                    border: '1px solid var(--glass-chip-edge, hsl(var(--color-border)))',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'hsl(var(--color-brand-primary))',
                                    marginBottom: '16px'
                                }}>
                                    <MessageSquare size={24} />
                                </div>
                                <h3 className="narai-heading" style={{
                                    margin: '0 0 6px 0',
                                    fontSize: '20px',
                                    fontWeight: 600,
                                    fontFamily: 'var(--font-family-display)',
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    No updates yet for this item
                                </h3>
                                <p style={{ margin: 0, fontSize: '13.5px', color: 'hsl(var(--color-text-tertiary))', maxWidth: '420px' }}>
                                    Be the first one to update about progress, mention someone or upload files.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {(() => {
                                    const validUpdates = getDedupedUpdates(activeItem.updates);

                                    // Separate top-level updates and replies
                                    const { topLevel, replies } = splitThreads(validUpdates);

                                    const renderUpdate = (update: any, depth = 0) => (
                                        <div key={update.id} data-update-id={update.id} style={{
                                            backgroundColor: depth === 0 ? 'hsl(var(--paper, var(--color-bg-surface)))' : 'transparent',
                                            borderRadius: depth === 0 ? '16px' : '0px',
                                            border: depth === 0 ? '1px solid var(--paper-edge, hsl(var(--color-border)))' : 'none',
                                            padding: depth === 0 ? '22px 24px' : '16px 0 0 52px',
                                            position: 'relative',
                                            marginBottom: depth === 0 ? '12px' : '0',
                                            borderLeft: depth === 0 && deleteConfirmId === update.id ? '4px solid hsl(var(--color-danger))' : (depth === 0 ? '1px solid var(--paper-edge, hsl(var(--color-border)))' : 'none'),
                                            boxShadow: depth === 0 ? 'var(--paper-shadow, 0 8px 24px -16px rgba(21, 42, 0, 0.25))' : 'none'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    {(() => {
                                                        const avatarUrl = getAuthorAvatarUrl(update.userId);
                                                        const size = depth === 0 ? '40px' : '32px';
                                                        if (avatarUrl) {
                                                            return (
                                                                <img
                                                                    src={avatarUrl}
                                                                    alt=""
                                                                    referrerPolicy="no-referrer"
                                                                    style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                                                />
                                                            );
                                                        }
                                                        return (
                                                            <div style={{
                                                                width: size,
                                                                height: size,
                                                                borderRadius: '50%',
                                                                backgroundColor: update.author.toLowerCase().includes('lubd') ? '#250719' : (update.contentType === 'Reply' ? '#2E7D8C' : '#3F7D32'),
                                                                color: '#FFEFD2',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: depth === 0 ? '16px' : '12px',
                                                                fontWeight: 700,
                                                                flexShrink: 0,
                                                                fontFamily: 'serif'
                                                            }}>
                                                                {update.author.charAt(0)}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: depth === 0 ? '15px' : '14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--color-text-primary))' }}>
                                                            {update.author}
                                                            {update.contentType === 'Reply' && (
                                                                <span style={{ fontSize: '10px', color: '#2E7D8C', fontWeight: 700, backgroundColor: 'rgba(46, 125, 140, 0.12)', padding: '2px 6px', letterSpacing: '0.05em' }}>REPLY</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', marginTop: '2px' }}>
                                                            {(() => {
                                                                const d = new Date(update.createdAt);
                                                                if (isNaN(d.getTime())) return update.createdAt;
                                                                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                                {(update.userId === currentUser.id || update.author === currentUser.name) && (
                                                    <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                                                        <button
                                                            onClick={() => {
                                                                setEditingUpdateId(update.id);
                                                                setEditUpdateContent(update.content);
                                                                setEditDraftFiles(update.files || []);
                                                                setShowEditUrlPanel(false);
                                                            }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: '4px' }}
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(update.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: '4px' }}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {editingUpdateId === update.id ? (
                                                <div style={{ marginTop: '12px' }}>
                                                    <RichTextEditor
                                                        id="edit-update-input"
                                                        value={editUpdateContent}
                                                        onChange={(val) => setEditUpdateContent(val)}
                                                        footer={
                                                            <div>
                                                                {/* GIF Picker for edit mode */}
                                                                {showEditGifPicker && (
                                                                    <GifStickerPicker
                                                                        onSelect={handleEditGifSelect}
                                                                        onClose={() => setShowEditGifPicker(false)}
                                                                        anchorBottom={editGifPickerPos.bottom}
                                                                        anchorLeft={editGifPickerPos.left}
                                                                    />
                                                                )}

                                                                {/* URL Attach panel */}
                                                                {showEditUrlPanel && (
                                                                    <div style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--color-border))', display: 'flex', gap: '8px' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={editAttachUrl}
                                                                            onChange={(e) => setEditAttachUrl(e.target.value)}
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleAddEditAttachUrl()}
                                                                            placeholder="Paste link to attach..."
                                                                            autoFocus
                                                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))' }}
                                                                        />
                                                                        <button onClick={handleAddEditAttachUrl} disabled={!editAttachUrl.trim()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: editAttachUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)', color: 'white', fontSize: '13px', fontWeight: 500, cursor: editAttachUrl.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                                                        <button onClick={() => { setShowEditUrlPanel(false); setEditAttachUrl(''); }} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>✕</button>
                                                                    </div>
                                                                )}

                                                                {/* File chips */}
                                                                {editDraftFiles.length > 0 && (
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                                                        {editDraftFiles.map(file => (
                                                                            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', color: 'hsl(var(--color-text-primary))', maxWidth: '200px' }}>
                                                                                {file.type === 'onedrive' ? (
                                                                                    <img src={ONEDRIVE_ICON} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                                ) : file.type === 'google-drive' ? (
                                                                                    <img src={LOCAL_ICONS.drive} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                                ) : (
                                                                                    <Link2 size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                                                )}
                                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                                                <button onClick={() => setEditDraftFiles(prev => prev.filter(f => f.id !== file.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: 0, lineHeight: 1, fontSize: '11px', flexShrink: 0 }}>✕</button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Edit action bar */}
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                        {/* @ mention */}
                                                                        <button
                                                                            onMouseDown={(e) => { e.preventDefault(); insertIntoEditor('edit-update-input', '@'); }}
                                                                            title="Mention someone"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '15px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                        >@</button>

                                                                        {/* Link / File URL */}
                                                                        <button
                                                                            onClick={() => { setShowEditUrlPanel(!showEditUrlPanel); setShowEditGifPicker(false); }}
                                                                            title="Attach file URL"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEditUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditUrlPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        ><Paperclip size={16} /></button>

                                                                        {/* GIF */}
                                                                        <button
                                                                            ref={editGifButtonRef}
                                                                            onClick={toggleEditGifPicker}
                                                                            title="Insert GIF or Sticker"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '30px', padding: '0 7px', borderRadius: '5px', border: 'none', backgroundColor: showEditGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.03em' }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditGifPicker ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        >GIF</button>

                                                                        {/* Emoji */}
                                                                        <button
                                                                            ref={editEmojiButtonRef}
                                                                            onClick={toggleEditEmojiPicker}
                                                                            title="Add emoji"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', backgroundColor: showEditEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '17px', padding: 0 }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showEditEmojiPanel ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                        >😊</button>

                                                                        {/* Google Drive */}

                                                                        {drives.google && (
                                                                        <button
                                                                            onClick={() => openPicker((result) => {
                                                                                setEditDraftFiles(prev => [...prev, { id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType }]);
                                                                            })}
                                                                            title="Attach from Google Drive"
                                                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                        >
                                                                            <img src={LOCAL_ICONS.drive} alt="Google Drive" style={{ width: '18px', height: '18px' }} />
                                                                        </button>

                                                                        )}
                                                                    </div>

                                                                    {/* Right: Cancel + Save */}
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <button
                                                                            onClick={() => { setEditingUpdateId(null); setShowEditEmojiPanel(false); setShowEditGifPicker(false); setShowEditUrlPanel(false); setEditDraftFiles([]); }}
                                                                            style={{ background: 'transparent', color: 'hsl(var(--color-text-secondary))', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                                                                        >Cancel</button>
                                                                        <button
                                                                            onClick={() => { editUpdate(itemId, update.id, editUpdateContent, editDraftFiles); setEditingUpdateId(null); setEditDraftFiles([]); }}
                                                                            style={{ backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                                                                        >Save</button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        }
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div
                                                        className="prose prose-sm max-w-none narai-update-content"
                                                        style={{ color: 'hsl(var(--color-text-primary))', lineHeight: 1.6, fontSize: '14px' }}
                                                        dangerouslySetInnerHTML={{ __html: displayUpdateHtml(update.content) }}
                                                    />
                                                    {update.files && update.files.length > 0 && (
                                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid hsl(var(--color-border))' }}>
                                                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-secondary))', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                <Paperclip size={11} /> Attachments
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                {update.files.map((file: FileLink) => (
                                                                    <a
                                                                        key={file.id}
                                                                        href={file.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                                            padding: '5px 12px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid hsl(var(--color-border))',
                                                                            backgroundColor: 'hsl(var(--color-bg-subtle))',
                                                                            color: 'hsl(var(--color-text-primary))',
                                                                            fontSize: '13px',
                                                                            textDecoration: 'none',
                                                                            maxWidth: '260px',
                                                                            transition: 'background 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-subtle))'}
                                                                    >
                                                                        {file.type === 'onedrive' ? (
                                                                            <img src={ONEDRIVE_ICON} alt="" style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                                                                        ) : file.type === 'google-drive' ? (
                                                                            <img src={LOCAL_ICONS.drive} alt="" style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                                                                        ) : (
                                                                            <Link2 size={13} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                                        )}
                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                                        <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            
                                            {/* Like / Reply action bar — top-level only */}
                                            {depth === 0 && editingUpdateId !== update.id && (
                                                <>
                                                    {/* Like count badge — only visible when someone has liked it */}
                                                    {(update.likedBy?.length || 0) > 0 && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                backgroundColor: 'hsl(var(--color-brand-light))',
                                                                border: '1px solid #A76400',
                                                                borderRadius: '20px',
                                                                padding: '2px 10px',
                                                                fontSize: '13px', fontWeight: 600,
                                                                color: '#A76400',
                                                                cursor: 'pointer', userSelect: 'none'
                                                            }}
                                                                onClick={() => toggleUpdateLike(itemId, update.id, { id: currentUser.id, name: currentUser.name })}
                                                            >
                                                                👍 {update.likedBy.length}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        marginTop: (update.likedBy?.length || 0) > 0 ? '8px' : '12px',
                                                        paddingTop: '8px',
                                                        borderTop: '1px solid hsl(var(--color-border))'
                                                    }}>
                                                        {/* Like button */}
                                                        <button
                                                            onClick={() => toggleUpdateLike(itemId, update.id, { id: currentUser.id, name: currentUser.name })}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                                background: 'none', border: 'none', cursor: 'pointer',
                                                                color: update.likedBy?.includes(currentUser.id) ? '#A76400' : 'hsl(var(--color-text-secondary))',
                                                                fontSize: '13px', padding: '4px 10px', borderRadius: '4px', fontWeight: 500,
                                                                lineHeight: 1
                                                            }}
                                                            onMouseEnter={(e) => { if (!update.likedBy?.includes(currentUser.id)) e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; }}
                                                            onMouseLeave={(e) => { if (!update.likedBy?.includes(currentUser.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            <ThumbsUp size={15} fill={update.likedBy?.includes(currentUser.id) ? '#A76400' : 'none'} />
                                                            <span>Like</span>
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                const hasDraft = hasHtmlContent(getReplyDraft(update.id)) || (replyFiles[update.id] || []).length > 0;
                                                                if (openReplyBoxId === update.id && !hasDraft) {
                                                                    setOpenReplyBoxId(null);
                                                                    return;
                                                                }
                                                                setOpenReplyBoxId(update.id);
                                                                setTimeout(() => document.getElementById(`reply-input-${update.id}`)?.focus(), 0);
                                                            }}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px', padding: '4px 10px', borderRadius: '4px', fontWeight: 500 }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <ReplyIcon size={15} />
                                                            <span>Reply</span>
                                                        </button>
                                                    </div>

                                                    {/* Reply box — hidden until "Reply" is clicked, but stays visible if there's a draft */}
                                                    {(openReplyBoxId === update.id || hasHtmlContent(getReplyDraft(update.id)) || (replyFiles[update.id] || []).length > 0) && (
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '10px' }}>
                                                        <div style={{
                                                            width: '32px', height: '32px', borderRadius: '50%',
                                                            backgroundColor: currentUser.name?.toLowerCase().includes('lubd') ? '#250719' : '#3F7D32',
                                                            color: '#FFEFD2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '13px', fontWeight: 700, flexShrink: 0, fontFamily: 'serif'
                                                        }}>
                                                            {currentUser.name?.charAt(0) || '?'}
                                                        </div>
                                                        {/* Same editor as a new update — formatting bar, mention chips (which
                                                            is what sends mention notifications) — with the reply's own
                                                            attach / GIF / emoji bar underneath. */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <RichTextEditor
                                                                id={`reply-input-${update.id}`}
                                                                value={getReplyDraft(update.id)}
                                                                onChange={(val) => setReplyDraftFor(update.id, val)}
                                                                placeholder="Write a reply and mention others with @"
                                                                minHeight={64}
                                                                onSubmit={() => handleSendReply(update.id)}
                                                                footer={
                                                                    <div>
                                                                    {/* Attach URL mini panel */}
                                                                    {replyActiveUrlId === update.id && (
                                                                        <div style={{ padding: '8px 10px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                                <input
                                                                                    type="text"
                                                                                    value={replyAttachUrl}
                                                                                    onChange={(e) => { setReplyAttachUrl(e.target.value); setReplyAttachError(null); }}
                                                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddReplyAttachUrl(update.id)}
                                                                                    placeholder="Paste link to attach..."
                                                                                    autoFocus
                                                                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: replyAttachError ? '1px solid hsl(var(--color-danger))' : '1px solid hsl(var(--color-border))', fontSize: '13px', outline: 'none', backgroundColor: 'hsl(var(--color-bg-surface))', color: 'hsl(var(--color-text-primary))' }}
                                                                                />
                                                                                <button onClick={() => handleAddReplyAttachUrl(update.id)} disabled={!replyAttachUrl.trim()} style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', backgroundColor: replyAttachUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)', color: '#FFEFD2', fontSize: '13px', fontWeight: 500, cursor: replyAttachUrl.trim() ? 'pointer' : 'not-allowed' }}>Attach</button>
                                                                                <button onClick={() => { setReplyActiveUrlId(null); setReplyAttachUrl(''); setReplyAttachError(null); }} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid hsl(var(--color-border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '13px' }}>✕</button>
                                                                            </div>
                                                                            {replyAttachError && <div style={{ fontSize: '12px', color: 'hsl(var(--color-danger))' }}>{replyAttachError}</div>}
                                                                        </div>
                                                                    )}
                                                                    {/* Pending reply file/GIF chips */}
                                                                    {(replyFiles[update.id] || []).length > 0 && (
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 10px 0' }}>
                                                                            {(replyFiles[update.id] || []).map(file => (
                                                                                <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', backgroundColor: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', color: 'hsl(var(--color-text-primary))', maxWidth: '200px' }}>
                                                                                    {file.type === 'onedrive' ? (
                                                                                        <img src={ONEDRIVE_ICON} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                                    ) : file.type === 'google-drive' ? (
                                                                                        <img src={LOCAL_ICONS.drive} alt="" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                                                                    ) : (
                                                                                        <Link2 size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-brand-primary))' }} />
                                                                                    )}
                                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                                                                    <button onClick={() => removeReplyFile(update.id, file.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: 0, lineHeight: 1, fontSize: '11px', flexShrink: 0 }}>✕</button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                            {/* @ mention */}
                                                                            <button
                                                                                onMouseDown={(e) => { e.preventDefault(); insertIntoReply(update.id, '@'); }}
                                                                                title="Mention someone"
                                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))' }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                            >@</button>

                                                                            {/* Link / File URL */}
                                                                            <button
                                                                                onClick={() => { setReplyActiveUrlId(replyActiveUrlId === update.id ? null : update.id); setReplyActiveGifId(null); setReplyActiveEmojiId(null); }}
                                                                                title="Attach file URL"
                                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', border: 'none', backgroundColor: replyActiveUrlId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))' }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = replyActiveUrlId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                            ><Paperclip size={15} /></button>

                                                                            {/* GIF */}
                                                                            <button
                                                                                ref={(el) => { replyGifButtonRefs.current[update.id] = el; }}
                                                                                onClick={() => toggleReplyGifPicker(update.id)}
                                                                                title="Insert GIF or Sticker"
                                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '28px', padding: '0 6px', borderRadius: '5px', border: 'none', backgroundColor: replyActiveGifId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-secondary))', letterSpacing: '0.03em' }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = replyActiveGifId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                            >GIF</button>

                                                                            {/* Emoji */}
                                                                            <button
                                                                                ref={(el) => { replyEmojiButtonRefs.current[update.id] = el; }}
                                                                                onClick={() => toggleReplyEmojiPicker(update.id)}
                                                                                title="Add emoji"
                                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', border: 'none', backgroundColor: replyActiveEmojiId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent', cursor: 'pointer', fontSize: '15px', padding: 0 }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = replyActiveEmojiId === update.id ? 'hsl(var(--color-bg-hover))' : 'transparent'}
                                                                            >😊</button>

                                                                            {/* Google Drive */}

                                                                            {drives.google && (
                                                                            <button
                                                                                onClick={() => openPicker((result) => {
                                                                                    setReplyFiles(prev => ({
                                                                                        ...prev,
                                                                                        [update.id]: [...(prev[update.id] || []), { id: uuidv4(), name: result.name, url: result.url, type: 'google-drive', iconUrl: result.iconUrl, mimeType: result.mimeType }]
                                                                                    }));
                                                                                })}
                                                                                title="Attach from Google Drive"
                                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '5px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                            >
                                                                                <img src={LOCAL_ICONS.drive} alt="Google Drive" style={{ width: '17px', height: '17px' }} />
                                                                            </button>

                                                                            )}
                                                                        </div>

                                                                        <button
                                                                            onClick={() => handleSendReply(update.id)}
                                                                            disabled={!hasHtmlContent(getReplyDraft(update.id)) && (replyFiles[update.id] || []).length === 0}
                                                                            style={{
                                                                                backgroundColor: 'hsl(var(--color-brand-primary))', color: 'white', border: 'none',
                                                                                padding: '6px 16px', borderRadius: '6px',
                                                                                cursor: (hasHtmlContent(getReplyDraft(update.id)) || (replyFiles[update.id] || []).length > 0) ? 'pointer' : 'not-allowed',
                                                                                fontSize: '13px', fontWeight: 600,
                                                                                opacity: (hasHtmlContent(getReplyDraft(update.id)) || (replyFiles[update.id] || []).length > 0) ? 1 : 0.5
                                                                            }}
                                                                        >
                                                            Reply
                                                                        </button>
                                                                    </div>
                                                                    {replyActiveGifId === update.id && (
                                                                        <GifStickerPicker
                                                                            onSelect={(url) => handleReplyGifSelect(update.id, url)}
                                                                            onClose={() => setReplyActiveGifId(null)}
                                                                            anchorBottom={replyGifPickerPos.bottom}
                                                                            anchorLeft={replyGifPickerPos.left}
                                                                        />
                                                                    )}
                                                                    </div>
                                                                }
                                                            />
                                                        </div>
                                                    </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Render Replies for this update */}
                                            {repliesTo(replies, update).map(reply => renderUpdate(reply, depth + 1))}
                                        </div>
                                    );

                                    return topLevel.map(u => renderUpdate(u));
                                })()}
                            </div>
                        )}
                    </div>
                )}

                <ConfirmModal
                    isOpen={!!deleteConfirmId}
                    title="Delete Update"
                    message="Delete this update?"
                    confirmText="Yes"
                    cancelText="No"
                    onConfirm={() => {
                        if (deleteConfirmId) deleteUpdate(itemId, deleteConfirmId);
                        setDeleteConfirmId(null);
                    }}
                    onCancel={() => setDeleteConfirmId(null)}
                />

                {activeTab === 'files' && (
                    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '24px' }}>
                            {/* Inline Add File Form */}
                            <div style={{
                                backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                padding: '20px 22px',
                                borderRadius: '16px',
                                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                boxShadow: 'var(--paper-shadow, 0 8px 24px -16px rgba(21, 42, 0, 0.22))',
                                marginBottom: '24px'
                            }}>
                                <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13.5px', color: 'hsl(var(--color-text-primary))' }}>{drives.google && drives.onedrive ? 'Add Google Drive or OneDrive Link' : drives.onedrive ? 'Add OneDrive Link' : 'Add Google Drive Link'}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: '220px' }}>
                                            <input
                                                type="text"
                                                placeholder={drives.google && drives.onedrive ? 'Paste a Google Drive or OneDrive / SharePoint link here...' : drives.onedrive ? 'Paste a OneDrive / SharePoint link here...' : 'Paste Google Drive Link here...'}
                                                value={fileUrl}
                                                onChange={(e) => {
                                                    setFileUrl(e.target.value);
                                                    if (fileError) setFileError(null);
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: fileError ? '1px solid hsl(var(--color-danger))' : '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                    fontSize: '13.5px',
                                                    outline: 'none',
                                                    backgroundColor: 'hsl(var(--color-bg-subtle))',
                                                    color: 'hsl(var(--color-text-primary))'
                                                }}
                                            />
                                            {fileError && <div style={{ color: 'hsl(var(--color-danger))', fontSize: '12px', marginTop: '4px' }}>{fileError}</div>}
                                        </div>
                                        <div style={{ width: '200px' }}>
                                            <input
                                                type="text"
                                                placeholder="File Name (Optional)"
                                                value={fileName}
                                                onChange={(e) => setFileName(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                                    fontSize: '13.5px',
                                                    outline: 'none',
                                                    backgroundColor: 'hsl(var(--color-bg-subtle))',
                                                    color: 'hsl(var(--color-text-primary))'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                        <button
                                            onClick={handleAddFile}
                                            disabled={!fileUrl.trim()}
                                            style={{
                                                backgroundColor: fileUrl.trim() ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-brand-primary) / 0.3)',
                                                color: '#FFEFD2',
                                                border: 'none',
                                                borderRadius: '999px',
                                                padding: '7px 16px',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                cursor: fileUrl.trim() ? 'pointer' : 'not-allowed',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Plus size={15} /> Add Link
                                        </button>
                                        {drives.google && (
                                        <button
                                            onClick={() => {
                                                openPicker((result) => {
                                                    const newFile: FileLink = {
                                                        id: uuidv4(),
                                                        name: result.name,
                                                        url: result.url,
                                                        type: 'google-drive',
                                                        iconUrl: result.iconUrl,
                                                        mimeType: result.mimeType
                                                    };
                                                    const currentFiles = activeItem?.files || [];
                                                    updateItemFiles(itemId, [...currentFiles, newFile]);
                                                });
                                            }}
                                            className="glass-chip"
                                            style={{
                                                color: 'hsl(var(--color-text-primary))',
                                                borderRadius: '999px',
                                                padding: '7px 16px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            <img src={LOCAL_ICONS.drive} alt="" style={{ width: '16px', height: '16px' }} />
                                            Google Drive
                                        </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(!activeItem.files || activeItem.files.length === 0) ? (
                            <div className="glass-chip" style={{
                                textAlign: 'center',
                                color: 'hsl(var(--color-text-secondary))',
                                padding: '44px 32px',
                                borderRadius: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(145deg, rgba(21, 42, 0, 0.08) 0%, rgba(167, 100, 0, 0.12) 100%)',
                                    border: '1px solid var(--glass-chip-edge, hsl(var(--color-border)))',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.75)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'hsl(var(--color-brand-primary))',
                                    marginBottom: '16px'
                                }}>
                                    <FileText size={24} />
                                </div>
                                <h3 className="narai-heading" style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-family-display)', color: 'hsl(var(--color-text-primary))' }}>
                                    No files attached yet
                                </h3>
                                <p style={{ margin: 0, fontSize: '13.5px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    Attach cloud links from Google Drive or OneDrive to share with your team.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                {activeItem.files.map((file) => (
                                    <div key={file.id} style={{
                                        backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                        borderRadius: '14px',
                                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                        boxShadow: 'var(--paper-shadow)',
                                        padding: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        transition: 'box-shadow 0.2s, transform 0.15s',
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 8px 20px -8px rgba(21,42,0,0.2)'}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--paper-shadow)'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'hsl(var(--color-brand-primary))'
                                            }}>
                                                <FileText size={20} />
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newFiles = activeItem.files?.filter(f => f.id !== file.id) || [];
                                                    updateItemFiles(itemId, newFiles);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: 'hsl(var(--color-text-tertiary))',
                                                    padding: '4px'
                                                }}
                                                title="Remove File"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                                                {file.name}
                                            </div>
                                            <a
                                                href={fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ fontSize: '12px', color: 'hsl(var(--color-brand-primary))', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Open Link <ExternalLink size={10} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Emoji Picker — fixed portal for reply boxes */}
            {replyActiveEmojiId && (() => {
                const activeReplyId = replyActiveEmojiId;
                const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
                const q = replyEmojiSearch.trim().toLowerCase();
                const filtered = q ? allEmojis.filter(e => e.includes(replyEmojiSearch)) : null;
                return (
                    <div ref={replyEmojiPickerRef} style={{
                        position: 'fixed', top: replyEmojiPickerPos.top, bottom: replyEmojiPickerPos.bottom, left: replyEmojiPickerPos.left,
                        width: '320px', maxHeight: '380px', zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Emoji</span>
                                <button onClick={() => setReplyActiveEmojiId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '18px', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                            </div>
                            <input type="text" placeholder="Search emoji..." value={replyEmojiSearch} onChange={e => setReplyEmojiSearch(e.target.value)} autoFocus
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 4px' }}>
                            {filtered ? (
                                filtered.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                        {filtered.map((emoji, i) => (
                                            <button key={i} onClick={() => handleReplyEmojiSelect(activeReplyId, emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No results for "{replyEmojiSearch}"</div>
                                )
                            ) : (
                                EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.label} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-tertiary))', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: '4px' }}>{cat.label}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                            {cat.emojis.map((emoji, i) => (
                                                <button key={i} onClick={() => handleReplyEmojiSelect(activeReplyId, emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Emoji Picker — fixed portal for new update composer */}
            {showEmojiPanel && (() => {
                const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
                const q = emojiSearch.trim().toLowerCase();
                const filtered = q ? allEmojis.filter(e => e.includes(emojiSearch)) : null;
                return (
                    <div ref={emojiPickerRef} style={{
                        position: 'fixed', top: emojiPickerPos.top, bottom: emojiPickerPos.bottom, left: emojiPickerPos.left,
                        width: '320px', maxHeight: '380px', zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Emoji</span>
                                <button onClick={() => setShowEmojiPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '18px', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                            </div>
                            <input type="text" placeholder="Search emoji..." value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)} autoFocus
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 4px' }}>
                            {filtered ? (
                                filtered.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                        {filtered.map((emoji, i) => (
                                            <button key={i} onClick={() => handleEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No results for "{emojiSearch}"</div>
                                )
                            ) : (
                                EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.label} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-tertiary))', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: '4px' }}>{cat.label}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                            {cat.emojis.map((emoji, i) => (
                                                <button key={i} onClick={() => handleEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Emoji Picker — fixed portal for edit mode */}
            {showEditEmojiPanel && (() => {
                const allEmojis = EMOJI_CATEGORIES.flatMap(c => c.emojis);
                const filtered = editEmojiSearch.trim() ? allEmojis.filter(e => e.includes(editEmojiSearch)) : null;
                return (
                    <div ref={editEmojiPickerRef} style={{
                        position: 'fixed', top: editEmojiPickerPos.top, bottom: editEmojiPickerPos.bottom, left: editEmojiPickerPos.left,
                        width: '320px', maxHeight: '380px', zIndex: 9999,
                        backgroundColor: 'hsl(var(--color-bg-surface))',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid hsl(var(--color-border))', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>Emoji</span>
                                <button onClick={() => setShowEditEmojiPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-secondary))', fontSize: '18px', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                            </div>
                            <input type="text" placeholder="Search emoji..." value={editEmojiSearch} onChange={e => setEditEmojiSearch(e.target.value)} autoFocus
                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid hsl(var(--color-border))', backgroundColor: 'hsl(var(--color-bg-canvas))', color: 'hsl(var(--color-text-primary))', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px 4px' }}>
                            {filtered ? (
                                filtered.length > 0 ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                        {filtered.map((emoji, i) => (
                                            <button key={i} onClick={() => handleEditEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '13px', color: 'hsl(var(--color-text-secondary))' }}>No results for "{editEmojiSearch}"</div>
                                )
                            ) : (
                                EMOJI_CATEGORIES.map(cat => (
                                    <div key={cat.label} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'hsl(var(--color-text-tertiary))', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: '4px' }}>{cat.label}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                                            {cat.emojis.map((emoji, i) => (
                                                <button key={i} onClick={() => handleEditEmojiSelect(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '6px', borderRadius: '6px', lineHeight: 1 }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>{emoji}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
