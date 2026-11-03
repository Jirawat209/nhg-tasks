import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Type, Users, Calendar, CalendarClock, CheckSquare, Hash, Link2, ArrowDownCircle, PieChart, CalendarRange, FileText, Star } from 'lucide-react';

interface AddColumnMenuProps {
    onSelect: (type: 'text' | 'status' | 'date' | 'due_date' | 'number' | 'dropdown' | 'checkbox' | 'link' | 'people' | 'timeline' | 'files' | 'priority') => void;
    onClose: () => void;
    position: { top: number; bottom: number; left: number };
}

export const AddColumnMenu = ({ onSelect, onClose, position }: AddColumnMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Narai-derived per-type colors (not Monday's palette — each type gets a
    // distinct earth tone from the brand family instead of Monday's exact
    // green/blue/purple/red/orange/blue mapping).
    const items = [
        { id: 'status', label: 'Status', icon: PieChart, color: '#3F7D32' },
        { id: 'text', label: 'Text', icon: Type, color: '#8A6D3B' },
        { id: 'people', label: 'Person', icon: Users, color: '#2E7D8C' },
        { id: 'timeline', label: 'Timeline', icon: CalendarRange, color: '#6B3B52' },
        { id: 'dropdown', label: 'Dropdown', icon: ArrowDownCircle, color: '#AAA024' },
        { id: 'date', label: 'Date', icon: Calendar, color: '#A76400' },
        { id: 'due_date', label: 'Due Date', icon: CalendarClock, color: '#B33F2E' },
        { id: 'number', label: 'Numbers', icon: Hash, color: '#5B6B3F' },
        { id: 'priority', label: 'Priority', icon: Star, color: '#C98A1F' },
        { id: 'checkbox', label: 'Checkbox', color: '#4F7F43', icon: CheckSquare },
        { id: 'link', label: 'Link', icon: Link2, color: '#3D6B6B' },
        { id: 'files', label: 'Files', icon: FileText, color: '#152A00' },
    ];

    return createPortal(
        <div
            ref={menuRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: position.bottom + 8,
                left: Math.min(Math.max(20, position.left - 150), window.innerWidth - 340), // 320px width + 20px padding
                width: '320px',
                borderRadius: '16px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                color: 'hsl(var(--color-text-primary))'
            }}
        >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))' }}>
                <input
                    type="text"
                    placeholder="Search or describe your column"
                    style={{
                        width: '100%',
                        padding: '7px 12px',
                        borderRadius: '999px',
                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                        outline: 'none',
                        fontSize: '13px',
                        backgroundColor: 'hsl(var(--paper, var(--color-bg-subtle)))',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                    autoFocus
                />
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '10px', color: 'hsl(var(--color-text-tertiary))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Essentials</div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px'
                }}>
                    {items.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => onSelect(item.id as any)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '9px',
                                cursor: 'pointer',
                                padding: '5px 6px',
                                borderRadius: '8px',
                                transition: 'background 0.1s'
                            }}
                            className="hover-bg"
                        >
                            <div style={{
                                width: '24px',
                                height: '24px',
                                backgroundColor: item.color,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFEFD2',
                                flexShrink: 0
                            }}>
                                <item.icon size={13} />
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'hsl(var(--color-text-primary))' }}>{item.label}</span>
                        </div>
                    ))}
                </div>
                <style>{`
                    .hover-bg:hover { background-color: hsl(var(--color-text-primary) / 0.06) !important; }
                `}</style>
            </div>
        </div>,
        document.body
    );
};
