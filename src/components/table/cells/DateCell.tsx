
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { Calendar, X } from 'lucide-react';
import { DatePicker } from '../../ui/DatePicker';
import { columnJustify, defaultColumnAlign } from '../../../lib/utils';

interface DateCellProps {
    itemId: string;
    column: Column;
    value: any;
    isDueDate?: boolean;
}

// A due date counts as overdue once it's strictly before today (local time) —
// today itself still reads as "due today", not overdue yet.
const isOverdue = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return false;
    const [y, m, d] = parts.map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
};

export const DateCell: React.FC<DateCellProps> = memo(({ itemId, column, value, isDueDate }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);
    const overdue = isDueDate && value && isOverdue(value);

    const formatDate = (dateStr: string) => {
        if (!dateStr || dateStr === 'Invalid Date') return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;

        const [y, m, d] = parts.map(Number);
        const date = new Date(y, m - 1, d);
        
        if (isNaN(date.getTime())) return '';
        
        const today = new Date();
        const isCurrentYear = date.getFullYear() === today.getFullYear();

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: isCurrentYear ? undefined : 'numeric'
        });
    };

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                bottom: rect.bottom + 4
            });
            setIsEditing(true);
        }
    }, [can]);

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={startEditing}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: columnJustify(column.numberAlign, defaultColumnAlign(column.type)),
                    cursor: 'pointer',
                    color: overdue ? 'hsl(var(--color-danger))' : (value ? 'inherit' : 'hsl(var(--color-text-tertiary))'),
                    backgroundColor: isEditing ? 'hsl(var(--color-brand-light))' : 'transparent',
                    position: 'relative',
                    fontVariantNumeric: 'tabular-nums'
                }}
            >
                {value ? (
                    <>
                        <span style={{ fontWeight: overdue ? 600 : 400 }} title={overdue ? 'Overdue' : undefined}>{formatDate(value)}</span>
                        {isHovered && can('edit_items') && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateItemValue(itemId, column.id, null);
                                }}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '15px',
                                    height: '15px',
                                    borderRadius: '50%',
                                    backgroundColor: 'hsl(var(--color-text-primary) / 0.08)',
                                    color: 'hsl(var(--color-text-secondary))',
                                    cursor: 'pointer'
                                }}
                                title="Clear date"
                            >
                                <X size={10} strokeWidth={2.5} />
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Calendar size={16} strokeWidth={1.5} />
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <DatePicker
                    date={value ? new Date(value) : undefined}
                    position={pickerPos}
                    onSelect={(date) => {
                        if (date) {
                            const offset = date.getTimezoneOffset();
                            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                            const dateStr = localDate.toISOString().split('T')[0];
                            updateItemValue(itemId, column.id, dateStr);
                        } else {
                            updateItemValue(itemId, column.id, null);
                        }
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
