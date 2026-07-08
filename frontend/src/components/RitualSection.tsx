import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/api';
import { Flame, Flower2, Heart, Star, LucideProps } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import lampVideo from '../assets/lamp.mp4';

// --- Type Definitions ---
// Used to define the structure for a single ritual object.
interface Ritual {
  _id: string;
  name: string;
  price: number;
  // Backend uses icon_name; keep a fallback for legacy 'icon'
  icon_name?: string;
  icon?: string;
  popular?: boolean;
  booking_start_time?: string;
  booking_end_time?: string;
  employee_only?: boolean;
  show_on_home?: boolean;
}

// --- Icon Mapping Utility ---
// Used to map icon names from the API to actual Lucide icon components.
const iconMap: { [key: string]: React.FC<LucideProps> } = {
  Flame,
  Flower2,
  Heart,
  Star,
};

// --- RitualIcon Component ---
// Used to render the correct icon based on its name.
const RitualIcon = ({ name, ...props }: { name: string } & LucideProps) => {
    const IconComponent = iconMap[name] || Star; // Defaults to Star icon if not found.
    return <IconComponent {...props} />;
};

// --- API Fetching ---
// Used to fetch the list of rituals from the API.
// Prefer featured subset for home (max 3). Fallback to all if the endpoint is missing.
const fetchRituals = async (): Promise<Ritual[]> => {
  try {
    const featured = await get<Ritual[]>('/rituals/featured');
    // If API returns an empty array, still show nothing (respect selection)
    return Array.isArray(featured) ? featured : [];
  } catch (e) {
    // Backward compatibility: fall back to all rituals filtered client-side if needed
    const all = await get<Ritual[]>('/rituals/');
    // If show_on_home exists, filter to those; otherwise just take first 3 to avoid overfill
    const selected = all.filter(r => r.show_on_home).slice(0, 3);
    return selected.length ? selected : all.slice(0, 3);
  }
};

const RitualSection = () => {
  const { data: rituals, isLoading, isError } = useQuery<Ritual[]>({
    queryKey: ['featuredRituals'],
      queryFn: fetchRituals
  });

  // Hooks to trigger animations on scroll.
  const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
  const { ref: cardsRef, isVisible: cardsVisible } = useScrollAnimation();

  return (
  <section className="py-24 px-4 md:px-8">
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
      {/* Left Video / Visual */}
      <div className="lg:sticky lg:top-28">
        <div className={`temple-panel simple animate-fade-in-up ${headerVisible ? '' : 'opacity-0 translate-y-4'}`} style={{animationDelay:'0.15s'}}>
          <video
            src={lampVideo}
            autoPlay
            loop
            muted
            playsInline
            className="rounded-xl w-full object-cover shadow-xl border border-amber-400/40"
          />
          <div className="mt-4 text-center text-xs tracking-wide text-amber-900/70">Ever-burning Sacred Deepam</div>
        </div>
      </div>
      {/* Right Content */}
      <div className="flex flex-col gap-10">
        <div ref={headerRef} className={`${headerVisible ? 'animate-fade-in-up' : 'opacity-0 translate-y-4'} text-center lg:text-left`}>
          <h2 className="temple-heading-xl">Sacred <span className="sub">Rituals</span></h2>
          <div className="temple-heading-divider" />
          <p className="mt-6 text-amber-900/90 text-lg leading-relaxed max-w-xl lg:pr-4">
            Connect with the divine through authentic ceremonies performed with tradition, devotion and purity.
          </p>
        </div>
        <div ref={cardsRef} className="flex flex-col gap-5">
          {isLoading && Array.from({length:4}).map((_,i)=>(
            <div key={i} className="h-[86px] animate-pulse rounded-xl bg-amber-200/40 border border-amber-500/20" />
          ))}
          {isError && <p className="text-red-600 text-sm">Failed to load rituals.</p>}
          {rituals?.map((ritual,index)=> (
            <div key={ritual._id} className={`${cardsVisible ? 'animate-fade-in-up' : 'opacity-0 translate-y-4'}`} style={{animationDelay:`${index*0.08}s`}}>
              <div className="temple-card-translucent rounded-xl p-4 flex items-center gap-5 group">
                {ritual.popular && (
                  <span className="temple-badge absolute top-2 right-2">Popular</span>
                )}
                <div className="p-3 rounded-lg bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-md group-hover:scale-110 transition-transform duration-300">
                  <RitualIcon name={(ritual.icon_name || ritual.icon || 'Star') as string} className="h-6 w-6" />
                </div>
                <div className="flex-grow">
                  <h3 className="font-semibold font-playfair text-[1.05rem] tracking-wide text-amber-900">{ritual.name}</h3>
                </div>
                <div className="text-right font-playfair font-bold text-amber-800">₹{ritual.price}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 flex justify-center">
          <a href="/ritual-booking" className="temple-btn-primary inline-block">Book a Ritual</a>
        </div>
      </div>
    </div>
  </section>
  );
};

export default RitualSection;
