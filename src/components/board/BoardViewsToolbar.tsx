import React, { useState, useRef } from 'react';
import { itemColumns } from '../../lib/columnScope';
import { Search, Filter, ArrowUpDown, LayoutPanelLeft, ChevronDown, LayoutGrid, Eye, EyeOff, Link2, Plus, Rows3, Rows4 } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useThemeStore } from '../../store/useThemeStore';
import { createPortal } from 'react-dom';
import { LinkGroupModal } from './LinkGroupModal';
import { BoardViewsTabs } from './BoardViewsTabs';
import { tintLabel, LABEL_TEXT } from '../../lib/labelTint';

export const BoardViewsToolbar = () => {
    const addItem = useBoardStore(state => state.addItem);
    const addGroup = useBoardStore(state => state.addGroup);
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const firstGroupId = useBoardStore(state => state.boards.find(b => b.id === state.activeBoardId)?.groups[0]?.id);
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);
    
    const [showDropdown, setShowDropdown] = useState(false);
    const [showLinkGroupModal, setShowLinkGroupModal] = useState(false);
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);

    const dropdownBtnRef = useRef<HTMLButtonElement>(null);
    const sortBtnRef = useRef<HTMLButtonElement>(null);
    const filterBtnRef = useRef<HTMLButtonElement>(null);
    const groupByBtnRef = useRef<HTMLButtonElement>(null);

    const handleAddItem = () => {
        if (activeBoardId && firstGroupId) {
            addItem("New Item", firstGroupId);
        }
    };

    const handleAddGroup = () => {
        if (activeBoardId) {
            addGroup("Group Title");
            setShowDropdown(false);
        }
    };

    const handleOpenLinkGroup = () => {
        setShowDropdown(false);
        setShowLinkGroupModal(true);
    };

    const toggleFilter = (columnId: string, val: string) => {
        if (!activeBoardId) return;
        const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
        if (!board) return;
        const currentFilters = [...(board.filters || [])];
        const existingFilterIdx = currentFilters.findIndex(f => f.columnId === columnId);

        if (existingFilterIdx !== -1) {
            const values = [...currentFilters[existingFilterIdx].values];
            if (values.includes(val)) {
                currentFilters[existingFilterIdx].values = values.filter(v => v !== val);
                if (currentFilters[existingFilterIdx].values.length === 0) {
                    currentFilters.splice(existingFilterIdx, 1);
                }
            } else {
                currentFilters[existingFilterIdx].values.push(val);
            }
        } else {
            currentFilters.push({ columnId, values: [val] });
        }
        useBoardStore.getState().setBoardFilters(activeBoardId, currentFilters);
    };

    const searchQuery = useBoardStore(state => state.searchQuery);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);
    const density = useThemeStore(state => state.density);
    const toggleDensity = useThemeStore(state => state.toggleDensity);
    const activeFilterCount = useBoardStore(state =>
        (state.boards.find(b => b.id === state.activeBoardId)?.filters || []).reduce((n, f) => n + f.values.length, 0)
    );
    const hasSort = useBoardStore(state => !!state.boards.find(b => b.id === state.activeBoardId)?.sort);
    const hasGroupBy = useBoardStore(state => !!state.boards.find(b => b.id === state.activeBoardId)?.groupByColumnId);

    // Menus open below their trigger, right-aligned when the trigger sits in
    // the right half of the screen so they never run off the edge.
    const menuPosition = (el: HTMLElement, width: number): React.CSSProperties => {
        const r = el.getBoundingClientRect();
        const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
        return { position: 'fixed', top: r.bottom + 8, left };
    };

    return (
        <>
        <div className="cmd-bar">
            <BoardViewsTabs />

            <div className="cmd-spacer" />

            <label className="cmd-search glass-chip">
                <Search size={15} />
                <input
                    type="text"
                    placeholder="Search this board"
                    aria-label="Search this board"
                    value={searchQuery}
                    onChange={(e) => useBoardStore.getState().setSearchQuery(e.target.value)}
                />
            </label>

            <div className="cmd-tools glass-chip">
                <button
                    ref={filterBtnRef}
                    className={`cmd-tool${showFilterDropdown || activeFilterCount ? ' is-on' : ''}`}
                    onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                    title="Filter items"
                >
                    <Filter size={15} />
                    Filter
                    {activeFilterCount > 0 && <span className="cmd-tool-count">{activeFilterCount}</span>}
                </button>
                <button
                    ref={sortBtnRef}
                    className={`cmd-tool${showSortDropdown || hasSort ? ' is-on' : ''}`}
                    onClick={() => setShowSortDropdown(!showSortDropdown)}
                    title="Sort items"
                >
                    <ArrowUpDown size={15} />
                    Sort
                </button>
                <button
                    ref={groupByBtnRef}
                    className={`cmd-tool${showGroupByDropdown || hasGroupBy ? ' is-on' : ''}`}
                    onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
                    title="Group items by a column"
                >
                    <LayoutPanelLeft size={15} />
                    Group
                </button>
                <button
                    className={`cmd-tool${showHiddenItems ? ' is-on' : ''}`}
                    onClick={() => useBoardStore.getState().toggleShowHiddenItems()}
                    title={showHiddenItems ? 'Hidden items are shown — click to hide them' : 'Show hidden items'}
                >
                    {showHiddenItems ? <Eye size={15} /> : <EyeOff size={15} />}
                    Hidden
                </button>
                <button
                    className={`cmd-tool${density === 'compact' ? ' is-on' : ''}`}
                    onClick={toggleDensity}
                    title={density === 'compact' ? 'Compact density is active — click for Normal' : 'Switch to Compact density'}
                >
                    {density === 'compact' ? <Rows4 size={15} /> : <Rows3 size={15} />}
                    {density === 'compact' ? 'Compact' : 'Normal'}
                </button>
            </div>

            <div className="cmd-add">
                <button onClick={handleAddItem}>
                    <Plus size={16} strokeWidth={2.4} />
                    Add item
                </button>
                <button
                    ref={dropdownBtnRef}
                    className="cmd-add-more"
                    onClick={() => setShowDropdown(!showDropdown)}
                    aria-label="More ways to add"
                    title="More ways to add"
                >
                    <ChevronDown size={16} />
                </button>
            </div>

            {showDropdown && dropdownBtnRef.current && createPortal(
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                        onClick={() => setShowDropdown(false)}
                    />
                    <div className="glass-pop" style={{
                        ...menuPosition(dropdownBtnRef.current, 240),
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 9999,
                        width: '240px'
                    }}>
                        <button className="menu-item" onClick={handleAddGroup}>
                            <LayoutGrid size={15} />
                            New group
                        </button>
                        <button className="menu-item" onClick={handleOpenLinkGroup}>
                            <Link2 size={15} />
                            Link to a group on another board
                        </button>
                    </div>
                </>,
                document.body
            )}

                {showFilterDropdown && filterBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                            onClick={() => setShowFilterDropdown(false)}
                        />
                        <div className="glass-pop" style={{
                            ...menuPosition(filterBtnRef.current, 300),
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 9999,
                            width: '300px',
                            gap: '12px'
                        }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>Filter by</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                                {/* Group Filters */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 500 }}>Group</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.groups.map(group => {
                                            const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                            const currentFilters = board?.filters || [];
                                            const isActive = currentFilters.some(f => f.columnId === '__group__' && f.values.includes(group.id));
                                            
                                            return (
                                                <button
                                                    key={group.id}
                                                    onClick={() => toggleFilter('__group__', group.id)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '999px',
                                                        fontSize: '11px',
                                                        border: 'none',
                                                        backgroundColor: isActive ? group.color : 'hsl(var(--color-bg-subtle))',
                                                        color: isActive ? LABEL_TEXT : 'hsl(var(--color-text-secondary))',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.1s'
                                                    }}
                                                >
                                                    {group.title}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {/* Column Filters */}
                                {itemColumns(useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns || []).filter(c => ['status', 'dropdown', 'people'].includes(c.type)).map(col => (
                                    <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{col.title}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {col.type === 'people' ? (
                                                activeBoardMembers.map(member => {
                                                    const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                                    const currentFilters = board?.filters || [];
                                                    const val = member.user_id;
                                                    const isActive = currentFilters.some(f => f.columnId === col.id && f.values.includes(val));
                                                    const profileData = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
                                                    const profile = profileData || {};
                                                    const name = profile.full_name || profile.email || 'Unknown';

                                                    return (
                                                        <button
                                                            key={val}
                                                            onClick={() => toggleFilter(col.id, val)}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '999px',
                                                                fontSize: '11px',
                                                                border: 'none',
                                                                backgroundColor: isActive ? 'hsl(var(--color-brand-primary))' : 'hsl(var(--color-bg-subtle))',
                                                                color: isActive ? LABEL_TEXT : 'hsl(var(--color-text-secondary))',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.1s'
                                                            }}
                                                        >
                                                            {name}
                                                        </button>
                                                    );
                                                })
                                            ) : (col.options || []).map(opt => {
                                                const board = useBoardStore.getState().boards.find(b => b.id === activeBoardId);
                                                const currentFilters = board?.filters || [];
                                                const val = opt.id || opt.label;
                                                const isActive = currentFilters.some(f => f.columnId === col.id && f.values.includes(val));

                                                return (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => toggleFilter(col.id, val)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '999px',
                                                            fontSize: '11px',
                                                            border: 'none',
                                                            backgroundColor: isActive ? tintLabel(opt.color) : 'hsl(var(--color-bg-subtle))',
                                                            color: isActive ? LABEL_TEXT : 'hsl(var(--color-text-secondary))',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.1s'
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                className="menu-item"
                                onClick={() => activeBoardId && useBoardStore.getState().setBoardFilters(activeBoardId, [])}
                                style={{ color: 'hsl(var(--color-text-secondary))', padding: '6px 4px', fontSize: '12.5px' }}
                            >
                                Clear all filters
                            </button>
                        </div>
                    </>,
                    document.body
                )}

                {showSortDropdown && sortBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                            onClick={() => setShowSortDropdown(false)}
                        />
                        <div className="glass-pop" style={{
                            ...menuPosition(sortBtnRef.current, 220),
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 9999,
                            width: '220px'
                        }}>
                            <div className="menu-label">Sort by</div>
                            <button
                                className="menu-item"
                                onClick={() => {
                                    useBoardStore.getState().setSort(activeBoardId, null);
                                    setShowSortDropdown(false);
                                }}
                            >
                                No sorting
                            </button>
                            {itemColumns(useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns || []).map(col => {
                                const currentSort = useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.sort;
                                return (
                                    <button
                                        key={col.id}
                                        className="menu-item"
                                        onClick={() => {
                                            const nextDirection = (currentSort?.columnId === col.id && currentSort.direction === 'asc') ? 'desc' : 'asc';
                                            useBoardStore.getState().setSort(activeBoardId, { columnId: col.id, direction: nextDirection });
                                            setShowSortDropdown(false);
                                        }}
                                    >
                                        {col.title}
                                        {currentSort?.columnId === col.id && (
                                            <span style={{ fontSize: '10px', marginLeft: 'auto', letterSpacing: '0.1em', color: 'hsl(var(--color-text-tertiary))' }}>
                                                {currentSort.direction === 'asc' ? 'A → Z' : 'Z → A'}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </>,
                    document.body
                )}

                {showGroupByDropdown && groupByBtnRef.current && activeBoardId && createPortal(
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                            onClick={() => setShowGroupByDropdown(false)}
                        />
                        <div className="glass-pop" style={{
                            ...menuPosition(groupByBtnRef.current, 220),
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 9999,
                            width: '220px'
                        }}>
                            <div className="menu-label">Group by</div>
                            <button
                                className="menu-item"
                                onClick={() => {
                                    useBoardStore.getState().setBoardGroupBy(activeBoardId, null);
                                    setShowGroupByDropdown(false);
                                }}
                            >
                                Board groups (default)
                            </button>
                            {itemColumns(useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.columns || []).filter(c => ['status', 'dropdown', 'people'].includes(c.type)).map(col => (
                                <button
                                    key={col.id}
                                    className="menu-item"
                                    onClick={() => {
                                        useBoardStore.getState().setBoardGroupBy(activeBoardId, col.id);
                                        setShowGroupByDropdown(false);
                                    }}
                                >
                                    {col.title}
                                    {useBoardStore.getState().boards.find(b => b.id === activeBoardId)?.groupByColumnId === col.id && (
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', marginLeft: 'auto', background: 'hsl(var(--color-brand-primary))' }} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </>,
                    document.body
                )}
        </div>
        {showLinkGroupModal && (
            <LinkGroupModal onClose={() => setShowLinkGroupModal(false)} />
        )}
        </>
    );
};
