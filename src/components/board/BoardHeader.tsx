import { useState, useEffect, useRef } from 'react';
import { Share2, Activity, X, MoreHorizontal, Star, Trash2, Edit2, Download, FileSpreadsheet } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { usePermission } from '../../hooks/usePermission';
import { ActivityLogList } from '../common/ActivityLogList';
import { ShareBoardModal } from '../workspace/ShareBoardModal';
import { SidePanel } from '../ui/SidePanel';
import { ExportBoardModal } from './ExportBoardModal';
import { ImportBoardModal } from '../workspace/ImportBoardModal';

import { GlobalTopActions } from '../layout/GlobalTopActions';

interface BoardHeaderProps {
    boardId: string;
}

export const BoardHeader = ({ boardId }: BoardHeaderProps) => {
    const boards = useBoardStore(state => state.boards);
    const updateBoard = useBoardStore(state => state.updateBoard);
    const deleteBoard = useBoardStore(state => state.deleteBoard);
    const workspaces = useBoardStore(state => state.workspaces);
    const board = boards.find(b => b.id === boardId);

    // Permission Hook
    const { can } = usePermission();

    const [showShareModal, setShowShareModal] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    // Rename Logic
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(board?.title || '');

    // Description Logic
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [descriptionValue, setDescriptionValue] = useState(board?.description || '');

    const menuRef = useRef<HTMLDivElement>(null);

    // Sync title/description when board changes
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescriptionValue(board.description || '');
        }
    }, [board?.title, board?.description]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRename = () => {
        if (!board) return;
        if (title.trim() !== board.title) {
            updateBoard(board.id, { title: title.trim() });
        }
        setIsEditing(false);
    };

    const handleUpdateDescription = () => {
        if (!board) return;
        if (descriptionValue.trim() !== (board.description || '')) {
            updateBoard(board.id, { description: descriptionValue.trim() || undefined });
        }
        setIsEditingDescription(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleRename();
        if (e.key === 'Escape') {
            setTitle(board?.title || '');
            setIsEditing(false);
        }
    };

    const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleUpdateDescription();
        if (e.key === 'Escape') {
            setDescriptionValue(board?.description || '');
            setIsEditingDescription(false);
        }
    };

    const handleDeleteBoard = async () => {
        if (!board) return;
        if (confirm('Are you sure you want to delete this board? This action cannot be undone.')) {
            await deleteBoard(board.id);
            // Navigation should be handled by the store or parent, but strictly we are checking logic here
        }
    };

    if (!board) return null;

    const workspaceTitle = workspaces.find(w => w.id === board.workspaceId)?.title;

    return (
        <div>
            <header className="bh">
            <div className="bh-titles">
                <div className="bh-eyebrow">
                    {workspaceTitle && <span>{workspaceTitle}</span>}
                    {workspaceTitle && <span className="bh-eyebrow-dot" />}
                    <span>Board</span>
                </div>
                {isEditing ? (
                    <input
                        autoFocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleKeyDown}
                        className="bh-title-input"
                    />
                ) : (
                    <h1
                        className="bh-title narai-heading"
                        onClick={() => can('create_board') && setIsEditing(true)}
                        style={{ cursor: can('create_board') ? 'pointer' : 'default' }}
                    >
                        {board.title}
                        <Star
                            size={20}
                            aria-label={board.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                            onClick={(e) => {
                                e.stopPropagation();
                                useBoardStore.getState().toggleFavorite(board.id);
                            }}
                            style={{
                                cursor: 'pointer',
                                flexShrink: 0,
                                fill: board.isFavorite ? '#A76400' : 'transparent',
                                color: board.isFavorite ? '#A76400' : 'hsl(var(--color-text-tertiary))',
                                transition: 'all 0.2s ease'
                            }}
                        />
                    </h1>
                )}

                {isEditingDescription ? (
                    <input
                        autoFocus
                        value={descriptionValue}
                        onChange={(e) => setDescriptionValue(e.target.value)}
                        onBlur={handleUpdateDescription}
                        onKeyDown={handleDescriptionKeyDown}
                        placeholder="Add a description"
                        className="bh-desc-input"
                    />
                ) : (
                    <div
                        className={`bh-desc${board.description ? '' : ' is-empty'}`}
                        onClick={() => can('create_board') && setIsEditingDescription(true)}
                        style={{ cursor: can('create_board') ? 'pointer' : 'default' }}
                    >
                        {board.description || (can('create_board') ? 'Add a description' : '')}
                    </div>
                )}
            </div>

            <div className="bh-actions">
                {/* Activity Log */}
                <div style={{ position: 'relative' }}>
                    <button
                        className={`bh-icon-btn${showActivityLog ? ' is-on' : ''}`}
                        onClick={() => setShowActivityLog(!showActivityLog)}
                        title="Board activity"
                        aria-label="Board activity"
                    >
                        <Activity size={17} />
                    </button>

                    <SidePanel isOpen={showActivityLog} onClose={() => setShowActivityLog(false)} width="600px">
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Header matching TaskDetail styles */}
                            <div style={{
                                padding: '24px 32px',
                                borderBottom: '1px solid hsl(var(--color-border))',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                backgroundColor: 'hsl(var(--color-bg-surface))',
                                flexShrink: 0
                            }}>
                                <div>
                                    <h2 style={{
                                        margin: 0,
                                        fontSize: '24px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: 'hsl(var(--color-text-primary))'
                                    }}>
                                        <Activity size={24} className="text-brand-primary" />
                                        Board Activity
                                    </h2>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'hsl(var(--color-text-secondary))', marginTop: '8px' }}>
                                        <span>Board: {board.title}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowActivityLog(false)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        color: 'hsl(var(--color-text-tertiary))'
                                    }}
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 32px' }}>
                                <ActivityLogList
                                    scope="board"
                                    targetId={boardId}
                                    showHeader={false}
                                    onClose={() => setShowActivityLog(false)}
                                />
                            </div>
                        </div>
                    </SidePanel>
                </div>

                <button
                    className="bh-share glass-chip"
                    // Open to everyone: the share window is also where members are listed,
                    // and it shows the invite form / role controls only to those allowed.
                    onClick={() => setShowShareModal(true)}
                    title={can('invite_members') ? 'Share board and manage members' : 'See who is on this board'}
                >
                    <Share2 size={15} />
                    Share
                </button>

                {/* More Menu */}
                <div style={{ position: 'relative' }} ref={menuRef}>
                    <button
                        className={`bh-icon-btn${showMenu ? ' is-on' : ''}`}
                        onClick={() => setShowMenu(!showMenu)}
                        title="Board options"
                        aria-label="Board options"
                    >
                        <MoreHorizontal size={17} />
                    </button>

                    {showMenu && (
                        <div className="glass-pop" style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            zIndex: 100,
                            minWidth: '220px',
                            padding: '6px'
                        }}>
                            <button className="menu-item" onClick={() => { setIsEditing(true); setShowMenu(false); }}>
                                <Edit2 size={14} /> Rename board
                            </button>
                            <button className="menu-item" onClick={() => { setShowImportModal(true); setShowMenu(false); }}>
                                <FileSpreadsheet size={14} /> Import from Excel
                            </button>
                            <button className="menu-item" onClick={() => { setShowExportModal(true); setShowMenu(false); }}>
                                <Download size={14} /> Export to Excel / CSV
                            </button>
                            <div className="menu-sep" />
                            <button className="menu-item is-danger" onClick={() => { handleDeleteBoard(); setShowMenu(false); }}>
                                <Trash2 size={14} /> Delete board
                            </button>
                        </div>
                    )}
                </div>

                <div className="bh-divider" />
                <GlobalTopActions />

            </div>

            {showShareModal && (
                <ShareBoardModal
                    boardId={boardId}
                    onClose={() => setShowShareModal(false)}
                />
            )}

            {showExportModal && (
                <ExportBoardModal
                    isOpen={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    defaultFilename={board.title}
                    onExport={(filename, format) => {
                        import('../../services/backupService').then(({ backupService }) => {
                            backupService.exportBoardData(boardId, filename, format);
                        });
                    }}
                />
            )}

            {showImportModal && <ImportBoardModal onClose={() => setShowImportModal(false)} />}
            </header>
        </div>
    );
};
