import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { collectDownstream } from '../../lib/dependencyUtils';

interface DependenciesSectionProps {
    itemId: string;
    boardId: string;
    // Tighter padding and no trailing divider, for use inside a floating
    // popover (the Timeline bar's double-click popup) instead of TaskDetail's
    // full-width panel.
    compact?: boolean;
    // Shown at the end of the bar (the item's notification switch)
    trailing?: ReactNode;
}

/**
 * Finish-to-Start links for one item, as chips: what it waits on, and what it
 * blocks. The picker only ever offers items that can't close a loop, so a cycle
 * is impossible to pick rather than rejected after the fact.
 */
export const DependenciesSection = ({ itemId, boardId, compact = false, trailing }: DependenciesSectionProps) => {
    const board = useBoardStore(state => state.boards.find(b => b.id === boardId));
    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);
    const { can } = usePermission();
    const canEdit = can('edit_items');

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    const boardDeps = useMemo(
        () => itemDependencies.filter(d => d.boardId === boardId),
        [itemDependencies, boardId]
    );

    const predecessors = useMemo(
        () => boardDeps.filter(d => d.successorItemId === itemId),
        [boardDeps, itemId]
    );
    const successors = useMemo(
        () => boardDeps.filter(d => d.predecessorItemId === itemId),
        [boardDeps, itemId]
    );

    const candidates = useMemo(() => {
        if (!board) return [];
        // Anything downstream of this item would close a loop if it also became
        // an upstream of it.
        const downstream = collectDownstream(boardDeps, itemId);
        const existing = new Set(predecessors.map(d => d.predecessorItemId));
        const search = query.trim().toLowerCase();

        return board.items
            .filter(i =>
                i.id !== itemId &&
                !i.parentId &&           // sub-items never appear on the Timeline
                !downstream.has(i.id) &&
                !existing.has(i.id) &&
                (!search || (i.title || '').toLowerCase().includes(search))
            )
            .slice(0, 30);
    }, [board, boardDeps, predecessors, itemId, query]);

    useEffect(() => {
        if (!isPickerOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setIsPickerOpen(false);
                setQuery('');
                setError(null);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [isPickerOpen]);

    const titleOf = (id: string) => board?.items.find(i => i.id === id)?.title || 'Unknown item';

    const handlePick = async (predecessorId: string) => {
        setError(null);
        const result = await addItemDependency(predecessorId, itemId);
        if (!result.success) {
            setError(result.error || 'Could not add that dependency');
            return;
        }
        setIsPickerOpen(false);
        setQuery('');
    };

    if (predecessors.length === 0 && successors.length === 0 && !canEdit) return null;

    const chipStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '999px',
        background: 'var(--glass-chip, hsl(var(--color-bg-subtle)))',
        border: '1px solid var(--glass-chip-edge, hsl(var(--color-border)))',
        boxShadow: 'var(--glass-chip-shadow, none)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'hsl(var(--color-text-primary))',
        maxWidth: '220px'
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '10.5px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'hsl(var(--color-text-tertiary))',
        flexShrink: 0
    };

    const truncate: React.CSSProperties = {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    };

    return (
        <div style={{
            padding: compact ? '0' : '10px 28px',
            borderBottom: compact ? 'none' : '1px solid var(--paper-row-line, hsl(var(--color-border)))',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px'
        }}>
            <span style={labelStyle}>Waiting on</span>

            {predecessors.length === 0 && (
                <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>Nothing</span>
            )}

            {predecessors.map(dep => (
                <span key={dep.id} style={chipStyle}>
                    <span style={truncate} title={titleOf(dep.predecessorItemId)}>
                        {titleOf(dep.predecessorItemId)}
                    </span>
                    {canEdit && (
                        <button
                            onClick={() => removeItemDependency(dep.id)}
                            title="Remove dependency"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'hsl(var(--color-text-tertiary))' }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </span>
            ))}

            {canEdit && (
                <div style={{ position: 'relative' }} ref={pickerRef}>
                    <button
                        onClick={() => setIsPickerOpen(open => !open)}
                        className="glass-chip"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            border: '1px dashed hsl(var(--color-border-strong, var(--color-border)))',
                            background: 'var(--glass-chip, transparent)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'hsl(var(--color-text-secondary))',
                            transition: 'background-color 0.15s, color 0.15s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--glass-chip-hover, hsl(var(--color-bg-hover)))';
                            e.currentTarget.style.color = 'hsl(var(--color-text-primary))';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--glass-chip, transparent)';
                            e.currentTarget.style.color = 'hsl(var(--color-text-secondary))';
                        }}
                    >
                        <Plus size={12} />
                        Add predecessor
                    </button>

                    {isPickerOpen && (
                        <div className="glass-pop" style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            width: '280px',
                            backgroundColor: 'hsl(var(--color-bg-surface))',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '14px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            zIndex: 50,
                            overflow: 'hidden'
                        }}>
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search items on this board…"
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    border: 'none',
                                    borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))',
                                    background: 'transparent',
                                    color: 'hsl(var(--color-text-primary))',
                                    outline: 'none',
                                    fontSize: '13px',
                                    boxSizing: 'border-box'
                                }}
                            />

                            {error && (
                                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'hsl(var(--color-danger))', backgroundColor: 'hsl(var(--color-danger-bg))' }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {candidates.length === 0 ? (
                                    <div style={{ padding: '12px 10px', fontSize: '12px', color: 'hsl(var(--color-text-tertiary))' }}>
                                        No eligible items
                                    </div>
                                ) : candidates.map(candidate => (
                                    <button
                                        key={candidate.id}
                                        onClick={() => handlePick(candidate.id)}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '8px 10px',
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            color: 'hsl(var(--color-text-primary))',
                                            ...truncate
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
            )}

            {successors.length > 0 && (
                <>
                    <ArrowRight size={14} style={{ color: 'hsl(var(--color-text-tertiary))', flexShrink: 0 }} />
                    <span style={labelStyle}>Blocks</span>
                    {successors.map(dep => (
                        <span key={dep.id} style={{ ...chipStyle, backgroundColor: 'transparent' }}>
                            <span style={truncate} title={titleOf(dep.successorItemId)}>
                                {titleOf(dep.successorItemId)}
                            </span>
                        </span>
                    ))}
                </>
            )}

            {trailing}
        </div>
    );
};
