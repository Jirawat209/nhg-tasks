import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../../store/useThemeStore';

// The support cat: the original (purple) is normally hosted by the guideline
// site, but this local demo build must never fetch anything remote, so both
// palettes use the bundled Narai asset instead.
const SUPPORT_CAT = '/support-cat-narai.png';
const SUPPORT_CAT_NARAI = '/support-cat-narai.png';

export const ContactSupportButton = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const palette = useThemeStore(state => state.palette);

    useEffect(() => {
        // Show after a slight delay for better UX
        const timer = setTimeout(() => setIsVisible(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsVisible(false);
        sessionStorage.setItem('support_button_dismissed', 'true');
    };

    const handleClick = () => {
        window.open('https://docs.google.com/forms/d/e/1FAIpQLSej_72lQitnkvE18rIHRwtkBud6fe5Hn48pRWCnbpFlmETQSg/viewform?usp=header', '_blank');
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    style={{
                        position: 'fixed',
                        bottom: '32px',
                        right: '32px',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {/* Close button is now inside the pill button for a cleaner UI */}

                    {/* Main Button */}
                    <button
                        onClick={handleClick}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'var(--color-action-2, #6b4cc3)', // Exact Monday purple/blue support color
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--support-radius, 8px)', // a button like the others; a palette may override --support-radius
                            padding: '4px 16px 4px 4px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 10px var(--color-action-2-glow, rgba(107, 76, 195, 0.3))',
                            fontFamily: 'inherit',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 14px var(--color-action-2-glow, rgba(107, 76, 195, 0.4))';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 10px var(--color-action-2-glow, rgba(107, 76, 195, 0.3))';
                        }}
                    >
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-action-2-dark, #4e2f9d)', // Darker shade for contrast
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: '8px',
                            overflow: 'hidden'
                        }}>
                            <img 
                                src={palette === 'narai' ? SUPPORT_CAT_NARAI : SUPPORT_CAT}
                                alt="Support" 
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const parent = e.currentTarget.parentElement;
                                    if(parent) {
                                        parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
                                    }
                                }}
                            />
                        </div>
                        
                        <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.2px', marginRight: '8px' }}>Contact support</span>
                        
                        <AnimatePresence>
                            {isHovered && (
                                <motion.div
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    onClick={handleClose}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '4px',
                                        borderRadius: '50%',
                                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                        marginLeft: '4px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                                    }}
                                    title="Close"
                                >
                                    <X size={14} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
