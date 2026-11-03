import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Notification } from '../../types';
import { NotificationItem } from './NotificationItem';
import { useBoardStore } from '../../store/useBoardStore';

interface ToastCardProps {
    notification: Notification;
    onRemove: (id: string) => void;
}

const ToastCard = ({ notification, onRemove }: ToastCardProps) => {
    const liveNotification = useBoardStore(state => state.notifications.find(n => n.id === notification.id));

    useEffect(() => {
        if (!liveNotification || liveNotification.is_read) {
            onRemove(notification.id);
        }
    }, [liveNotification, notification.id, onRemove]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 60, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="glass-pop"
            style={{
                width: '348px',
                backgroundColor: 'hsl(var(--paper, #fffbf3))',
                borderRadius: '16px',
                boxShadow: 'var(--glass-pop-shadow, 0 18px 40px -16px rgba(21, 42, 0, 0.35))',
                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                overflow: 'hidden',
                pointerEvents: 'auto'
            }}
        >
            <NotificationItem
                notification={liveNotification ?? notification}
                compact
                onClose={() => onRemove(notification.id)}
            />
        </motion.div>
    );
};

interface NotificationToastStackProps {
    toasts: Notification[];
    onRemove: (id: string) => void;
}

export const NotificationToastStack = ({ toasts, onRemove }: NotificationToastStackProps) => {
    if (toasts.length === 0) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            top: '68px',
            right: '24px',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none'
        }}>
            <AnimatePresence>
                {toasts.map(notification => (
                    <ToastCard key={notification.id} notification={notification} onRemove={onRemove} />
                ))}
            </AnimatePresence>
        </div>,
        document.body
    );
};
