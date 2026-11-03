
import React, { memo } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { Check } from 'lucide-react';

interface CheckboxCellProps {
    itemId: string;
    column: Column;
    value: any;
}

export const CheckboxCell: React.FC<CheckboxCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const isChecked = value === true;

    return (
        <div
            className="table-cell"
            onClick={() => updateItemValue(itemId, column.id, !isChecked)}
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
            <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '5px',
                border: '1.5px solid ' + (isChecked ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-border-strong))'),
                backgroundColor: isChecked ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--paper, transparent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s ease',
                boxShadow: isChecked ? '0 1px 2px rgba(21, 42, 0, 0.18)' : 'none'
            }}>
                {isChecked && <Check size={13} color="#FFEFD2" strokeWidth={3} />}
            </div>
        </div>
    );
});
