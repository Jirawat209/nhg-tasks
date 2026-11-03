import { Bell, CalendarClock, FileText, MessageSquare, RefreshCw, ThumbsUp, UserPlus, type LucideIcon } from 'lucide-react';

export interface NotificationKind {
    Icon: LucideIcon;
    /** The symbol's colour (any CSS colour) */
    tone: string;
    /** A short name for the kind, shown where a notification has no title of its own */
    label: string;
}

const BRAND = 'hsl(var(--color-brand-primary))';
const NEUTRAL = 'hsl(var(--color-text-secondary))';

/**
 * How each kind of notification is drawn: its symbol, that symbol's colour and
 * a short name. Shared by the bell's list (NotificationItem) and the Home
 * page's Update feed, so one kind looks the same in both.
 */
export const notificationKind = (type: string): NotificationKind => {
    switch (type) {
        case 'workspace_invite': return { Icon: UserPlus, tone: BRAND, label: 'Workspace invitation' };
        case 'board_invite': return { Icon: UserPlus, tone: BRAND, label: 'Board invitation' };
        case 'assignment': return { Icon: FileText, tone: 'hsl(var(--color-status-green-bg))', label: 'Assigned to you' };
        case 'mention': return { Icon: MessageSquare, tone: '#A76400', label: 'Mention' };
        case 'comment': return { Icon: MessageSquare, tone: NEUTRAL, label: 'Update' };
        case 'like': return { Icon: ThumbsUp, tone: '#A76400', label: 'Like' };
        case 'due_date_reminder': return { Icon: CalendarClock, tone: '#9E2A2B', label: 'Due date' };
        case 'status_update': return { Icon: RefreshCw, tone: BRAND, label: 'Status change' };
        case 'item_change': return { Icon: RefreshCw, tone: BRAND, label: 'Item change' };
        case 'access_granted': return { Icon: Bell, tone: NEUTRAL, label: 'Access granted' };
        case 'board_added': return { Icon: Bell, tone: NEUTRAL, label: 'Added to a board' };
        case 'workspace_added': return { Icon: Bell, tone: NEUTRAL, label: 'Added to a workspace' };
        default: return { Icon: Bell, tone: NEUTRAL, label: 'Notification' };
    }
};
