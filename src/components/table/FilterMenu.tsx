import React, { useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { tintLabel } from '../../lib/labelTint';

interface FilterOption {
    id: string; // The value to filter by
    label: string;
    color?: string; // For status/dropdown
}

interface FilterMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { top: number; left: number };
    options: FilterOption[];
    selectedValues: string[]; // Values currently filtered (if empty, usually means "All" or "None" depending on logic. Usually for us: Empty = No filter (All))
    onFilterChange: (values: string[]) => void;
    title?: string;
}

export const FilterMenu = ({
    isOpen,
    onClose,
    position,
    options,
    selectedValues,
    onFilterChange,
    title
}: FilterMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [search, setSearch] = React.useState('');

    // If selectedValues is empty, it usually implies NO FILTER (Show All).
    // So if we start picking, we trigger a filter.
    // However, our Store logic says: "If values is empty, remove filter".
    // So UI should reflect: If nothing checked? Or All checked?
    // Standard Excel: All checked by default. Uncheck one -> adds filter for the rest.
    // My Store Logic: `filters: [{ columnId, values }]`.
    // If filter exists, ONLY show these values.
    // If filter doesn't exist, show ALL.

    // UI State:
    // We need to manage the "checked" state of options.
    // If valid filter exists: checked = values.includes(opt.id).
    // If NO filter exists: ALL are checked.

    const isFiltered = selectedValues && selectedValues.length > 0;

    // If isFiltered is false, it means we show ALL.
    // So effective checked state for all options is TRUE.

    const toggleOption = (id: string) => {
        let newValues: string[] = [];
        if (!isFiltered) {
            // Currently "All" are effectively selected.
            // If we click one, we are deselecting it?
            // Actually usually "Select All" is active.
            // If I click one to Toggle OFF:
            // Then newValues = All options EXCEPT this one.
            newValues = options.map(o => o.id).filter(oid => oid !== id);
        } else {
            // We have a specific list.
            if (selectedValues.includes(id)) {
                // Remove it
                newValues = selectedValues.filter(v => v !== id);
            } else {
                // Add it
                newValues = [...selectedValues, id];
            }
        }

        // If newValues has ALL options, we should probably Clear the filter (optimization).
        if (newValues.length === options.length) {
            onFilterChange([]); // Clear filter
        } else {
            onFilterChange(newValues);
        }
    };

    const toggleSelectAll = () => {
        if (isFiltered) {
            // Currently filtered. Reset to ALL (Clear filter).
            onFilterChange([]);
        } else {
            // Currently ALL. Deselect All? (Empty filter usually means All, so we need a way to say NONE?)
            // If I select "None", then nothing shows?
            // Usually "Select All" checkbox toggles between All and None.
            // If I set values to [], it means All.
            // If I want None, I set values to ['__NO_MATCH__']?
            // Or just allow user to uncheck everything.
            // For now, let's assume Clear Filter = Select All.
            // If we want to Select None, we pass a dummy value that matches nothing.
            // Let's just Clear Filter.
            onFilterChange([]);
        }
    };

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

    const filteredOptions = useMemo(() => {
        if (!search) return options;
        return options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
    }, [options, search]);

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
                width: '260px',
                maxHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                color: 'hsl(var(--color-text-primary))',
                fontSize: '13.5px',
                overflow: 'hidden'
            }}
        >
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-row-line, hsl(var(--color-border)))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', fontWeight: 600 }}>Filter {title}</span>
                <button onClick={onClose} className="icon-btn" style={{ padding: 4 }}><X size={14} /></button>
            </div>

            <div style={{ padding: '8px' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 10px',
                    background: 'hsl(var(--paper, var(--color-bg-canvas)))',
                    borderRadius: '999px',
                    marginBottom: '8px',
                    border: '1px solid var(--paper-edge, hsl(var(--color-border)))'
                }}>
                    <Search size={13} style={{ color: 'hsl(var(--color-text-tertiary))', marginRight: '6px' }} />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            outline: 'none',
                            width: '100%',
                            fontSize: '12.5px',
                            color: 'hsl(var(--color-text-primary))'
                        }}
                    />
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <div
                        onClick={toggleSelectAll}
                        style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderRadius: '8px' }}
                        className="hover-bg"
                    >
                        <input
                            type="checkbox"
                            checked={!isFiltered}
                            readOnly
                            style={{ marginRight: '8px', accentColor: 'hsl(var(--color-brand-primary))' }}
                        />
                        <span style={{ fontWeight: 600 }}>Select All</span>
                    </div>

                    {filteredOptions.map(opt => {
                        const isChecked = !isFiltered || selectedValues.includes(opt.id);
                        return (
                            <div
                                key={opt.id}
                                onClick={() => toggleOption(opt.id)}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderRadius: '8px' }}
                                className="hover-bg"
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => { }} // handled by div click
                                    style={{ marginRight: '8px', cursor: 'pointer', accentColor: 'hsl(var(--color-brand-primary))' }}
                                />
                                {opt.color && (
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: tintLabel(opt.color), marginRight: 8 }} />
                                )}
                                <span>{opt.label}</span>
                            </div>
                        );
                    })}

                    {filteredOptions.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                            No options found
                        </div>
                    )}
                </div>
                <style>{`
                    .hover-bg:hover { background-color: hsl(var(--color-text-primary) / 0.06) !important; }
                `}</style>
            </div>
        </div>,
        document.body
    );
};
