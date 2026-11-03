import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { Column } from '../../types';
import { CURRENCY_OPTIONS } from '../../utils/format';
import { defaultColumnAlign } from '../../lib/utils';

interface NumberFormatMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { top: number; left: number };
    column: Column;
    onSetFormat: (format: 'number' | 'percent' | 'currency', currencyCode?: string) => void;
    onSetAlign: (align: 'left' | 'center' | 'right') => void;
}

// Also serves Dropdown, Text and Date columns, which get the Alignment section
// alone — Number/Percent/Currency mean nothing for a tag list, a sentence or a
// date — sharing the same numberAlign field and menu chrome as Number columns.
// Exported so the column menu's entry and this popover's title can't drift, and
// so which types offer a Format entry at all is decided in one place.
export const COLUMN_FORMAT_TITLES: Record<string, string> = {
    number: 'Number Format',
    dropdown: 'Dropdown Format',
    text: 'Text Format',
    long_text: 'Text Format',
    date: 'Date Format',
    due_date: 'Date Format'
};

export const NumberFormatMenu = ({
    isOpen,
    onClose,
    position,
    column,
    onSetFormat,
    onSetAlign
}: NumberFormatMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const isNumber = column.type === 'number';
    const currentFormat = column.numberFormat || 'number';
    const currentAlign = column.numberAlign || defaultColumnAlign(column.type);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={menuRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                borderRadius: '16px',
                zIndex: 9999,
                width: '220px',
                maxHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                color: 'hsl(var(--color-text-primary))',
                fontSize: '13.5px',
                overflow: 'hidden'
            }}
        >
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', fontWeight: 600 }}>{COLUMN_FORMAT_TITLES[column.type] || 'Column Format'}</span>
                <button onClick={onClose} className="icon-btn" style={{ padding: 4 }}><X size={14} /></button>
            </div>

            <div style={{ padding: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {isNumber && (
                    <>
                        <div
                            onClick={() => { onSetFormat('number'); onClose(); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '8px' }}
                            className="hover-bg"
                        >
                            <span>Number</span>
                            {currentFormat === 'number' && <Check size={14} style={{ color: 'hsl(var(--color-brand-primary))' }} />}
                        </div>
                        <div
                            onClick={() => { onSetFormat('percent'); onClose(); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '8px' }}
                            className="hover-bg"
                        >
                            <span>Percent (%)</span>
                            {currentFormat === 'percent' && <Check size={14} style={{ color: 'hsl(var(--color-brand-primary))' }} />}
                        </div>

                        <div style={{ borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', margin: '6px 0' }} />
                    </>
                )}
                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>
                    Alignment
                </div>
                <div style={{ display: 'flex', gap: '4px', padding: '2px 8px 6px' }}>
                    {([
                        { value: 'left' as const, icon: AlignLeft, label: 'Left' },
                        { value: 'center' as const, icon: AlignCenter, label: 'Center' },
                        { value: 'right' as const, icon: AlignRight, label: 'Right' }
                    ]).map(({ value, icon: Icon, label }) => (
                        <button
                            key={value}
                            onClick={() => onSetAlign(value)}
                            title={label}
                            className="hover-bg"
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                border: currentAlign === value ? '1px solid hsl(var(--color-brand-primary))' : '1px solid transparent',
                                backgroundColor: currentAlign === value ? 'hsl(var(--color-brand-primary) / 0.1)' : 'transparent',
                                color: currentAlign === value ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-text-secondary))'
                            }}
                        >
                            <Icon size={15} />
                        </button>
                    ))}
                </div>

                {isNumber && (
                    <>
                        <div style={{ borderTop: '1px solid var(--paper-row-line, hsl(var(--color-border)))', margin: '6px 0' }} />
                        <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>
                            Currency
                        </div>
                        {CURRENCY_OPTIONS.map(opt => (
                            <div
                                key={opt.code}
                                onClick={() => { onSetFormat('currency', opt.code); onClose(); }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', cursor: 'pointer', borderRadius: '8px' }}
                                className="hover-bg"
                            >
                                <span>{opt.symbol} {opt.code} - {opt.label}</span>
                                {currentFormat === 'currency' && column.currencyCode === opt.code && <Check size={14} style={{ color: 'hsl(var(--color-brand-primary))' }} />}
                            </div>
                        ))}
                    </>
                )}
                <style>{`
                    .hover-bg:hover { background-color: hsl(var(--color-text-primary) / 0.06) !important; }
                `}</style>
            </div>
        </div>,
        document.body
    );
};
