
import React, { memo, useState } from 'react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { Star } from 'lucide-react';

interface PriorityCellProps {
    itemId: string;
    column: Column;
    value: any;
}

const MAX_STARS = 5;
const STAR_COLOR = '#A76400'; // Ginger (Narai brand accent) — not Monday's #fdab3d

// Stored as a plain number 1-5. Anything else — never rated, cleared, or a
// value left behind by a column that used to be another type — reads as 0.
const toRating = (value: any): number => {
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(n)) return 0;
    return Math.min(MAX_STARS, Math.max(0, Math.round(n)));
};

export const PriorityCell: React.FC<PriorityCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const rating = toRating(value);
    const [hovered, setHovered] = useState(0);

    // Hovering previews the rating a click would set, so the count is readable
    // before committing to it.
    const shown = hovered || rating;

    const apply = (star: number) => {
        // Clicking the star that already holds the rating clears it. Without
        // this a 1-star row could never be put back to unrated.
        updateItemValue(itemId, column.id, star === rating ? null : star);
    };

    return (
        <div
            className="table-cell"
            onMouseLeave={() => setHovered(0)}
            title={rating ? `Priority ${rating} of ${MAX_STARS}` : 'Not prioritised'}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                padding: 0
            }}
        >
            {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map(star => {
                const filled = star <= shown;
                return (
                    <Star
                        key={star}
                        size={16}
                        onMouseEnter={() => setHovered(star)}
                        onClick={() => apply(star)}
                        color={filled ? STAR_COLOR : 'hsl(var(--color-text-tertiary))'}
                        fill={filled ? STAR_COLOR : 'none'}
                        style={{
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'color 0.1s ease, fill 0.1s ease'
                        }}
                    />
                );
            })}
        </div>
    );
});
