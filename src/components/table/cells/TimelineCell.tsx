
import React, { useRef, useState, useCallback, memo } from 'react';
import { X } from 'lucide-react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { TimelinePicker } from '../TimelinePicker';

interface TimelineCellProps {
    itemId: string;
    column: Column;
    value: any;
    groupColor?: string;
}

export const TimelineCell: React.FC<TimelineCellProps> = memo(({ itemId, column, value, groupColor }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const formatRange = (v: any) => {
        if (!v || !v.from || !v.to) return null;
        const formatDate = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const today = new Date();
            const isCurrentYear = date.getFullYear() === today.getFullYear();
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: isCurrentYear ? undefined : 'numeric'
            });
        };
        return `${formatDate(v.from)} - ${formatDate(v.to)}`;
    };

    const countDays = (v: any) => {
        if (!v || !v.from || !v.to) return 0;
        const start = new Date(v.from);
        const end = new Date(v.to);
        return Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    };

    const displayValue = formatRange(value);
    const days = countDays(value);

    const barColor = groupColor || 'hsl(var(--color-brand-primary))';

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                bottom: rect.bottom
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0
                }}
            >
                {displayValue ? (
                    <div style={{
                        backgroundColor: barColor,
                        color: '#FFEFD2',
                        padding: '0 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '90%',
                        height: '22px',
                        minHeight: '22px',
                        maxHeight: '22px',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease',
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 1px 2px rgba(21, 42, 0, 0.16)'
                    }} title={`${displayValue} (${days} days)`}>
                        {isHovered ? (
                            <>
                                <span style={{ fontWeight: 700 }}>{days}d</span>
                                {can('edit_items') && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            updateItemValue(itemId, column.id, null);
                                        }}
                                        style={{
                                            position: 'absolute',
                                            right: '4px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '50%',
                                            backgroundColor: 'rgba(0,0,0,0.2)',
                                            cursor: 'pointer',
                                            zIndex: 2
                                        }}
                                        title="Clear timeline"
                                    >
                                        <X size={8} strokeWidth={3} />
                                    </div>
                                )}
                            </>
                        ) : (
                            <span style={{
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                                display: 'block'
                            }}>
                                {displayValue}
                            </span>
                        )}
                    </div>
                ) : (
                    <div style={{ color: 'hsl(var(--color-text-tertiary))', opacity: 0.5 }}>
                        -
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <TimelinePicker
                    itemId={itemId}
                    dateRange={value}
                    position={pickerPos}
                    onSelect={(range) => {
                        updateItemValue(itemId, column.id, range);
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
