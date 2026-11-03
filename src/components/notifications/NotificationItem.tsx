import { useBoardStore } from '../../store/useBoardStore';
import type { Notification } from '../../types';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { notificationKind } from './notificationKind';

interface NotificationItemProps {
    notification: Notification;
    onClose?: () => void;
    compact?: boolean;
}

const formatCompactTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export const NotificationItem = ({ notification, onClose, compact = false }: NotificationItemProps) => {
    const markNotificationAsRead = useBoardStore(state => state.markNotificationAsRead);
    const handleAcceptInvite = useBoardStore(state => state.handleAcceptInvite);
    const handleDeclineInvite = useBoardStore(state => state.handleDeclineInvite);
    const dismissNotification = useBoardStore(state => state.dismissNotification);
    const setActiveBoard = useBoardStore(state => state.setActiveBoard);
    const setActiveWorkspace = useBoardStore(state => state.setActiveWorkspace);
    const setActiveItem = useBoardStore(state => state.setActiveItem);
    const navigateTo = useBoardStore(state => state.navigateTo);
    const [isProcessing, setIsProcessing] = useState(false);

    const isInvite = notification.type === 'workspace_invite' || notification.type === 'board_invite';
    const isMention = notification.type === 'mention';
    const isComment = notification.type === 'comment';

    const handleAction = async (action: 'accept' | 'decline') => {
        setIsProcessing(true);
        try {
            if (action === 'accept') {
                await handleAcceptInvite(notification);
            } else {
                await handleDeclineInvite(notification);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClick = () => {
        if (!notification.is_read) {
            markNotificationAsRead(notification.id);
        }

        if (notification.data?.board_id) {
            setActiveBoard(notification.data.board_id);
            if (notification.entity_id && notification.entity_id !== notification.data.board_id) {
                setActiveItem(notification.entity_id);
                useBoardStore.getState().setHighlightedUpdate(notification.data?.update_id || null);
            }
            if (onClose) onClose();
        } else if (notification.data?.workspace_id) {
            setActiveWorkspace(notification.data.workspace_id);
            navigateTo('home');
            if (onClose) onClose();
        }
    };

    const { Icon, tone, label } = notificationKind(notification.type);

    return (
        <div
            onClick={handleClick}
            style={{
                padding: compact ? '12px 14px' : '14px 16px',
                borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                cursor: 'pointer',
                position: 'relative',
                backgroundColor: !notification.is_read
                    ? 'hsl(var(--color-brand-primary) / 0.045)'
                    : 'transparent',
                transition: 'background-color 0.16s ease'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = !notification.is_read
                    ? 'hsl(var(--color-brand-primary) / 0.08)'
                    : 'hsl(var(--color-brand-primary) / 0.035)';
                const dismissBtn = e.currentTarget.querySelector('.dismiss-btn') as HTMLElement;
                if (dismissBtn) dismissBtn.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = !notification.is_read
                    ? 'hsl(var(--color-brand-primary) / 0.045)'
                    : 'transparent';
                const dismissBtn = e.currentTarget.querySelector('.dismiss-btn') as HTMLElement;
                if (dismissBtn) dismissBtn.style.opacity = '0';
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {/* Circular Tinted Icon Badge matching Home Feed */}
                <span
                    aria-hidden="true"
                    style={{
                        marginTop: '1px',
                        flexShrink: 0,
                        width: compact ? '34px' : '38px',
                        height: compact ? '34px' : '38px',
                        borderRadius: '50%',
                        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
                        color: tone,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Icon size={compact ? 16 : 17} />
                </span>

                <div style={{ flex: 1, minWidth: 0, paddingRight: '22px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                        <p style={{
                            fontSize: compact ? '13px' : '13.5px',
                            color: 'hsl(var(--color-text-primary))',
                            margin: 0,
                            fontWeight: !notification.is_read ? 600 : 500,
                            lineHeight: 1.35,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {notification.title || notification.content || label}
                        </p>
                        <span style={{
                            fontSize: '11.5px',
                            color: 'hsl(var(--color-text-tertiary))',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            {!notification.is_read && (
                                <span
                                    title="Unread"
                                    style={{
                                        width: '6.5px',
                                        height: '6.5px',
                                        borderRadius: '50%',
                                        backgroundColor: 'hsl(var(--color-brand-primary))',
                                        boxShadow: '0 0 0 2.5px hsl(var(--color-brand-primary) / 0.16)'
                                    }}
                                />
                            )}
                            {formatCompactTime(notification.created_at)}
                        </span>
                    </div>

                    {notification.message && (
                        <p style={{
                            fontSize: compact ? '12.5px' : '13px',
                            color: 'hsl(var(--color-text-secondary))',
                            margin: '3px 0 0',
                            lineHeight: 1.45,
                            overflowWrap: 'anywhere'
                        }}>
                            {notification.message}
                        </p>
                    )}

                    {(isMention || isComment) && notification.data?.updatePreview && (
                        <div style={{
                            marginTop: '7px',
                            padding: '6px 10px',
                            backgroundColor: `color-mix(in srgb, ${tone} 7%, transparent)`,
                            borderLeft: `2px solid ${tone}`,
                            borderRadius: '0 8px 8px 0',
                            fontSize: '12px',
                            color: 'hsl(var(--color-text-secondary))',
                            lineHeight: 1.45,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                        } as React.CSSProperties}>
                            {notification.data.updatePreview}
                        </div>
                    )}

                    {/* Invite Actions */}
                    {isInvite && (!notification.status || notification.status === 'pending') && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                            <button
                                type="button"
                                className="btn-solid"
                                onClick={() => handleAction('accept')}
                                disabled={isProcessing}
                                style={{
                                    height: '28px',
                                    padding: '0 14px',
                                    borderRadius: '999px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px'
                                }}
                            >
                                {isProcessing ? '…' : <><Check size={12} /> Accept</>}
                            </button>
                            <button
                                type="button"
                                className="glass-chip"
                                onClick={() => handleAction('decline')}
                                disabled={isProcessing}
                                style={{
                                    height: '28px',
                                    padding: '0 14px',
                                    borderRadius: '999px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px'
                                }}
                            >
                                <X size={12} /> Decline
                            </button>
                        </div>
                    )}

                    {/* Status Feedback */}
                    {notification.status && notification.status !== 'pending' && (
                        <div style={{
                            marginTop: '8px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '3px 9px',
                            borderRadius: '999px',
                            width: 'fit-content',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: notification.status === 'accepted' ? 'rgba(63, 125, 50, 0.12)' : 'rgba(176, 61, 46, 0.12)',
                            color: notification.status === 'accepted' ? '#2A5A20' : '#9E2E20'
                        }}>
                            {notification.status === 'accepted' ? <Check size={11} /> : <X size={11} />}
                            {notification.status === 'accepted' ? 'Accepted' : 'Declined'}
                        </div>
                    )}
                </div>

                {/* Hover Dismiss Button */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        dismissNotification(notification.id);
                    }}
                    className="dismiss-btn"
                    style={{
                        position: 'absolute',
                        top: '11px',
                        right: '10px',
                        opacity: 0,
                        transition: 'opacity 0.16s, background-color 0.16s, color 0.16s',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        color: 'hsl(var(--color-text-tertiary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'hsl(var(--color-danger, 0 72% 50%) / 0.12)';
                        e.currentTarget.style.color = 'hsl(var(--color-danger, 0 72% 50%))';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'hsl(var(--color-text-tertiary))';
                    }}
                    title="Dismiss notification"
                >
                    <X size={13} />
                </button>
            </div>
        </div>
    );
};
