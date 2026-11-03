import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Check, Edit2, PaintBucket } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { LABEL_COLORS, nextLabelColor, nextUniqueLabel, palettePosition, PALETTE_WIDTH } from '../../lib/labelColors';
import { tintLabel, LABEL_TEXT } from '../../lib/labelTint';

interface DropdownPickerProps {
    columnId: string;
    options: { label: string; color: string; id?: string }[];
    currentValue: string[]; // Dropdown is multi-select, so array of IDs or Labels
    position: { top: number; bottom: number; left: number; width: number };
    onSelect: (newValues: string[]) => void;
    onClose: () => void;
}

export const DropdownPicker = ({ columnId, options, currentValue = [], position, onSelect, onClose }: DropdownPickerProps) => {
    // Determine placement (top or bottom)
    const canFitBelow = window.innerHeight - position.bottom > 300;
    const listTop = canFitBelow ? position.bottom + 4 : position.top - 304; // aprox height

    const [searchTerm, setSearchTerm] = useState('');
    const [isEditingLabels, setIsEditingLabels] = useState(false);

    // Actions from store
    const addColumnOption = useBoardStore(state => state.addColumnOption);
    const updateColumnOption = useBoardStore(state => state.updateColumnOption);
    const deleteColumnOption = useBoardStore(state => state.deleteColumnOption);

    const menuRef = useRef<HTMLDivElement>(null);
    const colorPaletteRef = useRef<HTMLDivElement>(null);

    // Which option's palette is open, and where to draw it. Portalled out of the
    // scrolling label list so it can't be clipped by it.
    const [colorPicker, setColorPicker] = useState<{ optionId: string; top: number; left: number } | null>(null);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            // The palette lives in its own portal, so picking a colour would
            // otherwise read as a click outside and close the whole picker.
            if (colorPaletteRef.current?.contains(target)) return;
            if (menuRef.current && !menuRef.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const openColorPicker = (optionId: string, swatch: HTMLElement) => {
        if (colorPicker?.optionId === optionId) {
            setColorPicker(null);
            return;
        }
        setColorPicker({ optionId, ...palettePosition(swatch) });
    };

    // Focus the freshly added label so the user is typing its name immediately,
    // matching StatusPicker's edit-labels flow.
    const labelInputs = useRef<Map<string, HTMLInputElement>>(new Map());
    const focusNewLabel = useRef(false);

    const handleAddLabel = () => {
        focusNewLabel.current = true;
        addColumnOption(columnId, nextUniqueLabel(options.map(o => o.label)), nextLabelColor(options.length));
    };

    useEffect(() => {
        if (!focusNewLabel.current) return;
        const added = options[options.length - 1];
        const input = added?.id && labelInputs.current.get(added.id);
        if (!input) return;
        focusNewLabel.current = false;
        input.scrollIntoView({ block: 'nearest' });
        input.focus();
        input.select();
    }, [options]);

    const handleCreateOption = () => {
        if (!searchTerm.trim()) return;
        addColumnOption(columnId, searchTerm.trim(), nextLabelColor(options.length));
        setSearchTerm('');
    };

    const toggleSelection = (label: string) => {
        const newValues = currentValue.includes(label)
            ? currentValue.filter(v => v !== label)
            : [...currentValue, label];
        onSelect(newValues);
    };

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return createPortal(
        <div
            ref={menuRef}
            className="dropdown-picker-menu glass-pop"
            style={{
                position: 'absolute',
                top: listTop,
                left: position.left,
                width: Math.max(position.width, 240),
                zIndex: 9999,
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '300px',
                overflow: 'hidden'
            }}
        >
            {!isEditingLabels ? (
                <>
                    {/* Search / Create Input */}
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))' }}>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search or create..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleCreateOption();
                            }}
                            style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                backgroundColor: 'hsl(var(--paper, var(--color-bg-base)))',
                                color: 'hsl(var(--color-text-primary))',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Options List */}
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px' }}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = currentValue.includes(opt.label);
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleSelection(opt.label)}
                                        style={{
                                            padding: '6px 8px',
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            marginBottom: '2px',
                                            backgroundColor: isSelected ? 'hsl(var(--color-text-primary) / 0.06)' : 'transparent',
                                            transition: 'background-color 0.1s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = 'hsl(var(--color-text-primary) / 0.04)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <div style={{
                                            width: '9px',
                                            height: '9px',
                                            borderRadius: '50%',
                                            backgroundColor: tintLabel(opt.color)
                                        }} />
                                        <span style={{ flex: 1, fontSize: '13px', color: 'hsl(var(--color-text-primary))' }}>{opt.label}</span>
                                        {isSelected && <Check size={14} style={{ color: 'hsl(var(--color-brand-primary))' }} />}
                                    </div>
                                );
                            })
                        ) : (
                            searchTerm && (
                                <div
                                    onClick={handleCreateOption}
                                    style={{
                                        padding: '8px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        color: 'hsl(var(--color-brand-primary))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Plus size={14} /> Create "{searchTerm}"
                                </div>
                            )
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div style={{
                        padding: '8px',
                        borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                        display: 'flex',
                        justifyContent: 'center'
                    }}>
                        <button
                            onClick={() => setIsEditingLabels(true)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'hsl(var(--color-text-secondary))',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <Edit2 size={12} /> Edit labels
                        </button>
                    </div>
                </>
            ) : (
                // Edit Labels View (Simplified Reuse)
                //
                // No wrapping div here on purpose: header/list/footer need to be
                // direct children of .dropdown-picker-menu (the maxHeight:300 +
                // overflow:hidden flex column above) for the list's flex:1 to
                // actually get a bounded height to scroll within. A `height:100%`
                // wrapper in between doesn't work — percentage heights don't
                // resolve against a max-height-only parent — so the list grew to
                // fit every option instead of scrolling, and .dropdown-picker-menu's
                // own overflow:hidden silently clipped whatever didn't fit,
                // "+ New label" and "Apply" included.
                <>
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button onClick={() => setIsEditingLabels(false)} className="icon-btn"><X size={14} /></button>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'hsl(var(--color-text-primary))' }}>Edit Labels</span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px' }}>
                        {options.map((opt, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <div
                                    onClick={(e) => { if (opt.id) openColorPicker(opt.id, e.currentTarget); }}
                                    title="Change color"
                                    style={{
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
                                >
                                    <PaintBucket size={12} />
                                </div>
                                <input
                                    ref={(el) => {
                                        if (!opt.id) return;
                                        if (el) labelInputs.current.set(opt.id, el);
                                        else labelInputs.current.delete(opt.id);
                                    }}
                                    type="text"
                                    value={opt.label}
                                    onChange={(e) => {
                                        if (opt.id) updateColumnOption(columnId, opt.id, { label: e.target.value });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === 'Escape') {
                                            e.stopPropagation();
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '4px 8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                                        backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                                        color: 'hsl(var(--color-text-primary))',
                                        fontSize: '13px',
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        if (opt.id) deleteColumnOption(columnId, opt.id);
                                    }}
                                    className="icon-btn danger"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: '0 8px 8px', flexShrink: 0 }}>
                        <button
                            onClick={handleAddLabel}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                width: '100%',
                                backgroundColor: 'hsl(var(--paper, transparent))',
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
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8px 12px', flexShrink: 0 }}>
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
                                width: `${PALETTE_WIDTH}px`
                            }}
                        >
                            {(() => {
                                const current = options.find(o => o.id === colorPicker.optionId);
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
                                            border: current?.color === c ? '2px solid hsl(var(--color-text-primary))' : '1px solid rgba(21, 42, 0, 0.12)'
                                        }}
                                    />
                                ));
                            })()}
                        </div>,
                        document.body
                    )}
                </>
            )}
        </div>,
        document.body
    );
};
