
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { StatusPicker } from '../StatusPicker';
import { tintLabel, LABEL_TEXT } from '../../../lib/labelTint';

interface StatusCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const StatusCell: React.FC<StatusCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;

        setIsEditing(true);
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    }, [can]);

    const options = Array.isArray(column.options) ? column.options : [];
    const statusOption = options.find(opt => opt.id === value || opt.label === value);
    
    // Hybrid logic: If no status option matches and we has a value, 
    // treat it as plain text (e.g. for Date in hybrid column)
    const isHybridValue = !statusOption && value;
    
    const content = statusOption ? (statusOption.label === 'Default' ? '' : statusOption.label) : (value || '');

    // Status reads as a compact pill badge, not a block filling the whole cell —
    // the brand's own badge component (narai-design-system.vercel.app/components)
    // is a small rounded tag with tracked uppercase text, not a full-bleed colour
    // fill (that full-bleed pattern is Monday's own signature status-cell look).
    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                {content && !isHybridValue && (
                    <span style={{
                        backgroundColor: tintLabel(statusOption?.color || '#c4c4c4'),
                        color: LABEL_TEXT,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%'
                    }}>
                        {content}
                    </span>
                )}
                {isHybridValue && (
                    <span style={{
                        color: 'hsl(var(--color-text-primary))',
                        fontSize: '13px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {content}
                    </span>
                )}
            </div>

            {isEditing && pickerPos && (
                <StatusPicker
                    columnId={column.id}
                    options={column.options || []}
                    currentValue={value}
                    position={pickerPos}
                    onSelect={(label) => {
                        updateItemValue(itemId, column.id, label);
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                    onClose={() => {
                        setIsEditing(false);
                        setPickerPos(null);
                    }}
                />
            )}
        </>
    );
});
