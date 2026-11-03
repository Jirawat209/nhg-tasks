
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { columnJustify, defaultColumnAlign } from '../../../lib/utils';
import { DropdownPicker } from '../DropdownPicker';
import { tintLabel, LABEL_TEXT } from '../../../lib/labelTint';

interface DropdownCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const DropdownCell: React.FC<DropdownCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const selectedLabels = Array.isArray(value) ? value : (value ? [value] : []);

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

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={() => !isEditing && startEditing()}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    flexWrap: 'nowrap',
                    // An empty cell has no value to align, so the "+" affordance is always
                    // centered — the same way Person's is — regardless of the column's own
                    // left/right alignment setting. That setting only takes effect once
                    // there are labels to actually align.
                    justifyContent: selectedLabels.length > 0
                        ? columnJustify(column.numberAlign, defaultColumnAlign(column.type))
                        : 'center'
                }}
            >
                {selectedLabels.length > 0 ? (
                    selectedLabels.map((label: string, idx: number) => {
                        const options = Array.isArray(column.options) ? column.options : [];
                        const opt = options.find(o => o.label === label);
                        return (
                            <div key={idx} style={{
                                backgroundColor: tintLabel(opt?.color || '#a0c4ff'),
                                color: LABEL_TEXT,
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                whiteSpace: 'nowrap'
                            }}>
                                {label}
                            </div>
                        );
                    })
                ) : (
                    // Same size/weight/dimness as Person's empty-state "+", so the two
                    // columns' placeholders read as one consistent affordance.
                    <span style={{ color: 'hsl(var(--color-text-tertiary))', fontSize: '18px', opacity: 0.5 }}>+</span>
                )}
            </div>

            {isEditing && pickerPos && (
                <DropdownPicker
                    columnId={column.id}
                    options={column.options || []}
                    currentValue={selectedLabels}
                    position={pickerPos}
                    onSelect={(newValues) => {
                        updateItemValue(itemId, column.id, newValues);
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
