import React from 'react';

interface TempleSectionFrameProps {
  id?: string;
  children: React.ReactNode;
  background?: 'parchment' | 'deep' | 'sunrise' | 'transparent';
  padding?: boolean;
  className?: string;
  accent?: boolean; // adds top glow and bottom diya glimmer
  seamless?: boolean; // removes border for continuous flow
}

/**
 * A decorative wrapper that gives each section a consistent temple aesthetic
 * (ornate border, subtle textured background, luminous accent lines).
 */
const TempleSectionFrame: React.FC<TempleSectionFrameProps> = ({
  id,
  children,
  background = 'parchment',
  padding = true,
  className = '',
  accent = false,
  seamless = false,
}) => {
  const bgMap: Record<string,string> = {
    parchment: 'temple-bg-parchment',
    deep: 'temple-bg-deep',
    sunrise: 'temple-bg-sunrise',
    transparent: 'bg-transparent'
  };

  return (
    <section
      id={id}
      className={`temple-section-frame relative ${bgMap[background]} ${padding ? 'px-4 md:px-8 py-16 md:py-24' : ''} ${accent ? 'temple-accent' : ''} ${className}`}
    >
  {/* Ornate border overlay (hidden when seamless for continuous blending) */}
  {!seamless && <div className="temple-border pointer-events-none" aria-hidden="true" />}
      {/* Inner content */}
      <div className="relative z-10 max-w-7xl mx-auto">
        {children}
      </div>
    </section>
  );
};

export default TempleSectionFrame;