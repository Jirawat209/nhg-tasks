import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, Trash2, PaintBucket } from 'lucide-react';
import type { ColumnOption } from '../../types';
import { useBoardStore } from '../../store/useBoardStore';
import { LABEL_COLORS, nextUniqueLabel } from '../../lib/labelColors';
import { tintLabel, LABEL_TEXT } from '../../lib/labelTint';

interface StatusPickerProps {
    columnId: string; // Need this for editing
    options: ColumnOption[];
    onSelect: (label: string) => void;
    onClose: () => void;
    currentValue?: string;
    position: { top: number; bottom: number; left: number; width: number };
}

export const StatusPicker = ({ columnId, options = [], onSelect, onClose, position }: StatusPickerProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const colorPaletteRef = useRef<HTMLDivElement>(null);
    const [isEditingLabels, setIsEditingLabels] = useState(false);
    const [pickerHeight, setPickerHeight] = useState(0);

    const safeOptions = Array.isArray(options) ? options : [];

    // Measure height after render to handle overflow
    useEffect(() => {
        if (menuRef.current) {
            setPickerHeight(menuRef.current.offsetHeight);
        }
    }, [safeOptions, isEditingLabels]);

    // Calculate vertical position
    const spaceBelow = window.innerHeight - position.bottom;
    const shouldShowAbove = spaceBelow < (isEditingLabels ? 400 : 250) && position.top > (isEditingLabels ? 400 : 250);

    // Clamped to the viewport: opening the picker from a row near the bottom of a
    // long board used to push the top of the list off-screen, hiding the first
    // labels (and, in edit mode, whatever sat above the fold).
    const rawTopPos = shouldShowAbove
        ? position.top - (pickerHeight || (isEditingLabels ? 400 : 220)) - 8
        : position.bottom + 8;
    const topPos = Math.max(8, Math.min(rawTopPos, window.innerHeight - (pickerHeight || 220) - 8));

    // Store actions
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const updateColumnOption = useBoardStore(state => state.updateColumnOption);
    const deleteColumnOption = useBoardStore(state => state.deleteColumnOption);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // The colour palette is portalled out of the menu (so the scrolling
            // label list can't clip it), so it has to be excluded explicitly or
            // picking a colour would close the whole picker.
            if (colorPaletteRef.current?.contains(target)) return;
            if (menuRef.current && !menuRef.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);


    // Focus the freshly added label so the user is typing its name immediately.
    // The placeholder text is selected rather than left empty, so typing replaces
    // it in one go while still leaving a usable value if they click away.
    const labelInputs = useRef<Map<string, HTMLInputElement>>(new Map());
    const focusNewLabel = useRef(false);

    const handleAddLabel = () => {
        focusNewLabel.current = true;
        addColumnOption(columnId, nextUniqueLabel(safeOptions.map(o => o.label)), '#c4c4c4');
    };

    useEffect(() => {
        if (!focusNewLabel.current) return;
        const added = safeOptions[safeOptions.length - 1];
        const input = added && labelInputs.current.get(added.id);
        if (!input) return;
        focusNewLabel.current = false;
        // The list scrolls, so a label appended past the fold needs bringing back
        // into view before focusing it.
        input.scrollIntoView({ block: 'nearest' });
        input.focus();
        input.select();
    }, [safeOptions]);

    // Anchored to the swatch's on-screen rect rather than to the row, because the
    // palette is rendered in a portal to escape the scrolling label list.
    const [colorPicker, setColorPicker] = useState<{ optionId: string; top: number; left: number } | null>(null);

    const openColorPicker = (optionId: string, swatch: HTMLElement) => {
        if (colorPicker?.optionId === optionId) {
            setColorPicker(null);
            return;
        }
        const rect = swatch.getBoundingClientRect();
        const PALETTE_WIDTH = 252;
        const PALETTE_HEIGHT = 220;
        // Keep it on screen: flip above the swatch when there's no room below,
        // and pull it left when it would run past the right edge.
        const top = rect.bottom + PALETTE_HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - PALETTE_HEIGHT - 4)
            : rect.bottom + 4;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - PALETTE_WIDTH - 8));
        setColorPicker({ optionId, top, left });
    };

    if (isEditingLabels) {
        return createPortal(
            <div
                ref={menuRef}
                className="glass-pop"
                style={{
                    position: 'fixed',
                    top: topPos,
                    left: position.left - (280 - position.width) / 2, // Wider for edit mode
                    width: '280px',
                    borderRadius: '16px',
                    zIndex: 9999,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}
            >
                {/* Scrolls rather than overflowing: with `overflow: visible` a long
                    label list spilled past this 300px box and painted straight over
                    the "New label" button below, so the button was both invisible
                    and unclickable once a board had ~9 statuses. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', flexShrink: 0, paddingRight: '4px' }}>
                    {safeOptions.map((opt) => (
                        <div key={opt.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', flexShrink: 0 }}>
                            <div style={{
                                width: '24px',
                                height: '24px',
                                backgroundColor: tintLabel(opt.color),
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: LABEL_TEXT,
                                cursor: 'pointer',
                                flexShrink: 0
                            }}
                                onClick={(e) => openColorPicker(opt.id, e.currentTarget)}
                                title="Change color"
                            >
                                <PaintBucket size={12} />
                            </div>

                            <input
                                ref={(el) => {
                                    if (el) labelInputs.current.set(opt.id, el);
                                    else labelInputs.current.delete(opt.id);
                                }}
                                value={opt.label}
                                onChange={(e) => updateColumnOption(columnId, opt.id, { label: e.target.value })}
                                onKeyDown={(e) => {
                                    // Enter commits and gets out of the way; Escape closes
                                    // the editor rather than leaking up to the grid.
                                    if (e.key === 'Enter' || e.key === 'Escape') {
                                        e.stopPropagation();
                                        e.currentTarget.blur();
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                    borderRadius: '8px',
                                    padding: '5px 8px',
                                    outline: 'none',
                                    fontSize: '13px',
                                    backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                    color: 'hsl(var(--color-text-primary))'
                                }}
                            />

                            <button
                                onClick={() => deleteColumnOption(columnId, opt.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: '4px' }}
                                title="Delete Label"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleAddLabel}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                        borderRadius: '8px',
                        padding: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        color: 'hsl(var(--color-text-primary))'
                    }}
                >
                    <Plus size={14} />
                    New label
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                    <button
                        onClick={() => setIsEditingLabels(false)}
                        style={{
                            backgroundColor: 'hsl(var(--color-brand-primary))',
                            border: 'none',
                            borderRadius: '999px',
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '7px 24px',
                            cursor: 'pointer',
                            color: '#FFEFD2',
                            transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        Apply
                    </button>
                </div>

                {colorPicker && createPortal(
                    <div
                        ref={colorPaletteRef}
                        className="glass-pop"
                        style={{
                            position: 'fixed',
                            top: colorPicker.top,
                            left: colorPicker.left,
                            borderRadius: '12px',
                            padding: '10px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(10, 1fr)',
                            gap: '5px',
                            zIndex: 10000,
                            width: '252px'
                        }}
                    >
                        {(() => {
                            const opt = safeOptions.find(o => o.id === colorPicker.optionId);
                            return LABEL_COLORS.map(c => (
                                <div
                                    key={c}
                                    onClick={() => {
                                        updateColumnOption(columnId, colorPicker.optionId, { color: c });
                                        setColorPicker(null);
                                    }}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        backgroundColor: tintLabel(c),
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        border: opt?.color === c ? '2px solid hsl(var(--color-text-primary))' : '1px solid rgba(21, 42, 0, 0.12)'
                                    }}
                                />
                            ));
                        })()}
                    </div>,
                    document.body
                )}
            </div>,
            document.body
        );
    }

    // Default View (Picker)
    return createPortal(
        <div
            ref={menuRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: topPos,
                left: position.left - (340 - position.width) / 2,
                width: '340px',
                borderRadius: '16px',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            <div style={{ padding: '14px 14px 8px 14px' }}>
                {/* Scrolls rather than overflowing: with no cap, a board with enough
                    options pushed this grid — and the "Edit Labels" button below it —
                    straight off the bottom of the screen with no way to reach either. */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    paddingRight: '2px'
                }}>
                    {safeOptions.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => onSelect(opt.id)}
                            style={{
                                backgroundColor: tintLabel(opt.color),
                                color: LABEL_TEXT,
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s, transform 0.1s',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.9';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', paddingTop: '6px' }}>
                    <button
                        className="status-picker-edit-btn"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: 'transparent',
                            border: 'none',
                            color: 'hsl(var(--color-text-secondary))',
                            cursor: 'pointer',
                            padding: '5px 12px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            borderRadius: '999px'
                        }}
                        onClick={() => setIsEditingLabels(true)}
                    >
                        <Pencil size={13} strokeWidth={1.7} />
                        Edit Labels
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
