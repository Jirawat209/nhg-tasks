import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { wouldCreateCycle, resolveEndDate, resolveStartDate } from '../../lib/dependencyUtils';
import type { DependencyType } from '../../types';

interface DependencyLinkSectionProps {
    itemId: string;
    type: DependencyType;
    label: string;
    hint: string;
    // The edge date this item is about to be saved with, "YYYY-MM-DD": its end
    // for Finish to Finish, its start for Start to Start. Those two only link
    // items already sharing that date, and this is the day they match against —
    // taken from the popup's own From/To field rather than the stored value, so
    // the list agrees with what the user is looking at while still editing.
    // Unused by Finish to Start, which has no such restriction.
    matchDate?: string | null;
}

/**
 * One dependency type's outgoing links for an item, as removable chips plus a
 * picker. Rendered once per type in the Timeline date popup, so Finish-to-Start
 * and Finish-to-Finish stay identical to use and only differ in what they mean.
 *
 * A pair of items can only be linked once in one direction (the table's unique
 * edge constraint ignores type), so the picker hides anything this item already
 * points at under *either* type rather than offering a pick that would be
 * rejected on insert.
 */
export const DependencyLinkSection = ({ itemId, type, label, hint, matchDate }: DependencyLinkSectionProps) => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const board = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);

    const [isAdding, setIsAdding] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    // FS is the one type that links items whatever their dates; the other two
    // line an edge up, so they only offer items already on that date.
    const needsDateMatch = type === 'FF' || type === 'SS';
    const edgeWord = type === 'SS' ? 'start' : 'end';
    const resolveEdgeDate = type === 'SS' ? resolveStartDate : resolveEndDate;

    const boardDeps = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId),
        [itemDependencies, activeBoardId]
    );
    const outgoing = useMemo(
        () => boardDeps.filter(d => d.predecessorItemId === itemId && d.type === type),
        [boardDeps, itemId, type]
    );
    const candidates = useMemo(() => {
        if (!board) return [];
        // FF means the two end together and SS that they start together, so
        // either can only be pointed at something already sharing that date.
        // Without a date of its own there is nothing to line up with, hence no
        // candidates at all.
        if (needsDateMatch && !matchDate) return [];

        const alreadyLinked = new Set(
            boardDeps.filter(d => d.predecessorItemId === itemId).map(d => d.successorItemId)
        );
        const q = query.trim().toLowerCase();
        return board.items
            .filter(i =>
                i.id !== itemId &&
                !i.parentId &&
                !alreadyLinked.has(i.id) &&
                !wouldCreateCycle(boardDeps, itemId, i.id) &&
                (!needsDateMatch || resolveEdgeDate(board.columns, i) === matchDate) &&
                (!q || (i.title || '').toLowerCase().includes(q))
            )
            .slice(0, 30);
    }, [board, boardDeps, itemId, query, needsDateMatch, resolveEdgeDate, matchDate]);

    useEffect(() => {
        if (!isAdding) return;
        const onClickOutside = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
                setIsAdding(false);
                setQuery('');
                setError(null);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [isAdding]);

    const handlePick = async (successorId: string) => {
        setError(null);
        const result = await addItemDependency(itemId, successorId, type);
        if (!result.success) {
            setError(result.error || 'Could not link these items');
            return;
        }
        setIsAdding(false);
        setQuery('');
    };

    return (
        <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid hsl(var(--color-border))'
        }}>
            <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'hsl(var(--color-text-secondary))',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '8px'
            }}>
                {label}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {outgoing.map(dep => {
                    const successorItem = board?.items.find(i => i.id === dep.successorItemId);
                    return (
                        <span
                            key={dep.id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'hsl(var(--color-bg-subtle))',
                                border: '1px solid hsl(var(--color-border))',
                                fontSize: '12px',
                                maxWidth: '150px'
                            }}
                        >
                            <ArrowRight size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-text-tertiary))' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={successorItem?.title}>
                                {successorItem?.title || 'Unknown item'}
                            </span>
                            <button
                                onClick={() => removeItemDependency(dep.id)}
                                title="Remove dependency"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'hsl(var(--color-text-tertiary))' }}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    );
                })}

                <div style={{ position: 'relative' }} ref={boxRef}>
                    <button
                        onClick={() => setIsAdding(open => !open)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            border: '1px dashed hsl(var(--color-border))',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: 'hsl(var(--color-text-secondary))'
                        }}
                    >
                        <Plus size={11} />
                        Add item
                    </button>

                    {isAdding && (
                        <div
                            className="glass-pop"
                            style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 6px)',
                                left: 0,
                                width: '240px',
                                borderRadius: '14px',
                                zIndex: 10,
                                overflow: 'hidden'
                            }}
                        >
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search items on this board…"
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    border: 'none',
                                    borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                                    backgroundColor: 'hsl(var(--paper, transparent))',
                                    color: 'hsl(var(--color-text-primary))',
                                    outline: 'none',
                                    fontSize: '12px',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit'
                                }}
                            />

                            {error && (
                                <div style={{ padding: '6px 10px', fontSize: '11px', color: '#b91c1c', backgroundColor: '#fef2f2' }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                {candidates.length === 0 ? (
                                    <div style={{ padding: '10px', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', lineHeight: 1.5 }}>
                                        {!needsDateMatch
                                            ? 'No eligible items'
                                            : !matchDate
                                                ? `Give this item ${edgeWord === 'end' ? 'an end' : 'a start'} date first — ${label} links items that ${edgeWord} on the same day.`
                                                : `No other item ${edgeWord}s on ${matchDate}.`}
                                    </div>
                                ) : candidates.map(candidate => (
                                    <button
                                        key={candidate.id}
                                        onClick={() => handlePick(candidate.id)}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '7px 10px',
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            color: 'hsl(var(--color-text-primary))',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {candidate.title || 'Untitled'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <p style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', margin: '6px 0 0' }}>
                {hint}
            </p>
        </div>
    );
};
