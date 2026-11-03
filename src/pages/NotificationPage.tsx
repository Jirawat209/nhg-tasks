import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { useAuth } from '../contexts/AuthContext';
import { NotificationItem } from '../components/notifications/NotificationItem';
import { CheckCheck, BellRing } from 'lucide-react';

export const NotificationPage = () => {
    const { user } = useAuth();
    const notifications = useBoardStore(state => state.notifications || []);
    const loadNotifications = useBoardStore(state => state.loadNotifications);
    const unreadCount = useBoardStore(state => state.notifications?.filter(n => !n.is_read).length || 0);
    const markAllNotificationsAsRead = useBoardStore(state => state.markAllNotificationsAsRead);

    const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'mentions'>('all');

    useEffect(() => {
        if (user?.id) {
            loadNotifications();
        }
    }, [user?.id, loadNotifications]);

    const mentionsCount = notifications.filter(
        n => n.type === 'mention' || n.type === 'assignment' || n.type === 'comment'
    ).length;

    const filteredNotifications = notifications.filter(n => {
        if (activeTab === 'unread') return !n.is_read;
        if (activeTab === 'mentions') return n.type === 'mention' || n.type === 'assignment' || n.type === 'comment';
        return true;
    });

    const tabLabels: Record<'all' | 'unread' | 'mentions', string> = {
        all: `All (${notifications.length})`,
        unread: `Unread (${unreadCount})`,
        mentions: `Mentions (${mentionsCount})`
    };

    return (
        <div className="home-page" style={{ padding: '20px 28px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            {/* Top Page Header matching Home & Favorites */}
            <header style={{
                marginBottom: '22px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
            }}>
                <div>
                    <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                        INBOX · ACTIVITY & UPDATES
                    </div>
                    <h1 className="narai-heading" style={{
                        fontFamily: 'var(--font-family-display)',
                        fontSize: '28px',
                        fontWeight: 500,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.15,
                        color: 'hsl(var(--color-text-primary))',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <span>Notifications</span>
                        {unreadCount > 0 && (
                            <span style={{
                                backgroundColor: 'hsl(var(--color-brand-primary) / 0.12)',
                                color: 'hsl(var(--color-brand-primary))',
                                fontFamily: 'var(--font-family-sans)',
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '2px 9px',
                                borderRadius: '999px'
                            }}>
                                {unreadCount} new
                            </span>
                        )}
                    </h1>
                    <p style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '13.5px', margin: 0 }}>
                        Stay updated on mentions, assignments, and workspace invitations.
                    </p>
                </div>

                {/* Filter & Actions Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div className="seg glass-chip">
                        {(['all', 'unread', 'mentions'] as const).map(tab => (
                            <button
                                key={tab}
                                type="button"
                                className={`seg-btn${activeTab === tab ? ' is-active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                                style={{ height: '28px', padding: '0 13px', fontSize: '12px' }}
                            >
                                {tabLabels[tab]}
                            </button>
                        ))}
                    </div>

                    {unreadCount > 0 && (
                        <button
                            type="button"
                            className="glass-chip"
                            onClick={() => markAllNotificationsAsRead()}
                            style={{
                                height: '32px',
                                padding: '0 13px',
                                borderRadius: '999px',
                                color: 'hsl(var(--color-brand-primary))',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <CheckCheck size={14} />
                            <span>Mark all as read</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Section & Content Card matching Home Update Feed */}
            <section style={{ marginBottom: '24px' }}>
                <div className="home-section-head">
                    <div className="home-section-title-group">
                        <span className="home-section-badge home-section-badge--count">
                            {filteredNotifications.length}
                        </span>
                        <h2 className="home-section-title">
                            {activeTab === 'all' ? 'All updates' : activeTab === 'unread' ? 'Unread updates' : 'Mentions & assignments'}
                        </h2>
                    </div>
                </div>

                <div className="card-surface home-feed" style={{ padding: filteredNotifications.length > 0 ? '4px 0' : undefined, overflow: 'hidden' }}>
                    {filteredNotifications.length > 0 ? (
                        filteredNotifications.map((notification, index) => (
                            <div
                                key={notification.id}
                                style={{
                                    borderBottom: index < filteredNotifications.length - 1
                                        ? '1px solid var(--paper-row-line, hsl(var(--color-border)))'
                                        : 'none'
                                }}
                            >
                                <NotificationItem notification={notification} />
                            </div>
                        ))
                    ) : (
                        <div className="home-feed__state" style={{ padding: '44px 24px' }}>
                            <div style={{
                                width: '44px',
                                height: '44px',
                                margin: '0 auto 12px',
                                backgroundColor: 'hsl(var(--color-brand-primary) / 0.08)',
                                color: 'hsl(var(--color-brand-primary))',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <BellRing size={20} />
                            </div>
                            <strong>You're all caught up</strong>
                            {activeTab === 'all'
                                ? 'New mentions, assignments, and workspace invites will show up here.'
                                : activeTab === 'unread'
                                    ? "You've read all your notifications."
                                    : "You haven't been mentioned or assigned in any tasks yet."}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};
