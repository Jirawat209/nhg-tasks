import { useState, useEffect } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Layout, Star, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BoardCard, ShowMoreButton } from '../components/home/HomeCards';
import { notificationKind } from '../components/notifications/notificationKind';

export const HomePage = () => {
    const { user } = useAuth();
    const { boards, workspaces, setActiveBoard, toggleFavorite, activeWorkspaceId } = useBoardStore();
    const [showAllWorkspace, setShowAllWorkspace] = useState(false);
    const [showAllFavorites, setShowAllFavorites] = useState(false);



    // Sort by lastViewedAt (descending) to show true recently visited.
    // Deleting a board archives it rather than removing the row (so Trash can
    // restore it), so it lingers in the store's boards array with whatever
    // lastViewedAt/isFavorite it already had — every list below has to filter
    // it out itself, there's no single choke point that already does it.
    const recentBoards = [...boards]
        .filter(b => b.lastViewedAt && !b.is_archived)
        .sort((a, b) => {
            const dateA = new Date(a.lastViewedAt!).getTime();
            const dateB = new Date(b.lastViewedAt!).getTime();
            return dateB - dateA;
        });

    const RECENT_LIMIT = 4;
    const displayedRecentBoards = recentBoards.slice(0, RECENT_LIMIT);


    // My workspace boards
    const recentWorkspaceId = recentBoards[0]?.workspaceId;
    const defaultWorkspaceId = activeWorkspaceId || recentWorkspaceId || workspaces[0]?.id;
    const myWorkspace = workspaces.find(w => w.id === defaultWorkspaceId) || workspaces[0];
    const myWorkspaceBoards = boards.filter(b => b.workspaceId === myWorkspace?.id && !b.is_archived);
    const displayedWorkspaceBoards = showAllWorkspace ? myWorkspaceBoards : myWorkspaceBoards.slice(0, 3);


    // Filter boards that are favorited
    const favoritedBoards = boards.filter(b => b.isFavorite && !b.is_archived);
    const displayedFavoriteBoards = showAllFavorites ? favoritedBoards : favoritedBoards.slice(0, 3);




    // Greeting based on time
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

    return (
        <div className="home-page" style={{ padding: '20px 28px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '22px' }}>
                <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                    {dateLabel} · WORKSPACE OVERVIEW
                </div>
                <h1 className="narai-heading" style={{
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '28px',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: 'hsl(var(--color-text-primary))',
                    marginBottom: '4px'
                }}>
                    {greeting}, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}!
                </h1>
                <p style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '13.5px', margin: 0 }}>
                    Quickly access your recent boards and work.
                </p>
            </header>

            {/* 1. Update feed (Inbox) */}
            <div style={{ marginBottom: '24px' }}>
                <InboxFeed />
            </div>

            {/* 2. Recently visited */}
            {recentBoards.length > 0 && (
                <section style={{ marginBottom: '24px' }}>
                    <div className="home-section-head">
                        <div className="home-section-title-group">
                            <Clock size={16} color="hsl(var(--color-brand-primary))" />
                            <h2 className="home-section-title">Recently visited</h2>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '14px',
                        marginBottom: '12px'
                    }}>
                        {displayedRecentBoards.map(board => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                workspace={workspaces.find(w => w.id === board.workspaceId)}
                                onOpen={() => setActiveBoard(board.id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* 3. My workspace */}
            {myWorkspaceBoards.length > 0 && (
                <section style={{ marginBottom: '24px' }}>
                    <div className="home-section-head">
                        <div className="home-section-title-group">
                            <Layout size={16} color="hsl(var(--color-brand-primary))" />
                            <h2 className="home-section-title">My workspace</h2>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '14px',
                        marginBottom: '12px'
                    }}>
                        {displayedWorkspaceBoards.map(board => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                workspace={workspaces.find(w => w.id === board.workspaceId)}
                                onOpen={() => setActiveBoard(board.id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        ))}
                    </div>
                    {myWorkspaceBoards.length > 3 && (
                        <div className="home-more-row">
                            <ShowMoreButton expanded={showAllWorkspace} onToggle={() => setShowAllWorkspace(!showAllWorkspace)} />
                        </div>
                    )}
                </section>
            )}

            {/* 4. Favorites */}
            {favoritedBoards.length > 0 && (
                <section style={{ marginBottom: '24px' }}>
                    <div className="home-section-head">
                        <div className="home-section-title-group">
                            <Star size={16} color="#E5A93C" fill="#E5A93C" />
                            <h2 className="home-section-title">Favorites</h2>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '14px',
                        marginBottom: '12px'
                    }}>
                        {displayedFavoriteBoards.map(board => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                workspace={workspaces.find(w => w.id === board.workspaceId)}
                                onOpen={() => setActiveBoard(board.id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        ))}
                    </div>
                    {favoritedBoards.length > 3 && (
                        <div className="home-more-row">
                            <ShowMoreButton expanded={showAllFavorites} onToggle={() => setShowAllFavorites(!showAllFavorites)} />
                        </div>
                    )}
                </section>
            )}


            {recentBoards.length === 0 && myWorkspaceBoards.length === 0 && (
                <div className="card-surface" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center' }}>
                    <p style={{ color: 'hsl(var(--color-text-secondary))', margin: 0 }}>No boards found. Create or visit a board to get started!</p>
                </div>
            )}
        </div>
    );
};

// Sub-component for Feed to handle its own logic
const InboxFeed = () => {
    const { user } = useAuth();
    const notifications = useBoardStore(state => state.notifications || []);
    const loadNotifications = useBoardStore(state => state.loadNotifications);
    const handleAcceptInvite = useBoardStore(state => state.handleAcceptInvite);
    const handleDeclineInvite = useBoardStore(state => state.handleDeclineInvite);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const isLoading = useBoardStore(state => state.isLoading);
    const setActiveBoard = useBoardStore(state => state.setActiveBoard);
    const setActiveWorkspace = useBoardStore(state => state.setActiveWorkspace);
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const setHighlightedUpdate = useBoardStore(state => state.setHighlightedUpdate);
    const markNotificationAsRead = useBoardStore(state => state.markNotificationAsRead);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // The feed keeps the latest 5 (the store has them newest first) but shows 1,
    // with a button to unfold the other 4.
    const FEED_LIMIT = 5;
    const FEED_COLLAPSED = 1;
    const [expanded, setExpanded] = useState(false);
    const feedNotifications = notifications.slice(0, FEED_LIMIT);
    const hiddenCount = Math.max(0, feedNotifications.length - FEED_COLLAPSED);
    const visibleNotifications = expanded ? feedNotifications : feedNotifications.slice(0, FEED_COLLAPSED);

    useEffect(() => {
        if (user?.id) loadNotifications();
    }, [user?.id, loadNotifications]);


    const dismissNotification = async (notificationId: string) => {
        setProcessingId(notificationId);
        try {
            const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
            if (!error) await loadNotifications();
        } catch (err) {
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleMarkAsRead = (n: any) => dismissNotification(n.id);

    // The same destinations as the bell's list (NotificationItem): a board-wide
    // notification carries the board as its entity_id and must not be opened as
    // an item, and one about an update opens the item on that very update.
    const handleNotificationClick = (n: any) => {
        if (!n.is_read) markNotificationAsRead(n.id);

        if (n.data?.board_id) {
            setActiveBoard(n.data.board_id);
            if (n.entity_id && n.entity_id !== n.data.board_id) {
                setActiveItem(n.entity_id);
                setHighlightedUpdate(n.data?.update_id || null);
            }
        } else if (n.data?.workspace_id) {
            setActiveWorkspace(n.data.workspace_id);
            navigateTo('home');
        }
    };

    const onAccept = async (notification: any) => {
        setProcessingId(notification.id);
        try {
            await handleAcceptInvite(notification);
        } finally {
            setProcessingId(null);
        }
    };

    const onDecline = async (notification: any) => {
        setProcessingId(notification.id);
        try {
            await handleDeclineInvite(notification);
        } finally {
            setProcessingId(null);
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <section>
            <div className="home-section-head">
                <div className="home-section-title-group">
                    <span className="home-section-badge home-section-badge--count">
                        {feedNotifications.length}
                    </span>
                    <h2 className="home-section-title">Update feed (Inbox)</h2>
                </div>
                {/* See All Button */}
                <button
                    type="button"
                    className="home-see-all glass-chip"
                    onClick={() => navigateTo('notifications')}
                >
                    See all
                </button>
            </div>

            <div className="card-surface home-feed">
                {isLoading && feedNotifications.length === 0 ? (
                    <div className="home-feed__state">Loading updates...</div>
                ) : feedNotifications.length === 0 ? (
                    <div className="home-feed__state">
                        <strong>You're all caught up</strong>
                        New mentions, assignments and due dates will show up here.
                    </div>
                ) : (
                    <>
                        {visibleNotifications.map(n => {
                            const kind = notificationKind(n.type);
                            const opens = !!(n.data?.board_id || n.data?.workspace_id);
                            const status = n.data?.status || n.status;
                            const settled = n.data?.status === 'accepted' || n.data?.status === 'declined' || n.status === 'accepted' || n.status === 'declined';
                            return (
                                <div
                                    key={n.id}
                                    className="feed-row"
                                    style={{ '--tone': kind.tone } as React.CSSProperties}
                                    role={opens ? 'button' : undefined}
                                    tabIndex={opens ? 0 : undefined}
                                    onClick={() => handleNotificationClick(n)}
                                    onKeyDown={opens ? (e) => {
                                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            handleNotificationClick(n);
                                        }
                                    } : undefined}
                                >
                                    <span className="feed-row__tile" aria-hidden="true">
                                        <kind.Icon size={18} />
                                    </span>
                                    <div className="feed-row__body">
                                        <div className="feed-row__head">
                                            <span className="feed-row__title">{n.title || kind.label}</span>
                                            <span className="feed-row__time">
                                                {!n.is_read && <span className="feed-row__unread" title="Unread" />}
                                                {formatTime(n.created_at)}
                                            </span>
                                        </div>
                                        <p className="feed-row__text">{n.content || n.message}</p>

                                        {(n.type === 'mention' || n.type === 'comment') && n.data?.updatePreview && (
                                            <div className="feed-row__quote">{n.data.updatePreview}</div>
                                        )}

                                        {settled && (
                                            <div style={{
                                                padding: '10px 14px',
                                                borderRadius: '6px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                backgroundColor: status === 'accepted' ? '#effbf5' : '#fef2f2',
                                                color: status === 'accepted' ? '#0d7f52' : '#d92d20',
                                                marginTop: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                border: `1px solid ${status === 'accepted' ? '#bbf7d0' : '#fecaca'}`
                                            }}>
                                                <span style={{ fontSize: '14px' }}>
                                                    {status === 'accepted' ? <Check size={14} /> : <X size={14} />}
                                                </span>
                                                <span>
                                                    {status === 'accepted'
                                                        ? `Invitation accepted`
                                                        : `Invitation declined`}
                                                </span>
                                            </div>
                                        )}

                                        {(n.type === 'workspace_invite' || n.type === 'board_invite') &&
                                            ((n.data?.status || 'pending') === 'pending' && (!n.status || n.status === 'pending')) && (
                                                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onAccept(n); }}
                                                        disabled={processingId === n.id}
                                                        style={{
                                                            backgroundColor: processingId === n.id ? 'hsl(var(--color-brand-primary), 0.7)' : 'hsl(var(--color-brand-primary))',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '8px 20px',
                                                            borderRadius: '8px',
                                                            cursor: processingId === n.id ? 'not-allowed' : 'pointer',
                                                            fontWeight: 500,
                                                            fontSize: '13px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}>
                                                        {processingId === n.id ? 'Accepting...' : 'Accept'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onDecline(n); }}
                                                        disabled={processingId === n.id}
                                                        style={{
                                                            backgroundColor: 'hsl(var(--color-bg-surface))',
                                                            color: 'hsl(var(--color-text-primary))',
                                                            border: '1px solid hsl(var(--color-border))',
                                                            padding: '8px 20px',
                                                            borderRadius: '8px',
                                                            cursor: processingId === n.id ? 'not-allowed' : 'pointer',
                                                            fontWeight: 500,
                                                            fontSize: '13px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface-hover))'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-surface))'}
                                                    >
                                                        {processingId === n.id ? 'Declining...' : 'Decline'}
                                                    </button>
                                                </div>
                                            )}
                                    </div>
                                    <button
                                        type="button"
                                        className="feed-row__dismiss"
                                        onClick={(e) => { e.stopPropagation(); handleMarkAsRead(n); }}
                                        title="Dismiss"
                                        aria-label="Dismiss notification"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            );
                        })}
                        {hiddenCount > 0 && (
                            <div className="home-feed__footer">
                                <ShowMoreButton expanded={expanded} onToggle={() => setExpanded(e => !e)} label={`Show ${hiddenCount} more`} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
};
