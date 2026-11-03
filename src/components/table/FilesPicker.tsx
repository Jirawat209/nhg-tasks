import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { FileLink } from '../../types';
import { useGooglePicker } from '../../hooks/useGooglePicker';
import { fileLinkFromUrl, isOneDriveUrl, ONEDRIVE_ICON } from '../../lib/fileLinks';
import { LOCAL_ICONS } from '../../lib/localIcons';
import { useCloudDrives } from '../../hooks/useCloudDrives';

interface FilesPickerProps {
    files: FileLink[];
    position: { top: number, left: number, width: number, bottom: number };
    onSave: (newFiles: FileLink[]) => void;
    onClose: () => void;
}

export const FilesPicker = ({ files = [], position, onSave, onClose }: FilesPickerProps) => {
    const [localFiles, setLocalFiles] = useState<FileLink[]>(files || []);
    const [isAddingUrl, setIsAddingUrl] = useState(false);
    // 'onedrive': the same form, for a OneDrive / SharePoint link (name optional).
    const [addKind, setAddKind] = useState<'url' | 'onedrive'>('url');
    const [urlError, setUrlError] = useState<string | null>(null);
    const [urlName, setUrlName] = useState('');
    const [urlValue, setUrlValue] = useState('');
    
    const pickerRef = useRef<HTMLDivElement>(null);
    const { openPicker } = useGooglePicker();
    const drives = useCloudDrives();

    useEffect(() => {
        setLocalFiles(files || []);
    }, [files]);

    useEffect(() => {
        // Click outside handler
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleRemoveFile = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = localFiles.filter(f => f.id !== id);
        setLocalFiles(updated);
        onSave(updated); // Sync immediately
    };

    const handleAddUrlFile = () => {
        if (!urlValue.trim()) return;
        if (addKind === 'url' && !urlName.trim()) return;
        if (addKind === 'onedrive' && !isOneDriveUrl(urlValue)) {
            setUrlError('Paste a OneDrive or SharePoint link (1drv.ms, onedrive.live.com or …sharepoint.com).');
            return;
        }

        // The link's own kind decides the icon, whichever button it came from.
        const newFile: FileLink = fileLinkFromUrl(urlValue, urlName, uuidv4)!;
        
        const updated = [...localFiles, newFile];
        setLocalFiles(updated);
        onSave(updated); // Sync immediately
        setIsAddingUrl(false);
        setUrlError(null);
        setUrlName('');
        setUrlValue('');
    };

    // Calculate position
    const style: React.CSSProperties = {
        position: 'fixed',
        top: position.bottom + 4,
        left: position.left,
        minWidth: drives.google && drives.onedrive ? '360px' : '320px',
        maxWidth: '420px',
        borderRadius: '16px',
        zIndex: 1000,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    };

    // Auto-adjust if off screen (vertical)
    if (style.top && (style.top as number) + 350 > window.innerHeight) {
        style.top = undefined;
        style.bottom = window.innerHeight - position.top + 4;
    }

    // Auto-adjust if off screen (horizontal)
    const pickerWidth = 360;
    if ((style.left as number) + pickerWidth > window.innerWidth) {
        style.left = undefined;
        const newLeft = window.innerWidth - pickerWidth - 16;
        style.left = Math.max(16, newLeft);
    }

    const handleClose = (save: boolean = true) => {
        if (save) onSave(localFiles);
        onClose();
    };

    return createPortal(
        <div ref={pickerRef} className="glass-pop" style={style}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <div style={{ fontFamily: 'var(--font-family-display)', fontSize: '15px', fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>
                    Attached Files
                </div>
                <button 
                  onClick={() => handleClose(true)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--color-text-tertiary))', padding: '4px' }}
                >
                    <X size={16} />
                </button>
            </div>

            {/* List of Files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                {localFiles.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-tertiary))', fontStyle: 'italic', padding: '12px 0', textAlign: 'center', border: '1px dashed var(--paper-edge, hsl(var(--color-border)))', borderRadius: '10px' }}>
                        No files attached yet.
                    </div>
                )}
                {localFiles.map(file => (
                    <div key={file.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                        border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                        borderRadius: '10px',
                        fontSize: '12.5px'
                    }}>
                        <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: 'hsl(var(--color-brand-primary))',
                                textDecoration: 'none',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1
                            }}
                        >
                            {(() => {
                                let iconUrl = file.iconUrl;
                                const mime = file.mimeType?.toLowerCase() || '';
                                const name = file.name.toLowerCase();

                                if (file.type === 'onedrive') {
                                    iconUrl = ONEDRIVE_ICON;
                                } else if (mime.includes('spreadsheet')) {
                                    iconUrl = LOCAL_ICONS.sheets;
                                } else if (mime.includes('document')) {
                                    iconUrl = LOCAL_ICONS.docs;
                                } else if (mime.includes('presentation')) {
                                    iconUrl = LOCAL_ICONS.slides;
                                } else if (mime.includes('form')) {
                                    iconUrl = LOCAL_ICONS.forms;
                                } else if (mime.includes('pdf') || name.endsWith('.pdf')) {
                                    iconUrl = LOCAL_ICONS.pdf;
                                } else if (mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg')) {
                                    iconUrl = LOCAL_ICONS.photos;
                                } else if (file.type === 'google-drive') {
                                    iconUrl = LOCAL_ICONS.drive;
                                }

                                return iconUrl ? (
                                    <img src={iconUrl} alt="" referrerPolicy="no-referrer" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                ) : (
                                    <Globe size={16} color="hsl(var(--color-text-secondary))" />
                                );
                            })()}
                            <span title={file.name} style={{ fontWeight: 500 }}>{file.name}</span>
                        </a>
                        <button
                            onClick={(e) => handleRemoveFile(e, file.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'hsl(var(--color-text-tertiary))', display: 'flex' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--paper-row-line, hsl(var(--color-border)))', margin: '2px 0' }} />

            {/* Addition Choice */}
            {isAddingUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: 'hsl(var(--paper-head, var(--color-bg-subtle)))', borderRadius: '10px', border: '1px solid var(--paper-edge, hsl(var(--color-border)))' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', marginBottom: '2px' }}>{addKind === 'onedrive' ? 'Add OneDrive / SharePoint link' : 'Add File URL'}</div>
                    <input 
                        autoFocus
                        placeholder={addKind === 'onedrive' ? 'File Name (optional)' : 'File Name (e.g. My Document)'}
                        value={urlName}
                        onChange={(e) => setUrlName(e.target.value)}
                        style={{ padding: '7px 10px', fontSize: '13px', border: '1px solid var(--paper-edge, hsl(var(--color-border)))', borderRadius: '8px', backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))', color: 'hsl(var(--color-text-primary))', outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddUrlFile()}
                    />
                    <input 
                        placeholder={addKind === 'onedrive' ? 'Paste the OneDrive share link' : 'https://example.com/file.pdf'}
                        value={urlValue}
                        onChange={(e) => { setUrlValue(e.target.value); setUrlError(null); }}
                        style={{ padding: '7px 10px', fontSize: '13px', border: urlError ? '1px solid hsl(var(--color-danger))' : '1px solid var(--paper-edge, hsl(var(--color-border)))', borderRadius: '8px', backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))', color: 'hsl(var(--color-text-primary))', outline: 'none' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddUrlFile()}
                    />
                    {urlError && <div style={{ fontSize: '12px', color: 'hsl(var(--color-danger))' }}>{urlError}</div>}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button 
                            onClick={() => { setIsAddingUrl(false); setUrlError(null); }}
                            style={{ flex: 1, padding: '7px', fontSize: '12.5px', fontWeight: 500, border: '1px solid var(--paper-edge, hsl(var(--color-border)))', borderRadius: '999px', background: 'hsl(var(--paper, var(--color-bg-surface)))', color: 'hsl(var(--color-text-primary))', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleAddUrlFile}
                            disabled={(addKind === 'url' && !urlName.trim()) || !urlValue.trim()}
                            style={{ 
                              flex: 2, 
                              padding: '7px', 
                              fontSize: '12.5px', 
                              background: 'hsl(var(--color-brand-primary))', 
                              color: '#FFEFD2', 
                              border: 'none', 
                              borderRadius: '999px', 
                              cursor: 'pointer', 
                              opacity: ((addKind === 'url' && !urlName.trim()) || !urlValue.trim()) ? 0.6 : 1,
                              fontWeight: 600,
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                        >
                            Add File
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Google Drive Option: for someone signed in with Google (or email) */}
                    {drives.google && (
                    <button
                        onClick={() => {
                            openPicker((result) => {
                                const newFile: FileLink = {
                                    id: uuidv4(),
                                    name: result.name,
                                    url: result.url,
                                    type: 'google-drive',
                                    iconUrl: result.iconUrl,
                                    mimeType: result.mimeType
                                };
                                const updatedFiles = [...localFiles, newFile];
                                onSave(updatedFiles);
                                onClose();
                            });
                        }}
                        style={{
                            flex: 1,
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            color: 'hsl(var(--color-text-primary))',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            borderRadius: '10px',
                            padding: '10px 8px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--paper-edge, hsl(var(--color-border)))';
                        }}
                    >
                        <img
                            src={LOCAL_ICONS.drive}
                            alt="Google Drive"
                            width="22"
                            height="22"
                        />
                        Google Drive
                    </button>
                    )}

                    {/* OneDrive / SharePoint Option: for someone signed in with Microsoft (or email) */}
                    {drives.onedrive && (
                    <button
                        onClick={() => { setAddKind('onedrive'); setIsAddingUrl(true); }}
                        style={{
                            flex: 1,
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            color: 'hsl(var(--color-text-primary))',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            borderRadius: '10px',
                            padding: '10px 8px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--paper-edge, hsl(var(--color-border)))';
                        }}
                    >
                        <img src={ONEDRIVE_ICON} alt="OneDrive" width="22" height="22" />
                        OneDrive
                    </button>
                    )}

                    {/* File URL Option */}
                    <button
                        onClick={() => { setAddKind('url'); setIsAddingUrl(true); }}
                        style={{
                            flex: 1,
                            backgroundColor: 'hsl(var(--paper, var(--color-bg-surface)))',
                            color: 'hsl(var(--color-text-primary))',
                            border: '1px solid var(--paper-edge, hsl(var(--color-border)))',
                            borderRadius: '10px',
                            padding: '10px 8px',
                            fontSize: '12.5px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'hsl(var(--color-brand-primary))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--paper-edge, hsl(var(--color-border)))';
                        }}
                    >
                        <div style={{ 
                            width: '24px', 
                            height: '24px', 
                            borderRadius: '50%', 
                            backgroundColor: 'hsl(var(--color-text-primary) / 0.07)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: 'hsl(var(--color-text-secondary))'
                        }}>
                            <Globe size={15} />
                        </div>
                        File URL
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: isAddingUrl ? '0' : '4px' }}>
                <button
                    onClick={() => handleClose(true)}
                    style={{
                        padding: '7px 26px',
                        backgroundColor: 'hsl(var(--color-brand-primary))',
                        color: '#FFEFD2',
                        border: 'none',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                    OK
                </button>
            </div>
        </div>,
        document.body
    );
};
