import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Custom hook to handle scroll animations
const useScrollAnimation = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  return { ref, isVisible };
};


const TempleOverview = () => {
  const navigate = useNavigate();
  const { ref: contentRef, isVisible: isContentVisible } = useScrollAnimation();
  const { ref: imageRef, isVisible: isImageVisible } = useScrollAnimation();

  return (
    // Main section container
    <section className="py-6 px-4 md:py-12 md:px-8">
      <div className="relative max-w-screen-2xl mx-auto temple-glass-surface overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left side content */}
            <div 
              ref={contentRef}
              className={`space-y-8 transition-all ease-in-out duration-1000 ${isContentVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              <div className="space-y-6">
                <h2 className="temple-section-heading">
                  <span className="sub">About Our</span>
                  Sacred Temple
                </h2>
                <div className="temple-section-heading-divider" />
                <p className="text-base md:text-lg leading-relaxed text-[hsl(30_25%_90%)]/85 tracking-[0.25px]">
                  For over a century, our temple has stood as a beacon of devotion and inner peace—
                  honoring sacred traditions while thoughtfully embracing modern conveniences to
                  better serve every devotee who walks through its sanctified threshold.
                </p>
              </div>
              <button className="temple-btn-primary inline-flex items-center justify-center" onClick={() => navigate('/about')}>
                Learn More About Our Temple
              </button>
            </div>
            {/* Right side image */}
            <div 
              ref={imageRef}
              className={`relative transition-all ease-in-out duration-1000 delay-300 ${isImageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} `}
            >
              <div className="relative rounded-3xl overflow-hidden backdrop-blur-lg border border-amber-300/30 shadow-[0_8px_30px_-12px_rgba(0,0,0,.6)]">
                <img src="" alt="Temple Interior" className="w-full h-[440px] object-cover bg-amber-50/10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(60,30,10,0.55)] via-[rgba(60,30,10,0.25)] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[rgba(255,220,150,0.2)] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TempleOverview;

