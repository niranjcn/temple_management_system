import React, { useState, useEffect, useCallback, createContext, useContext, forwardRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/api';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { resolveImageUrl } from '@/lib/utils';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import ImageWithBlur from '@/components/ImageWithBlur';

// Carousel implementation using embla-carousel-react
// NOTE: You'll need to install this package: `npm install embla-carousel-react`
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { cn } from '@/lib/utils'; // Assuming you have a cn utility for classnames

// --- Helper Components for Carousel (inspired by shadcn/ui) ---

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: 'horizontal' | 'vertical';
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = useContext(CarouselContext);
  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />');
  }
  return context;
}

const Carousel = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & CarouselProps>(
  ({ orientation = 'horizontal', opts, setApi, plugins, className, children, ...props }, ref) => {
    const [carouselRef, api] = useEmblaCarousel({ ...opts, axis: orientation === 'horizontal' ? 'x' : 'y' }, plugins);
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);

    const onSelect = useCallback((api: CarouselApi) => {
      if (!api) return;
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    }, []);

    const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
    const scrollNext = useCallback(() => api?.scrollNext(), [api]);

    useEffect(() => {
      if (!api || !setApi) return;
      setApi(api);
    }, [api, setApi]);

    useEffect(() => {
      if (!api) return;
      onSelect(api);
      api.on('reInit', onSelect).on('select', onSelect);
      return () => {
        // Used to properly clean up event listeners to prevent memory leaks
        api?.off('reInit', onSelect);
        api?.off('select', onSelect);
      };
    }, [api, onSelect]);

    return (
      <CarouselContext.Provider
        value={{ carouselRef, api, opts, scrollPrev, scrollNext, canScrollPrev, canScrollNext, orientation }}>
        <div ref={ref} className={cn('relative', className)} role="region" aria-roledescription="carousel" {...props}>
          {children}
        </div>
      </CarouselContext.Provider>
    );
  }
);
Carousel.displayName = 'Carousel';

const CarouselContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { carouselRef, orientation } = useCarousel();
  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn('flex', orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col', className)}
        {...props}
      />
    </div>
  );
});
CarouselContent.displayName = 'CarouselContent';

const CarouselItem = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { orientation } = useCarousel();
  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn('min-w-0 shrink-0 grow-0 basis-full', orientation === 'horizontal' ? 'pl-4' : 'pt-4', className)}
      {...props}
    />
  );
});
CarouselItem.displayName = 'CarouselItem';

const CarouselPrevious = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(({ className, variant = 'outline', size = 'icon', ...props }, ref) => {
  const { scrollPrev, canScrollPrev } = useCarousel();
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn('absolute h-8 w-8 rounded-full', 'left-[-12px] top-1/2 -translate-y-1/2', className)}
      onClick={scrollPrev}
      disabled={!canScrollPrev}
      {...props}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      <span className="sr-only">Previous slide</span>
    </Button>
  );
});
CarouselPrevious.displayName = 'CarouselPrevious';

const CarouselNext = forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(({ className, variant = 'outline', size = 'icon', ...props }, ref) => {
  const { scrollNext, canScrollNext } = useCarousel();
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn('absolute h-8 w-8 rounded-full', 'right-[-12px] top-1/2 -translate-y-1/2', className)}
      onClick={scrollNext}
      disabled={!canScrollNext}
      {...props}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      <span className="sr-only">Next slide</span>
    </Button>
  );
});
CarouselNext.displayName = 'CarouselNext';


// --- Main Component ---

interface CommitteeMember {
    _id: string;
    name: string;
    designation: string;
    profile_description: string;
    mobile_prefix: string;
    phone_number: string;
    image: string;
    preview_order?: number | null;
    view_order?: number | null;
}

/**
 * Used to fetch the list of committee members from the API.
 * @returns A promise that resolves to an array of CommitteeMember objects.
 */
const fetchCommitteeMembers = async (): Promise<CommitteeMember[]> => {
    const data = await get<CommitteeMember[]>('/committee/');
    return data;
};

/**
 * Used to render a reusable card for a single committee member for the desktop view.
 */
const MemberCard = ({ member }: { member: CommitteeMember }) => (
    <div className="text-center flex-shrink-0 transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.02]">
        <div className="w-32 h-32 mx-auto rounded-full overflow-hidden border-4 border-primary/20 shadow-sm ring-0 hover:ring-2 hover:ring-primary/40 transition">
            {member.image ? (
                <ImageWithBlur
                    src={resolveImageUrl(member.image)}
                    alt={member.name}
                    className="w-full h-full"
                />
            ) : (
                <div className="w-full h-full bg-muted" />
            )}
        </div>
        <div className="mt-3">
            <div className="text-lg font-semibold">{member.name}</div>
            <div className="text-sm text-muted-foreground">{member.designation}</div>
        </div>
    </div>
);


const CommitteeSection = () => {
    const navigate = useNavigate();
    const { data: members, isLoading } = useQuery<CommitteeMember[]>({
        queryKey: ['committeeMembers'],
        queryFn: fetchCommitteeMembers,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
    });
    
    // States for the carousel
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);

    const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
    const { ref: featuredRef, isVisible: featuredVisible } = useScrollAnimation();
    const { ref: gridRef, isVisible: gridVisible } = useScrollAnimation();

    // Memoize derived member lists to prevent re-creating them on every render.
    // This is crucial for the useEffect below to have stable dependencies, fixing the slideshow bug.
    const { previewList, mainMember, otherMembers } = useMemo(() => {
        const memberList = members ?? [];

        const orderedPreview = memberList
            .slice()
            .sort((a, b) => {
                const ao = a.preview_order ?? Number.POSITIVE_INFINITY;
                const bo = b.preview_order ?? Number.POSITIVE_INFINITY;
                if (ao !== bo) return ao - bo;
                return a.name.localeCompare(b.name);
            })
            .filter((m) => (m.preview_order ?? Infinity) !== Infinity)
            .slice(0, 7);

        const pList = orderedPreview.length > 0 ? orderedPreview : memberList.slice(0, 7);

        if (pList.length === 0) {
            return { previewList: [], mainMember: null, otherMembers: [] };
        }

        const idxFeatured = pList.findIndex(m => (m.preview_order ?? 0) === 1);
        const main = idxFeatured >= 0 ? pList[idxFeatured] : pList[0];
        
        const others = (main
            ? pList.filter(m => m._id !== main._id)
            : pList).sort((a, b) => (a.preview_order ?? Number.POSITIVE_INFINITY) - (b.preview_order ?? Number.POSITIVE_INFINITY));

        return { previewList: pList, mainMember: main, otherMembers: others };
    }, [members]);


    useEffect(() => {
        if (!api) return;

        // Set initial slide to the featured member
        const featuredIndex = mainMember ? previewList.findIndex(m => m._id === mainMember._id) : -1;

        if (featuredIndex !== -1) {
            setCurrent(featuredIndex);
            api.scrollTo(featuredIndex, true);
        }

        const handleSelect = () => {
            setCurrent(api.selectedScrollSnap());
        };
        api.on('select', handleSelect);
        return () => {
            api.off('select', handleSelect);
        };
    }, [api, previewList, mainMember]);


    return (
        <section className="py-10 px-6" id="committee">
            <div className="max-w-screen-2xl mx-auto bg-transparent rounded-xl p-6 sm:p-8 lg:p-12 temple-section-frame transparent-bg">
                <div className="max-w-7xl mx-auto">
                    {isLoading ? (
                        // Polished skeleton loader wrapped in the same structure
                        <>
                            <div className="text-center mb-16">
                                <div className="h-8 w-80 mx-auto bg-muted animate-pulse rounded" />
                                <div className="h-4 w-[36rem] max-w-full mx-auto mt-4 bg-muted animate-pulse rounded" />
                            </div>
                            <div className="flex justify-center mb-16">
                                <div className="text-center">
                                    <div className="w-40 h-40 mx-auto rounded-full bg-muted animate-pulse" />
                                    <div className="mt-4 h-6 w-48 mx-auto bg-muted animate-pulse rounded" />
                                    <div className="mt-2 h-4 w-40 mx-auto bg-muted animate-pulse rounded" />
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-10 md:gap-x-20">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="text-center">
                                        <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
                                        <div className="mt-3 h-5 w-24 mx-auto bg-muted animate-pulse rounded" />
                                        <div className="mt-2 h-4 w-20 mx-auto bg-muted animate-pulse rounded" />
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        // Main component content
                        <>
                            <div ref={headerRef} className={`text-center mb-16 ${headerVisible ? 'animate-fade-in-up' : ''}`}>
                                <h2 className="temple-heading-xl">Our <span className="sub">Committee</span></h2>
                                <div className="temple-heading-divider" />
                                <p className="mt-6 text-amber-900/90 text-lg leading-relaxed max-w-3xl mx-auto">
                                    Meet the dedicated individuals who guide and support our temple community with wisdom and devotion.
                                </p>
                            </div>
                            
                            {/* --- Desktop View --- */}
                            <div className="hidden lg:block">
                                {mainMember && (
                                    <div ref={featuredRef} className={`flex justify-center mb-16 ${featuredVisible ? 'animate-scale-in' : ''}`}>
                                        <div className="text-center transition-transform duration-300 hover:-translate-y-1">
                                            <div className="w-40 h-40 mx-auto rounded-full overflow-hidden border-4 border-primary shadow-lg ring-0 hover:ring-2 hover:ring-primary/40 transition temple-pulse-ring">
                                                <ImageWithBlur src={resolveImageUrl(mainMember.image)} alt={mainMember.name} className="w-full h-full" />
                                            </div>
                                            <div className="mt-4">
                                                <div className="text-2xl font-bold">{mainMember.name}</div>
                                                <div className="text-md text-primary font-semibold">{mainMember.designation}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {otherMembers && otherMembers.length > 0 && (
                                    <div ref={gridRef} className="flex flex-wrap justify-center gap-10 md:gap-x-20">
                                        {otherMembers.map((member, idx) => (
                                            <div key={member._id} className={`${gridVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: `${idx * 0.12}s`}}>
                                                <MemberCard member={member} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- Mobile & Tablet View --- */}
                            <div className="lg:hidden">
                                <Carousel setApi={setApi} opts={{ align: 'center', loop: true }} className="w-full max-w-4xl mx-auto">
                                    <CarouselContent className="-ml-2">
                                        {previewList.map((member, index) => (
                                            // Updated: Changed basis to show 2-3 members on smaller screens
                                            <CarouselItem key={member._id} className="pl-2 basis-1/2 md:basis-1/3">
                                                <div className="p-1">
                                                     <div className={cn("text-center transition-all duration-300 ease-in-out", current === index ? "scale-100" : "scale-90 opacity-60")}>
                                                        {/* Updated: Reduced size of the circle container for smaller viewports */}
                                                        <div className={cn(
                                                            "w-28 h-28 sm:w-32 sm:h-32 mx-auto rounded-full overflow-hidden border-4 shadow-md transition-all duration-300",
                                                            current === index ? "border-primary shadow-primary/40 shadow-lg" : "border-primary/20"
                                                        )}>
                                                            <ImageWithBlur src={resolveImageUrl(member.image)} alt={member.name} className="w-full h-full" />
                                                        </div>
                                                        <div className="mt-4">
                                                            <div className="text-xl font-bold">{member.name}</div>
                                                            <div className={cn(
                                                                "text-md font-semibold transition-colors",
                                                                current === index ? "text-primary" : "text-muted-foreground"
                                                            )}>{member.designation}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CarouselItem>
                                        ))}
                                    </CarouselContent>
                                    <div className="hidden sm:block">
                                        <CarouselPrevious />
                                        <CarouselNext />
                                    </div>
                                </Carousel>
                            </div>


                            <div className="mt-16 text-center">
                                {/* Updated: Added responsive width classes to prevent overflow */}
                                <Button className="btn-divine w-full max-w-sm mx-auto sm:w-auto sm:max-w-none" onClick={() => navigate('/committee')}>
                                    View All Committee Members
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
};

export default CommitteeSection;
