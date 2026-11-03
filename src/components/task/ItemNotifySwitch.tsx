import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useUserStore } from '../../store/useUserStore';
import { peopleOnItem } from '../../lib/itemPeople';

const Toggle = ({ on }: { on: boolean }) => (
    <span aria-hidden="true" style={{
        position: 'relative', width: '32px', height: '18px', borderRadius: '9px', flexShrink: 0,
        background: on ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-border-strong, var(--color-border)))',
        transition: 'background-color 0.15s ease',
    }}>
        <span style={{
            position: 'absolute', top: '2px', left: on ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%',
            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s ease',
        }} />
    </span>
);

/**
 * The item's notification control, at the end of the "Waiting on" bar: on for
 * everyone in the item's Person column unless switched off, person by person. The
 * people who are on hear about changes to the item in the app and by email (see
 * itemSlice: status, updates, other fields).
 */
export const ItemNotifySwitch = ({ itemId }: { itemId: string }) => {
    const board = useBoardStore(state => state.boards.find(b => b.items.some(i => i.id === itemId)));
    const item = board?.items.find(i => i.id === itemId);
    const members = useBoardStore(state => state.activeBoardMembers);
    const setMyItemNotifications = useBoardStore(state => state.setMyItemNotifications);
    const meId = useUserStore(state => state.currentUser?.id);

    const people = useMemo(() => peopleOnItem(board, item).map(id => {
        const member = members.find((m: any) => m.user_id === id);
        const profile = (Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles) || {};
        const name = profile.full_name || profile.email || 'Unknown';
        return { id, name, email: profile.email as string | undefined, avatar: profile.avatar_url as string | undefined };
    }), [board, item, members]);
    const off = new Set(item?.notifyMutedUserIds || []);
    const onCount = people.filter(p => !off.has(p.id)).length;

    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const toggleOpen = () => {
        if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
        }
        setOpen(v => !v);
    };

    const summary = people.length === 0 ? 'On' : onCount === 0 ? 'Off' : onCount === people.length ? 'On' : `${onCount} of ${people.length}`;
    const active = people.length === 0 || onCount > 0;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={toggleOpen}
                className="glass-chip"
                title="Choose who is notified (in the app and by email) about this item"
                style={{
                    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '7px',
                    padding: '4px 10px 4px 11px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
                    color: active ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))',
                    transition: 'background-color 0.15s ease'
                }}
            >
                {active ? <Bell size={13.5} /> : <BellOff size={13.5} />}
                Notification
                <span style={{
                    padding: '1.5px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.03em',
                    background: active ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-bg-subtle))',
                    color: active ? '#FFEFD2' : 'hsl(var(--color-text-tertiary))',
                }}>{summary}</span>
            </button>

            {open && pos && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Who is notified"
                    className="glass-pop"
                    style={{
                        position: 'fixed', top: pos.top, right: pos.right, width: 320, maxHeight: 'min(420px, 70vh)', overflowY: 'auto', zIndex: 100001,
                        background: 'hsl(var(--color-bg-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '14px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: '8px',
                    }}
                >
                    <div style={{ padding: '8px 10px 6px', fontSize: '12px', lineHeight: 1.4, color: 'hsl(var(--color-text-secondary))' }}>
                        <strong style={{ display: 'block', color: 'hsl(var(--color-text-primary))', fontSize: '13px' }}>Who is notified</strong>
                        People who are on get an in-app notification and an email when this item changes. Everyone in the Person column is on by default. You can only switch your own on or off.
                    </div>

                    {people.length === 0 && (
                        <div style={{ padding: '12px 10px 14px', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                            No one is in this item's Person column yet. People you add there are notified automatically.
                        </div>
                    )}

                    {people.map(person => {
                        const isOn = !off.has(person.id);
                        const mine = person.id === meId;
                        return (
                            <button
                                key={person.id}
                                type="button"
                                role="switch"
                                aria-checked={isOn}
                                aria-disabled={!mine}
                                disabled={!mine}
                                title={mine ? undefined : `Only ${person.name} can change this`}
                                onClick={() => { if (mine) setMyItemNotifications(itemId, !isOn); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 10px', borderRadius: '8px',
                                    background: mine ? 'hsl(var(--color-bg-subtle))' : 'transparent', border: 'none', textAlign: 'left',
                                    cursor: mine ? 'pointer' : 'default', color: 'hsl(var(--color-text-primary))',
                                }}
                            >
                                <span style={{
                                    width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: person.avatar ? 'transparent' : 'hsl(var(--color-brand-primary))', color: '#fff', fontSize: '12px', fontWeight: 600,
                                }}>
                                    {person.avatar
                                        ? <img src={person.avatar} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : person.name.charAt(0).toUpperCase()}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {person.name}{mine && <span style={{ fontWeight: 500, color: 'hsl(var(--color-text-tertiary))' }}> (you)</span>}
                                    </span>
                                    {person.email && person.email !== person.name && (
                                        <span style={{ display: 'block', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.email}</span>
                                    )}
                                </span>
                                <span style={{ opacity: mine ? 1 : 0.55, display: 'inline-flex' }}><Toggle on={isOn} /></span>
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
};
