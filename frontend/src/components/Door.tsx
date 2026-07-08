import React, { useState, useEffect } from 'react';

interface DoorProps {
  onEnter?: () => void;
}

/**
 * Door overlay that shows a temple entrance animation the first time a user
 * visits the site in the current session. Uses sessionStorage key
 * `hasEnteredSite` to persist state for the tab session.
 */
const Door: React.FC<DoorProps> = ({ onEnter }) => {
  const hasEntered = typeof window !== 'undefined' ? sessionStorage.getItem('hasEnteredSite') : 'true';

  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState<boolean>(!!hasEntered);

  // Animation timing (ms) - slowed down per request
  const DOOR_ANIMATION_MS = 2600; // transform animation duration
  const HIDE_BUFFER_MS = 250; // small buffer to finish easing before unmount
  const TOTAL_HIDE_DELAY = DOOR_ANIMATION_MS + HIDE_BUFFER_MS;

  useEffect(() => {
    if (hasEntered) return; // already entered this session
    // ensure we start visible
    setIsHidden(false);
  }, [hasEntered]);

  useEffect(() => {
    if (hasEntered) return;
    if (isOpen) {
      const timer = setTimeout(() => setIsHidden(true), TOTAL_HIDE_DELAY); // hide after slower animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, hasEntered]);

  const handleEnter = () => {
    sessionStorage.setItem('hasEnteredSite', 'true');
    setIsOpen(true);
    onEnter?.();
  };

  if (isHidden) return null;

  // Base half-door styling (now brass/gilded look rather than wood)
  const doorPanelClasses = `w-1/2 h-full absolute top-0 bg-[#5c4514] border-[3px] border-[#2e230d] shadow-[0_0_32px_rgba(0,0,0,0.7),inset_0_0_18px_rgba(0,0,0,0.8)] transition-transform duration-[${DOOR_ANIMATION_MS}ms] ease-[cubic-bezier(.77,.2,.19,1)] flex items-center justify-center overflow-hidden`;
  const transformStyle: React.CSSProperties = { transformStyle: 'preserve-3d' };

  // Door background now driven by CSS class `.door-bg` (uses assets/door-grain.png if present
  // and falls back to layered CSS gradients + subtle grain). See index.css for the rules.

  const borderFrame = 'absolute inset-[5%] rounded-[6px]';
  const ornateBorder: React.CSSProperties = {
    background: `
      radial-gradient(circle at 15% 18%, rgba(255,230,180,0.35), rgba(0,0,0,0) 60%),
      radial-gradient(circle at 85% 82%, rgba(255,230,180,0.3), rgba(0,0,0,0) 60%),
      repeating-linear-gradient(45deg, rgba(255,200,120,0.25) 0 9px, rgba(120,70,10,0.35) 9px 18px),
      linear-gradient(160deg,#f6d98a,#ad7a16 55%,#f6d98a)
    `,
    boxShadow: 'inset 0 0 4px rgba(0,0,0,0.85), 0 0 4px rgba(255,240,200,0.25)',
    border: '2px solid rgba(120,80,20,0.8)'
  };

  // Carved deity panel simulation (three per side) using gradients + masks
  const deityPanelClass = 'relative w-[76%] mx-auto rounded-md aspect-[3/4] flex items-center justify-center';
  const deityPanels = [0,1,2];
  const deityPanelStyle: React.CSSProperties = {
    background: `
      radial-gradient(circle at 50% 50%, rgba(255,240,200,0.15), rgba(120,70,15,0.55) 68%),
      repeating-linear-gradient(90deg, rgba(255,200,120,0.25) 0 6px, rgba(120,70,15,0.25) 6px 12px),
      linear-gradient(140deg,#d2a744,#7a5014)
    `,
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.7), inset 0 -3px 5px rgba(0,0,0,0.65), 0 0 3px rgba(255,240,200,0.15)',
    border: '1px solid rgba(110,70,15,0.9)'
  };
  const circularMedallion: React.CSSProperties = {
    position: 'absolute',
    width: '74%',
    height: '74%',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5), rgba(210,160,60,0.25) 35%, rgba(90,50,10,0.65) 75%)',
    boxShadow: '0 0 4px rgba(0,0,0,0.8), inset 0 0 6px rgba(0,0,0,0.8)',
    maskImage: 'radial-gradient(circle at 50% 50%, black 60%, transparent 61%)'
  };
  const deitySilhouette: React.CSSProperties = {
    position: 'absolute',
    width: '40%',
    height: '54%',
    background: 'radial-gradient(circle at 50% 30%, rgba(255,230,180,0.85), rgba(120,70,15,0.8) 70%)',
    filter: 'blur(2px) contrast(140%)',
    maskImage: `
      radial-gradient(circle at 50% 15%, black 0 18%, transparent 19%), /* head */
      radial-gradient(circle at 50% 33%, black 0 32%, transparent 33%), /* torso */
      radial-gradient(circle at 35% 65%, black 0 18%, transparent 19%),
      radial-gradient(circle at 65% 65%, black 0 18%, transparent 19%)
    `,
    maskComposite: 'add',
    WebkitMaskComposite: 'source-over'
  };

  // Stud (boss) decorative fasteners in vertical line (4 each door) + center ring positions
  const studStyle: React.CSSProperties = {
    background: 'radial-gradient(circle at 30% 30%, #fff5cc, #f9d970 35%, #d29a22 60%, #7a4a10 75%, #3e2308)',
    boxShadow: '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.6), inset 0 -2px 3px rgba(0,0,0,0.55)'
  };
  const leftStuds = [12, 34, 56, 78];
  const rightStuds = [18, 40, 62, 84];
  const shimmerOverlay: React.CSSProperties = {
    background: 'linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 55%)',
    mixBlendMode: 'overlay',
    animation: 'door-shimmer 6s linear infinite',
    opacity: 0.25
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-amber-200 font-sans transition-opacity duration-500 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      aria-label="Temple entrance"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[20rem] h-[28rem] md:w-[24rem] md:h-[32rem] mb-8" style={{ perspective: '1200px' }}>
        <div className="relative w-full h-full">
          {/* Left Door Panel */}
          <div
            className={`${doorPanelClasses} left-0`}
            style={{
              ...transformStyle,
              transformOrigin: 'left',
              transform: isOpen ? 'rotateY(-138deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Gilded surface */}
            <div className="absolute inset-0 door-bg" />
            <div className="absolute inset-0" style={shimmerOverlay} />
            {/* Subtle interior warm glow */}
            <div className="absolute inset-0 opacity-40 mix-blend-plus-lighter bg-[radial-gradient(circle_at_50%_75%,rgba(255,180,70,0.28),rgba(0,0,0,0)_70%)]" />
            {/* Ornate border frame */}
            <div className={borderFrame} style={ornateBorder}>
              <div className="absolute inset-[5px] flex flex-col justify-between py-2">
                {deityPanels.map(idx => (
                  <div key={idx} className={deityPanelClass} style={deityPanelStyle}>
                    <div style={circularMedallion} />
                    <div style={deitySilhouette} />
                    {/* ring accent */}
                    <div className="absolute inset-0 rounded-md pointer-events-none" style={{
                      background: 'radial-gradient(circle at 50% 50%, rgba(255,230,160,0.15), rgba(0,0,0,0) 70%)'
                    }} />
                  </div>
                ))}
              </div>
              {/* Vertical stud line */}
              {leftStuds.map((t,i) => (
                <div key={i} className="absolute left-[9%] w-6 h-6 -translate-x-1/2 rounded-full" style={{ top: `${t}%`, ...studStyle }} />
              ))}
            </div>
            {/* Hinges */}
            <div className="absolute -right-[6px] top-[14%] w-[10px] h-[54%] flex flex-col justify-between">
              {[0,1,2].map(i => (
                <div key={i} className="w-[10px] h-8 bg-gradient-to-r from-[#201611] to-[#46342b] rounded-sm shadow-[0_0_4px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.2)] border border-[#120c09]" />
              ))}
            </div>
            {/* Handle/interactive stud removed per request */}
          </div>
          {/* Right Door Panel */}
          <div
            className={`${doorPanelClasses} right-0`}
            style={{
              ...transformStyle,
              transformOrigin: 'right',
              transform: isOpen ? 'rotateY(138deg)' : 'rotateY(0deg)',
            }}
          >
            <div className="absolute inset-0 door-bg" />
            <div className="absolute inset-0" style={shimmerOverlay} />
            <div className="absolute inset-0 opacity-40 mix-blend-plus-lighter bg-[radial-gradient(circle_at_50%_75%,rgba(255,180,70,0.28),rgba(0,0,0,0)_70%)]" />
            <div className={borderFrame} style={ornateBorder}>
              <div className="absolute inset-[5px] flex flex-col justify-between py-2">
                {deityPanels.map(idx => (
                  <div key={idx} className={deityPanelClass} style={deityPanelStyle}>
                    <div style={circularMedallion} />
                    <div style={deitySilhouette} />
                    <div className="absolute inset-0 rounded-md pointer-events-none" style={{
                      background: 'radial-gradient(circle at 50% 50%, rgba(255,230,160,0.15), rgba(0,0,0,0) 70%)'
                    }} />
                  </div>
                ))}
              </div>
              {rightStuds.map((t,i) => (
                <div key={i} className="absolute right-[9%] w-6 h-6 translate-x-1/2 rounded-full" style={{ top: `${t}%`, ...studStyle }} />
              ))}
            </div>
            {/* Hinges mirror */}
            <div className="absolute -left-[6px] top-[14%] w-[10px] h-[54%] flex flex-col justify-between">
              {[0,1,2].map(i => (
                <div key={i} className="w-[10px] h-8 bg-gradient-to-r from-[#46342b] to-[#201611] rounded-sm shadow-[0_0_4px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.15)] border border-[#120c09]" />
              ))}
            </div>
            {/* Decorative central bar (where doors meet) */}
            <div className="absolute left-0 top-0 h-full w-[6px] bg-gradient-to-b from-[#221710] via-[#3b281e] to-[#221710] shadow-[inset_0_0_4px_rgba(0,0,0,0.8)]" />
          </div>
        </div>
      </div>
      {!isOpen && (
        <button
          onClick={handleEnter}
          className="mt-4 px-10 py-3 bg-gradient-to-b from-[#c89b2b] via-[#a57413] to-[#6f470c] text-amber-50 text-sm font-semibold tracking-wide rounded-md shadow-[0_6px_18px_rgba(0,0,0,0.55),inset_0_2px_4px_rgba(255,255,255,0.25)] hover:from-[#dfb747] hover:via-[#b17618] hover:to-[#7a4f10] transition-all duration-300 hover:scale-[1.05] focus:outline-none focus:ring-4 focus:ring-amber-400/60"
        >
          Enter Temple
        </button>
      )}
    </div>
  );
};

export default Door;
