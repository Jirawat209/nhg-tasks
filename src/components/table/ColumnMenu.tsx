import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Filter,
    ArrowUpDown,
    Copy,
    ArrowRightFromLine,
    PenLine,
    Trash2,
    Check,
    Hash,
    AlignLeft,
    BellRing
} from 'lucide-react';
import type { ColumnType } from '../../types';
import { COLUMN_FORMAT_TITLES } from './NumberFormatMenu';

interface ColumnMenuProps {
    isOpen: boolean;
    onClose: () => void;
    position: { top: number; left: number };
    columnType: ColumnType;
    currentSort?: 'asc' | 'desc' | null;
    onSort: (direction: 'asc' | 'desc' | null) => void;
    onFilter?: () => void;
    onDuplicate: () => void;
    onAddRight: () => void;
    onRename: () => void;
    onDelete: () => void;
    onNumberFormat?: () => void;
    onNotificationSettings?: () => void;
}

import { usePermission } from '../../hooks/usePermission';

export const ColumnMenu = ({
    isOpen,
    onClose,
    position,
    columnType,
    currentSort,
    onSort,
    onFilter,
    onDuplicate,
    onAddRight,
    onRename,
    onDelete,
    onNumberFormat,
    onNotificationSettings,
}: ColumnMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const { can } = usePermission();

    // Filter/Sort enabled for: Status, Date, Due Date, Dropdown, Checkbox
    const isSortFilterEnabled = ['status', 'date', 'due_date', 'dropdown', 'checkbox'].includes(columnType);

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

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={menuRef}
            className="glass-pop"
            style={{
                position: 'fixed',
                top: position.top,
                left: (() => {
                    const menuWidth = 240;
                    if (position.left + menuWidth > window.innerWidth) {
                        return window.innerWidth - menuWidth - 16;
                    }
                    return position.left;
                })(),
                borderRadius: '16px',
                zIndex: 9999,
                width: '240px',
                padding: '6px',
                fontSize: '13.5px',
                color: 'hsl(var(--color-text-primary))'
            }}
        >
            <div className="menu-group">
                <MenuItem
                    icon={<Filter size={15} />}
                    label="Filter"
                    onClick={() => {
                        if (onFilter) onFilter();
                        onClose();
                    }}
                    disabled={!isSortFilterEnabled}
                />

                <MenuItem
                    icon={<ArrowUpDown size={15} />}
                    label={currentSort === 'asc' ? "Sort Descending" : "Sort Ascending"}
                    onClick={() => {
                        const newDir = currentSort === 'asc' ? 'desc' : 'asc';
                        onSort(newDir);
                        onClose();
                    }}
                    disabled={!isSortFilterEnabled}
                    active={!!currentSort}
                />
                {currentSort && (
                    <MenuItem
                        icon={<Trash2 size={14} />}
                        label="Clear Sort"
                        onClick={() => {
                            onSort(null);
                            onClose();
                        }}
                    />
                )}
            </div>

            {columnType === 'due_date' && onNotificationSettings && (
                <>
                    <div className="menu-sep" />
                    <div className="menu-group">
                        <MenuItem
                            icon={<BellRing size={15} />}
                            label="Notification Settings"
                            onClick={() => { onNotificationSettings(); onClose(); }}
                        />
                    </div>
                </>
            )}

            {can('manage_columns') && (
                <>
                    <div className="menu-sep" />

                    <div className="menu-group">
                        {COLUMN_FORMAT_TITLES[columnType] && onNumberFormat && (
                            <MenuItem
                                icon={columnType === 'number' ? <Hash size={15} /> : <AlignLeft size={15} />}
                                label={COLUMN_FORMAT_TITLES[columnType]}
                                onClick={() => { onNumberFormat(); onClose(); }}
                            />
                        )}
                        <MenuItem
                            icon={<Copy size={15} />}
                            label="Duplicate column"
                            onClick={() => { onDuplicate(); onClose(); }}
                        />
                        <MenuItem
                            icon={<ArrowRightFromLine size={15} />}
                            label="Add column to right"
                            onClick={() => { onAddRight(); onClose(); }}
                        />
                    </div>

                    <div className="menu-sep" />

                    <div className="menu-group">
                        <MenuItem
                            icon={<PenLine size={15} />}
                            label="Rename"
                            onClick={() => { onRename(); onClose(); }}
                        />
                        <MenuItem
                            icon={<Trash2 size={15} />}
                            label="Delete"
                            onClick={() => { onDelete(); onClose(); }}
                            danger
                        />
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
    active?: boolean;
}

const MenuItem = ({ icon, label, onClick, disabled, danger, active }: MenuItemProps) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <div
            onClick={!disabled ? onClick : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                backgroundColor: (!disabled && isHovered) ? 'hsl(var(--color-text-primary) / 0.06)' : (active ? 'hsl(var(--color-brand-primary) / 0.1)' : 'transparent'),
                color: disabled ? 'hsl(var(--color-text-tertiary))' : (danger ? 'hsl(var(--color-danger))' : 'hsl(var(--color-text-primary))'),
                transition: 'background-color 0.1s'
            }}
        >
            <div style={{ marginRight: '10px', display: 'flex', alignItems: 'center' }}>
                {icon}
            </div>
            <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
            {active && <Check size={14} style={{ marginLeft: 'auto', color: 'hsl(var(--color-brand-primary))' }} />}
        </div>
    );
};
