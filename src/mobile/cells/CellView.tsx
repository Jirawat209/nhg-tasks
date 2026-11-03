import { memo, type CSSProperties } from 'react';
import { Check, FileText, Link2, Star } from 'lucide-react';
import type { Column, FileLink, Item } from '../../types';
import { formatNumberValue } from '../../utils/format';
import { linkDisplayText } from '../../lib/utils';
import { AvatarStack, Avatar, peopleIds, type PersonInfo } from '../ui';
import { formatDateCell, formatTimelineRange, isOverdue } from './format';
import { ONEDRIVE_ICON } from '../../lib/fileLinks';
import { LOCAL_ICONS } from '../../lib/localIcons';
import './cells.css';
import { tintLabel } from '../../lib/labelTint';

export interface CellViewProps {
    column: Column;
    value: unknown;
    item: Item;
    /** The open board's members by user id (useBoardPeople). */
    people: Map<string, PersonInfo>;
    /** 'table': fills a fixed-height table cell. 'detail': a row value in the item's Columns tab. */
    variant: 'table' | 'detail';
    /** The item's group colour — a timeline is drawn in it, as on desktop. */
    groupColor?: string;
}

// The Google Drive mark desktop FilesCell uses for Drive files.
export const DRIVE_ICON = LOCAL_ICONS.drive;

const EMPTY_STATUS = '#c4c4c4';

/** A file's small picture: the Drive mark for Drive files, else a document icon. */
export const FileIcon = ({ file, size = 22 }: { file: FileLink; size?: number }) =>
    file.type === 'onedrive'
        ? <img src={ONEDRIVE_ICON} alt="" width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} />
        : file.type === 'google-drive' || /drive\.google|docs\.google/.test(file.url || '')
        ? <img src={file.iconUrl || DRIVE_ICON} alt="" width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} referrerPolicy="no-referrer" loading="lazy" />
        : <FileText size={size} color="hsl(var(--m-text-2))" style={{ flexShrink: 0 }} />;

const Stars = ({ rating, size }: { rating: number; size: number }) => (
    <span style={{ display: 'inline-flex', gap: 1 }} aria-label={`${rating} of 5`}>
        {[1, 2, 3, 4, 5].map(n => (
            <Star key={n} size={size} strokeWidth={1.8} color={n <= rating ? '#fdab3d' : 'hsl(var(--m-chip-strong))'} fill={n <= rating ? '#fdab3d' : 'none'} />
        ))}
    </span>
);

const toRating = (value: unknown): number => {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(5, n) : 0;
};

/**
 * One value, drawn for the phone: a full-bleed status block, avatars, a date, a
 * timeline pill… The rules (what counts as empty, which colours, how dates and
 * numbers read) are the desktop cells' — only the sizes are the phone's.
 */
export const CellView = memo(({ column, value, people, variant, groupColor }: CellViewProps) => {
    const table = variant === 'table';

    switch (column.type) {
        case 'status': {
            const options = Array.isArray(column.options) ? column.options : [];
            const option = options.find(o => o.id === value || o.label === value);
            if (!option && value) {
                // A value no option matches (left over from another column type) reads as text.
                return <span className={table ? 'm-cell-text' : 'm-detail-text'}>{String(value)}</span>;
            }
            const label = option && option.label !== 'Default' ? option.label : '';
            if (!table) {
                return option
                    ? <span className="m-status-pill" style={{ backgroundColor: tintLabel(option.color) }}>{label || ' '}</span>
                    : <span className="m-detail-empty">—</span>;
            }
            return (
                <span className="m-status-block" style={{ backgroundColor: tintLabel(option?.color || EMPTY_STATUS) }}>
                    {label}
                </span>
            );
        }

        case 'dropdown': {
            const labels = (Array.isArray(value) ? value : value ? [value] : []).map(String);
            if (labels.length === 0) return table ? null : <span className="m-detail-empty">—</span>;
            const options = Array.isArray(column.options) ? column.options : [];
            return (
                <span className={table ? 'm-chips m-chips--table' : 'm-chips'}>
                    {labels.map((label, i) => (
                        <span key={`${label}-${i}`} className="m-chip" style={{ backgroundColor: tintLabel(options.find(o => o.label === label)?.color || '#a0c4ff') }}>
                            {label}
                        </span>
                    ))}
                </span>
            );
        }

        case 'people': {
            const assigned = peopleIds(value).map(id => people.get(id)).filter((p): p is PersonInfo => !!p);
            if (assigned.length === 0) return table ? null : <span className="m-detail-empty">—</span>;
            if (table) {
                return (
                    <span className="m-cell-center">
                        <AvatarStack people={assigned} max={2} size={30} />
                    </span>
                );
            }
            return (
                <span className="m-people-list">
                    {assigned.map(person => (
                        <span key={person.id} className="m-people-list__item">
                            <Avatar name={person.name} src={person.avatarUrl} size={26} />
                            <span className="m-truncate">{person.name}</span>
                        </span>
                    ))}
                </span>
            );
        }

        case 'date':
        case 'due_date': {
            const text = typeof value === 'string' ? formatDateCell(value) : '';
            if (!text) return table ? null : <span className="m-detail-empty">—</span>;
            const overdue = column.type === 'due_date' && isOverdue(value as string);
            const style: CSSProperties | undefined = overdue ? { color: 'hsl(var(--color-danger))', fontWeight: 600 } : undefined;
            return <span className={table ? 'm-cell-text m-cell-text--center' : 'm-detail-text'} style={style}>{text}</span>;
        }

        case 'timeline': {
            const range = formatTimelineRange(value);
            if (!range) return table ? null : <span className="m-detail-empty">—</span>;
            return (
                <span className={table ? 'm-cell-center' : undefined}>
                    <span className="m-timeline-pill" style={{ backgroundColor: groupColor || '#ff158a' }}>{range}</span>
                </span>
            );
        }

        case 'number': {
            const text = formatNumberValue(value as number | string | null | undefined, column);
            if (!text) return table ? null : <span className="m-detail-empty">—</span>;
            const align = column.numberAlign || 'left';
            return (
                <span className={table ? 'm-cell-text' : 'm-detail-text'} style={table ? { justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' } : undefined}>
                    {text}
                </span>
            );
        }

        case 'checkbox': {
            const checked = value === true;
            return (
                <span className={table ? 'm-cell-center' : undefined}>
                    <span className={`m-check${checked ? ' m-check--on' : ''}`} role="img" aria-label={checked ? 'Checked' : 'Not checked'}>
                        {checked && <Check size={16} strokeWidth={3} />}
                    </span>
                </span>
            );
        }

        case 'priority': {
            const rating = toRating(value);
            if (!rating && !table) return <span className="m-detail-empty">—</span>;
            return (
                <span className={table ? 'm-cell-center' : undefined}>
                    <Stars rating={rating} size={table ? 15 : 18} />
                </span>
            );
        }

        case 'link': {
            const text = linkDisplayText(value);
            if (!text) return table ? null : <span className="m-detail-empty">—</span>;
            return (
                <span className={table ? 'm-cell-text m-cell-link' : 'm-detail-text m-cell-link'}>
                    {!table && <Link2 size={16} style={{ flexShrink: 0 }} />}
                    <span className="m-truncate">{text}</span>
                </span>
            );
        }

        case 'files': {
            const files: FileLink[] = Array.isArray(value) ? value as FileLink[] : [];
            if (files.length === 0) return table ? null : <span className="m-detail-empty">—</span>;
            if (!table) {
                return (
                    <span className="m-file-list">
                        {files.map(file => (
                            <span key={file.id} className="m-file-list__item">
                                <FileIcon file={file} size={20} />
                                <span className="m-truncate">{file.name}</span>
                            </span>
                        ))}
                    </span>
                );
            }
            const shown = files.length > 3 ? files.slice(0, 2) : files;
            return (
                <span className="m-cell-center" style={{ gap: 6 }}>
                    {shown.map(file => <FileIcon key={file.id} file={file} size={24} />)}
                    {files.length > shown.length && <span className="m-more-badge">+{files.length - shown.length}</span>}
                </span>
            );
        }

        case 'text':
        case 'long_text':
        default: {
            const text = value === null || value === undefined ? '' : typeof value === 'object' ? '' : String(value);
            if (!text) return table ? null : <span className="m-detail-empty">—</span>;
            return (
                <span className={table ? 'm-cell-text' : 'm-detail-text m-detail-text--wrap'}>
                    {table ? text.split('\n')[0] : text}
                </span>
            );
        }
    }
});
CellView.displayName = 'CellView';
