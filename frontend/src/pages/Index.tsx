import Navigation from '@/components/Navigation';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import HeroSection from '@/components/HeroSection';
import TempleOverview from '@/components/TempleOverview';
import RitualSection from '@/components/RitualSection';
import EventSection from '@/components/EventSection';
import GalleryPreview from '@/components/GalleryPreview';
import CommitteeSection from '@/components/CommitteeSection';
import Footer from '@/components/Footer';
import ContactSection from '@/components/ContactSection';
import ScrollToTop from '@/components/ScrollToTop';
import ScrollProgress from '@/components/ScrollProgress';
import TempleSectionFrame from '@/components/TempleSectionFrame';
import GoldenDivider from '../components/GoldenDivider';

const Index = () => {
  const location = useLocation() as any;
  const fromAdmin: string | undefined = location.state?.fromAdmin;
  useEffect(() => {
    const target = location.state?.scrollTo as string | undefined;
    if (target) {
      const el = document.getElementById(target);
      if (el) {
        // small timeout to ensure layout is ready
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    }
  }, [location.state]);
  return (
  <div className="min-h-screen overflow-x-hidden no-scrollbar temple-canvas">
      <ScrollProgress />
      <Navigation />
      {fromAdmin && (
        <div className="fixed top-24 left-4 z-40">
          <Link to={fromAdmin} state={undefined} className="inline-flex items-center text-primary hover:text-primary/80">
            {/* simple chevron */}
            <span className="mr-2">←</span>
            Back to Admin
          </Link>
        </div>
      )}
  <main className="overflow-x-hidden golden-text-scheme">
        <div id="home" className="scroll-offset">
          <HeroSection />
        </div>
        <TempleSectionFrame id="about" background="transparent" className="transparent-bg" accent seamless>
          <TempleOverview />
        </TempleSectionFrame>
        <GoldenDivider />
        <TempleSectionFrame id="rituals" background="transparent" className="transparent-bg" accent seamless>
          <RitualSection />
        </TempleSectionFrame>
        <GoldenDivider subtle />
        <TempleSectionFrame id="events" background="transparent" className="transparent-bg" seamless>
          <EventSection />
        </TempleSectionFrame>
        <GoldenDivider />
        <TempleSectionFrame id="gallery" background="transparent" className="transparent-bg" accent seamless>
          <GalleryPreview />
        </TempleSectionFrame>
        <GoldenDivider subtle />
        <TempleSectionFrame id="committee" background="transparent" className="transparent-bg" seamless>
          <CommitteeSection />
        </TempleSectionFrame>
        <GoldenDivider />
        <TempleSectionFrame id="contact" background="transparent" className="transparent-bg" accent seamless>
          <ContactSection />
        </TempleSectionFrame>
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
};

export default Index;