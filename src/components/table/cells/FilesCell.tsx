
import React, { useRef, useState, useCallback, memo } from 'react';
import type { Column, FileLink } from '../../../types';
import { useBoardStore } from '../../../store/useBoardStore';
import { usePermission } from '../../../hooks/usePermission';
import { FileText, Plus } from 'lucide-react';
import { FilesPicker } from '../FilesPicker';
import { ONEDRIVE_ICON } from '../../../lib/fileLinks';
import { LOCAL_ICONS } from '../../../lib/localIcons';

interface FilesCellProps {
    itemId: string;
    column: Column;
    files?: FileLink[];
}

const FILE_ICONS = {
    sheets: LOCAL_ICONS.sheets,
    docs: LOCAL_ICONS.docs,
    slides: LOCAL_ICONS.slides,
    forms: LOCAL_ICONS.forms,
    drive: LOCAL_ICONS.drive,
    pdf: LOCAL_ICONS.pdf
};

export const FilesCell: React.FC<FilesCellProps> = memo(({ itemId, column, files: propFiles }) => {
    const updateItemValue = useBoardStore(state => state.updateItemValue);
    const { can } = usePermission();

    const [isEditing, setIsEditing] = useState(false);
    const [pickerPos, setPickerPos] = useState<{ top: number, bottom: number, left: number, width: number } | null>(null);
    const cellRef = useRef<HTMLDivElement>(null);

    const files: FileLink[] = Array.isArray(propFiles) ? propFiles : [];

    const startEditing = useCallback(() => {
        if (!can('edit_items')) return;
        if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            setPickerPos({
                top: rect.top,
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
                onClick={startEditing}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    overflow: 'hidden'
                }}
            >
                {files.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {(files.length > 4 ? files.slice(0, 3) : files).map((file, idx) => (
                            <a
                                key={idx}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={file.name}
                                style={{ 
                                    textDecoration: 'none',
                                    marginLeft: idx > 0 ? '-10px' : '0',
                                    zIndex: idx + 1
                                }}
                            >
                                {(() => {
                                    let iconUrl = file.iconUrl;
                                    const mime = file.mimeType?.toLowerCase() || '';
                                    const name = file.name.toLowerCase();

                                    if (file.type === 'onedrive') {
                                        iconUrl = ONEDRIVE_ICON;
                                    } else if (mime.includes('spreadsheet')) {
                                        iconUrl = FILE_ICONS.sheets;
                                    } else if (mime.includes('document')) {
                                        iconUrl = FILE_ICONS.docs;
                                    } else if (mime.includes('presentation')) {
                                        iconUrl = FILE_ICONS.slides;
                                    } else if (mime.includes('form')) {
                                        iconUrl = FILE_ICONS.forms;
                                    } else if (mime.includes('pdf') || name.endsWith('.pdf')) {
                                        iconUrl = FILE_ICONS.pdf;
                                    } else if (mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg')) {
                                        // iconUrl = FILE_ICONS.photos; // We'll just let it use the file.iconUrl or generic
                                    } else if (file.type === 'google-drive') {
                                        iconUrl = FILE_ICONS.drive;
                                    }

                                    return (
                                        <div style={{
                                            width: '26px',
                                            height: '26px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: 'hsl(var(--paper-head, var(--color-bg-surface)))',
                                            borderRadius: '50%',
                                            border: '2px solid hsl(var(--paper, var(--color-bg-surface)))',
                                            boxShadow: '0 1px 2px rgba(21, 42, 0, 0.12)',
                                            overflow: 'hidden'
                                        }}>
                                            {iconUrl ? (
                                                <img
                                                    src={iconUrl}
                                                    alt=""
                                                    referrerPolicy="no-referrer"
                                                    style={{ width: '16px', height: '16px', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <FileText size={15} color="hsl(var(--color-text-secondary))" />
                                            )}
                                        </div>
                                    );
                                })()}
                            </a>
                        ))}
                        {files.length > 4 && (
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                backgroundColor: 'hsl(var(--color-text-primary) / 0.1)',
                                color: 'hsl(var(--color-text-secondary))',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid hsl(var(--paper, var(--color-bg-surface)))',
                                marginLeft: '-8px',
                                zIndex: 10
                            }}>
                                +{files.length - 3}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ color: 'hsl(var(--color-text-tertiary))', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                        <Plus size={16} />
                    </div>
                )}
            </div>

            {isEditing && pickerPos && (
                <FilesPicker
                    files={files}
                    position={pickerPos!}
                    onSave={(newFiles) => {
                        updateItemValue(itemId, column.id, newFiles);
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
