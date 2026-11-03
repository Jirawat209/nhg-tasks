import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowUpRight, Bell, CheckCheck, Sun, Moon } from 'lucide-react';
import { CloudStatus } from './CloudStatus';
import { useBoardStore } from '../../store/useBoardStore';
import { useThemeStore } from '../../store/useThemeStore';
import { NotificationItem } from '../notifications/NotificationItem';
import { NotificationToastStack } from '../notifications/NotificationToastStack';

const selectUnreadCount = (state: ReturnType<typeof useBoardStore.getState>) =>
    state.notifications?.filter(n => !n.is_read).length || 0;

export const GlobalTopActions = () => {
    const { user } = useAuth();
    const unreadCount = useBoardStore(selectUnreadCount);
    const loadNotifications = useBoardStore(state => state.loadNotifications);
    const markAllNotificationsAsRead = useBoardStore(state => state.markAllNotificationsAsRead);
    const navigateTo = useBoardStore(state => state.navigateTo);

    const { theme, toggleTheme } = useThemeStore();

    const [showNotifications, setShowNotifications] = useState(false);
    const bellBtnRef = useRef<HTMLButtonElement>(null);
    const notificationMenuRef = useRef<HTMLDivElement>(null);

    const notifications = useBoardStore(state => state.notifications || []);
    const recentNotifications = notifications.slice(0, 5);

    const latestNotificationId = notifications[0]?.id;
    const prevLatestIdRef = useRef<string | null>(null);
    const prevUnreadCountRef = useRef<number>(unreadCount);
    const [toastQueue, setToastQueue] = useState<typeof notifications>([]);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [isShaking, setIsShaking] = useState(false);

    useEffect(() => {
        if (initialLoadDone && latestNotificationId && latestNotificationId !== prevLatestIdRef.current) {
            setToastQueue(prev => [...prev, notifications[0]].slice(-3));
            setIsShaking(true);
            const timer = setTimeout(() => setIsShaking(false), 950);
            prevLatestIdRef.current = latestNotificationId;
            return () => clearTimeout(timer);
        }
        prevLatestIdRef.current = latestNotificationId ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestNotificationId, initialLoadDone]);

    useEffect(() => {
        if (unreadCount > prevUnreadCountRef.current) {
            setIsShaking(true);
            const timer = setTimeout(() => setIsShaking(false), 950);
            prevUnreadCountRef.current = unreadCount;
            return () => clearTimeout(timer);
        }
        prevUnreadCountRef.current = unreadCount;
    }, [unreadCount]);

    const removeToast = useCallback((id: string) => {
        setToastQueue(prev => prev.filter(n => n.id !== id));
    }, []);

    useEffect(() => {
        if (user?.id) {
            loadNotifications().finally(() => setInitialLoadDone(true));
        }
    }, [user?.id, loadNotifications]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                notificationMenuRef.current &&
                !notificationMenuRef.current.contains(target) &&
                bellBtnRef.current &&
                !bellBtnRef.current.contains(target)
            ) {
                setShowNotifications(false);
            }
        };

        if (showNotifications) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNotifications]);

    const getPopoverPosition = () => {
        const rect = bellBtnRef.current?.getBoundingClientRect();
        if (!rect) return { top: 64, right: 20 };
        const rightGap = Math.max(16, window.innerWidth - rect.right);
        return {
            top: rect.bottom + 10,
            right: rightGap
        };
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Cloud Status Indicator */}
            <CloudStatus />

            <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--paper-edge, hsl(var(--color-border)))', margin: '0 4px' }} />

            {/* Theme Toggle Button */}
            <button
                onClick={toggleTheme}
                className="theme-toggle-btn flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-[hsl(var(--color-bg-hover))] focus:outline-none"
                style={{
                    backgroundColor: 'transparent',
                    color: 'hsl(var(--color-text-secondary))',
                    border: 'none',
                    cursor: 'pointer'
                }}
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
                {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>

            {/* Notification Bell */}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <button
                    ref={bellBtnRef}
                    onClick={() => setShowNotifications(prev => !prev)}
                    className="notification-bell-btn focus:outline-none"
                    style={{
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: showNotifications ? 'hsl(var(--color-brand-primary) / 0.1)' : 'transparent',
                        color: unreadCount > 0 ? '#C83E2B' : 'hsl(var(--color-text-primary))',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease, transform 0.15s ease'
                    }}
                    title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'No new notifications'}
                >
                    {unreadCount > 0 ? (
                        <span
                            className={isShaking ? 'bell-ring-shake' : ''}
                            style={{
                                position: 'relative',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '24px',
                                height: '24px',
                                transformOrigin: '50% 12%',
                            }}
                        >
                            <Bell
                                size={24}
                                color="#C83E2B"
                                fill="#C83E2B"
                                strokeWidth={1.9}
                            />
                            <span
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -56%)',
                                    color: '#FFEFD2',
                                    fontSize: unreadCount > 99 ? '7.5px' : unreadCount > 9 ? '8.5px' : '10px',
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    letterSpacing: '-0.03em',
                                    pointerEvents: 'none',
                                    userSelect: 'none'
                                }}
                            >
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        </span>
                    ) : (
                        <span
                            className={isShaking ? 'bell-ring-shake' : ''}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transformOrigin: '50% 12%',
                            }}
                        >
                            <Bell size={19} />
                        </span>
                    )}
                </button>

                {/* Notification Popover (portaled to body so it never clips against panel edges) */}
                {showNotifications && createPortal(
                    <div
                        ref={notificationMenuRef}
                        className="glass-pop"
                        style={{
                            position: 'fixed',
                            ...getPopoverPosition(),
                            width: 'min(368px, calc(100vw - 32px))',
                            backgroundColor: 'hsl(var(--paper, #fffbf3))',
                            borderRadius: '18px',
                            boxShadow: 'var(--glass-pop-shadow, 0 22px 48px -18px rgba(21, 42, 0, 0.40))',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            zIndex: 1300,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Popover Header */}
                        <div style={{
                            padding: '13px 16px 11px',
                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                            borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="narai-heading" style={{
                                    fontFamily: 'var(--font-family-display)',
                                    fontSize: '17px',
                                    fontWeight: 600,
                                    letterSpacing: '-0.015em',
                                    color: 'hsl(var(--color-text-primary))'
                                }}>
                                    Notifications
                                </span>
                                {unreadCount > 0 && (
                                    <span style={{
                                        padding: '1px 8px',
                                        borderRadius: '999px',
                                        backgroundColor: 'hsl(var(--color-brand-primary) / 0.1)',
                                        color: 'hsl(var(--color-brand-primary))',
                                        fontSize: '11px',
                                        fontWeight: 700
                                    }}>
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>

                            {unreadCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => markAllNotificationsAsRead()}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: '2px 4px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        color: 'hsl(var(--color-brand-primary))',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <CheckCheck size={13} />
                                    <span>Mark all read</span>
                                </button>
                            )}
                        </div>

                        {/* Notification Rows */}
                        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                            {recentNotifications.length > 0 ? (
                                recentNotifications.map(notification => (
                                    <NotificationItem
                                        key={notification.id}
                                        notification={notification}
                                        compact
                                        onClose={() => setShowNotifications(false)}
                                    />
                                ))
                            ) : (
                                <div style={{
                                    padding: '32px 20px',
                                    textAlign: 'center',
                                    color: 'hsl(var(--color-text-tertiary))',
                                    fontSize: '13px'
                                }}>
                                    You're all caught up — no notifications yet.
                                </div>
                            )}
                        </div>

                        {/* Popover Footer */}
                        <div style={{
                            padding: '10px 14px',
                            borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))',
                            display: 'flex',
                            justifyContent: 'center'
                        }}>
                            <button
                                type="button"
                                className="glass-chip"
                                onClick={() => {
                                    setShowNotifications(false);
                                    navigateTo('notifications');
                                }}
                                style={{
                                    width: '100%',
                                    height: '32px',
                                    borderRadius: '999px',
                                    color: 'hsl(var(--color-brand-primary))',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>See all notifications</span>
                                <ArrowUpRight size={13} />
                            </button>
                        </div>
                    </div>,
                    document.body
                )}

                <NotificationToastStack toasts={toastQueue} onRemove={removeToast} />
                <style>{`
                    @keyframes naraiBellRing {
                        0%   { transform: rotate(0deg) scale(1); }
                        12%  { transform: rotate(18deg) scale(1.12); }
                        24%  { transform: rotate(-16deg) scale(1.12); }
                        36%  { transform: rotate(14deg) scale(1.08); }
                        48%  { transform: rotate(-12deg) scale(1.06); }
                        60%  { transform: rotate(8deg) scale(1.03); }
                        72%  { transform: rotate(-6deg) scale(1.01); }
                        85%  { transform: rotate(3deg) scale(1); }
                        100% { transform: rotate(0deg) scale(1); }
                    }
                    .bell-ring-shake {
                        animation: naraiBellRing 0.85s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
                    }
                    .notification-bell-btn:hover > span {
                        animation: naraiBellRing 0.75s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
                    }
                `}</style>
            </div>
        </div>
    );
};
