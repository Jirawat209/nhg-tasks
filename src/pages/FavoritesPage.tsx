import { useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { Star } from 'lucide-react';
import { BoardCard, ShowMoreButton } from '../components/home/HomeCards';


export const FavoritesPage = () => {
    const { boards, workspaces, setActiveBoard, toggleFavorite } = useBoardStore();
    const [showAll, setShowAll] = useState(false);

    // Filter boards that are favorited. Deleting a board archives the row
    // rather than removing it (so Trash can restore it) — an archived board
    // can still carry isFavorite from before it was deleted, so that has to be
    // excluded explicitly here too.
    const favoritedBoards = boards.filter(b => b.isFavorite && !b.is_archived);
    const displayedBoards = showAll ? favoritedBoards : favoritedBoards.slice(0, 3);



    return (
        <div className="home-page" style={{ padding: '20px 28px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '22px' }}>
                <div className="bh-eyebrow" style={{ marginBottom: '4px' }}>
                    STARRED COLLECTION
                </div>
                <h1 className="narai-heading" style={{
                    fontFamily: 'var(--font-family-display)',
                    fontSize: '28px',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.15,
                    color: 'hsl(var(--color-text-primary))',
                    marginBottom: '4px'
                }}>
                    Favorites
                </h1>
                <p style={{ color: 'hsl(var(--color-text-secondary))', fontSize: '13.5px', margin: 0 }}>
                    Access your most important boards quickly.
                </p>
            </header>

            <section style={{ marginBottom: '24px' }}>
                <div className="home-section-head">
                    <div className="home-section-title-group">
                        <Star size={16} color="#E5A93C" fill="#E5A93C" />
                        <h2 className="home-section-title">Favorited Boards</h2>
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '14px',
                    marginBottom: '12px'
                }}>
                    {displayedBoards.length > 0 ? (
                        displayedBoards.map(board => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                workspace={workspaces.find(w => w.id === board.workspaceId)}
                                onOpen={() => setActiveBoard(board.id)}
                                onToggleFavorite={toggleFavorite}
                            />
                        ))
                    )
                        : (
                            <div className="card-surface" style={{
                                gridColumn: '1 / -1',
                                padding: '60px 40px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '16px'
                            }}>
                                <Star size={40} color="hsl(var(--color-text-tertiary))" style={{ opacity: 0.45 }} />
                                <div>
                                    <h3 style={{ fontFamily: 'var(--font-family-display)', fontSize: '20px', fontWeight: 500, color: 'hsl(var(--color-text-primary))', marginBottom: '6px' }}>No favorites yet</h3>
                                    <p style={{ color: 'hsl(var(--color-text-secondary))', margin: 0, fontSize: '14px' }}>Start starring boards to see them here!</p>
                                </div>
                            </div>
                        )}
                </div>
                {favoritedBoards.length > 3 && (
                    <div className="home-more-row">
                        <ShowMoreButton expanded={showAll} onToggle={() => setShowAll(!showAll)} />
                    </div>
                )}

            </section>
        </div>
    );
};
