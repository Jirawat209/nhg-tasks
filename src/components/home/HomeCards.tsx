import { ChevronDown, Layout, Lock, Star } from 'lucide-react';
import type { Board, Workspace } from '../../types';
import { WorkspaceIcon } from '../board/sidebar/SidebarIcons';

/**
 * A board as a card: Home's Recently visited / My workspace / Favorites and the
 * Favorites page. The whole card opens the board (the title is the button and
 * its ::after covers the card); the star is a button of its own above it.
 * Styles: .board-card in styles/home.css.
 */
export const BoardCard = ({ board, workspace, onOpen, onToggleFavorite }: {
    board: Board;
    workspace?: Workspace;
    onOpen: () => void;
    onToggleFavorite: (boardId: string) => void;
}) => {
    const workspaceTitle = workspace?.title || 'Unknown Workspace';
    const ownerName = workspace?.ownerName || 'Unknown Owner';
    const ownerInitial = workspace?.ownerName ? (Array.from(workspace.ownerName.trim())[0] || '?').toUpperCase() : '?';
    return (
        <article className="card-surface board-card">
            <div className="board-card__top">
                <span className="board-card__tile" aria-hidden="true">
                    <Layout size={17} />
                </span>
                <button
                    type="button"
                    className="board-card__star"
                    aria-pressed={!!board.isFavorite}
                    aria-label={board.isFavorite ? `Remove ${board.title} from favorites` : `Add ${board.title} to favorites`}
                    title={board.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={() => onToggleFavorite(board.id)}
                >
                    <Star size={16} />
                </button>
            </div>

            <div className="board-card__body">
                <h3 className="board-card__title">
                    <button type="button" className="board-card__open" onClick={onOpen}>{board.title}</button>
                    {board.is_private && <Lock size={13} className="board-card__lock" aria-label="Private board" />}
                </h3>
                <div className="board-card__kind">Work Management</div>
            </div>

            <dl className="board-card__meta">
                <div>
                    <dt>Workspace</dt>
                    <dd>
                        <WorkspaceIcon title={workspaceTitle} isActive={false} size={18} />
                        <span>{workspaceTitle}</span>
                    </dd>
                </div>
                <div>
                    <dt>Owner</dt>
                    <dd>
                        <span className="board-card__avatar" aria-hidden="true">{ownerInitial}</span>
                        <span>{ownerName}</span>
                    </dd>
                </div>
            </dl>
        </article>
    );
};

/** "Show all" / "Show 4 more" under a list that is cut short; the chevron turns when open. */
export const ShowMoreButton = ({ expanded, onToggle, label = 'Show all' }: {
    expanded: boolean;
    onToggle: () => void;
    label?: string;
}) => (
    <button type="button" className="home-more" aria-expanded={expanded} onClick={onToggle}>
        {expanded ? 'Show less' : label}
        <ChevronDown size={16} />
    </button>
);
