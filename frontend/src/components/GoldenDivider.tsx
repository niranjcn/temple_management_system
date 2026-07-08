import React from 'react';

interface GoldenDividerProps {
  subtle?: boolean;
  className?: string;
  decorative?: boolean; // if true, aria-hidden
}

/**
 * A luminous horizontal golden linear divider that blends sections instead of hard framed boxes.
 * Uses layered gradients + mask for a tapered glow with optional subtle mode.
 */
const GoldenDivider: React.FC<GoldenDividerProps> = ({ subtle = false, className = '', decorative = true }) => {
  return (
    <div
      role={decorative ? undefined : 'separator'}
      aria-hidden={decorative}
      className={`w-full flex justify-center py-4 md:py-6 select-none ${className}`}
    >
      <span
        className={`block relative h-[3px] md:h-[4px] w-[72%] md:w-[58%] max-w-4xl rounded-full overflow-hidden ${subtle ? 'golden-divider-subtle' : ''}`}
      >
        {/* Animated shimmer only (static base removed) */}
        <span className="absolute inset-0 pointer-events-none golden-divider-shimmer" />
      </span>
    </div>
  );
};

export default GoldenDivider;
