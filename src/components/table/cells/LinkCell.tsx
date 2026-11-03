import React, { useEffect, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Trash2 } from 'lucide-react';
import type { Column } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { parseLinkValue, buildLinkValue, linkHref } from '../../../lib/utils';

interface LinkCellProps {
    itemId: string;
    column: Column;
    value: any;
}

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 210;

export const LinkCell: React.FC<LinkCellProps> = memo(({ itemId, column, value }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const { url, label } = parseLinkValue(value);

    const [editorPos, setEditorPos] = useState<{ top: number; left: number } | null>(null);
    const [draftUrl, setDraftUrl] = useState(url);
    const [draftLabel, setDraftLabel] = useState(label);

    const cellRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const firstInputRef = useRef<HTMLInputElement>(null);

    // Reset the draft whenever the stored value changes underneath us (realtime,
    // another tab), so reopening never shows a stale edit.
    useEffect(() => {
        setDraftUrl(url);
        setDraftLabel(label);
    }, [url, label]);

    useEffect(() => {
        if (!editorPos) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setEditorPos(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [editorPos]);

    useEffect(() => {
        if (editorPos) firstInputRef.current?.focus();
    }, [editorPos]);

    const openEditor = () => {
        if (!can('edit_items') || !cellRef.current) return;
        const rect = cellRef.current.getBoundingClientRect();
        // Flip above when there's no room below, and stay clear of the right edge.
        const top = rect.bottom + POPOVER_HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - POPOVER_HEIGHT - 4)
            : rect.bottom + 4;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
        setDraftUrl(url);
        setDraftLabel(label);
        setEditorPos({ top, left });
    };

    const commit = () => {
        const next = buildLinkValue(draftUrl, draftLabel);
        const current = buildLinkValue(url, label);
        if (JSON.stringify(next) !== JSON.stringify(current)) {
            updateItemValue(itemId, column.id, next);
        }
        setEditorPos(null);
    };

    const clear = () => {
        updateItemValue(itemId, column.id, null);
        setEditorPos(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        }
        if (e.key === 'Escape') {
            e.stopPropagation();
            setEditorPos(null);
        }
    };

    const displayText = label || url;

    return (
        <>
            <div
                ref={cellRef}
                className="table-cell"
                onClick={openEditor}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: can('edit_items') ? 'pointer' : 'default'
                }}
            >
                {displayText ? (
                    <a
                        href={linkHref(url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        // The cell itself opens the editor, so the anchor has to keep
                        // its click to itself or following a link would also pop it open.
                        onClick={(e) => e.stopPropagation()}
                        title={label ? `${label} — ${url}` : url}
                        style={{
                            color: 'hsl(var(--color-brand-primary))',
                            textDecoration: 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                    >
                        {displayText}
                    </a>
                ) : (
                    <div style={{ color: 'hsl(var(--color-text-tertiary))', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Link2 size={16} />
                    </div>
                )}
            </div>

            {editorPos && createPortal(
                <div
                    ref={popoverRef}
                    className="glass-pop"
                    style={{
                        position: 'fixed',
                        top: editorPos.top,
                        left: editorPos.left,
                        width: `${POPOVER_WIDTH}px`,
                        borderRadius: '14px',
                        zIndex: 9999,
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}
                >
                    {/* Link first: it's the required half, and the one you paste in
                        before deciding what to call it. */}
                    <div>
                        <label style={fieldLabelStyle}>Link</label>
                        <input
                            ref={firstInputRef}
                            type="text"
                            value={draftUrl}
                            onChange={(e) => setDraftUrl(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Paste link here..."
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={fieldLabelStyle}>Text to display</label>
                        <input
                            type="text"
                            value={draftLabel}
                            onChange={(e) => setDraftLabel(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Optional — shown instead of the link"
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                        {url || label ? (
                            <button
                                onClick={clear}
                                title="Remove link"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'hsl(var(--color-danger))',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    padding: '4px'
                                }}
                            >
                                <Trash2 size={13} /> Remove
                            </button>
                        ) : <span />}

                        <button
                            onClick={commit}
                            style={{
                                backgroundColor: 'hsl(var(--color-brand-primary))',
                                border: 'none',
                                borderRadius: '999px',
                                color: '#FFEFD2',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                padding: '6px 18px',
                                cursor: 'pointer'
                            }}
                        >
                            Apply
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
});

const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    color: 'hsl(var(--color-text-tertiary))',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: '4px'
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
    backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
    color: 'hsl(var(--color-text-primary))',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box'
};
