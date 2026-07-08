import { Calendar, Bell, Clock } from 'lucide-react';
import templeHero from '@/assets/temple-hero.jpg';
import { Link } from 'react-router-dom';

const HeroSection = () => {
  return (
  <section className="temple-hero-outer overflow-hidden">
    {/* Background image */}
    <div className="absolute inset-0">
      <img src={templeHero} alt="Sacred Temple" className="w-full h-full object-cover object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,10,2,0.75),rgba(80,30,5,0.55)60%,rgba(120,60,10,0.7))]" />
    </div>
    <div className="temple-hero-arch animate-fade-in-up">
      <div className="relative z-10 max-w-5xl mx-auto text-center px-4 md:px-10 pt-16 md:pt-0">
        <h1 className="text-3xl md:text-7xl font-playfair font-bold leading-tight mb-6 gold-glow-text">
          Vamanakulangara
          <span className="block text-2xl md:text-6xl mt-3 tracking-wide gold-glow-text">Vishnu Temple</span>
        </h1>
        <p className="text-lg md:text-2xl text-amber-50/90 max-w-3xl mx-auto leading-relaxed mb-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
          A sacred sanctuary of devotion, tradition and divine grace. Book rituals, explore festivals and experience serenity.
        </p>
        <div className="flex flex-col md:flex-row items-center justify-center gap-5 mb-14">
          <Link to="/ritual-booking" className="temple-btn-primary temple-pulse-ring">
            <Calendar className="h-5 w-5 inline mr-2" /> Book Ritual
          </Link>
          <Link to="/events" className="temple-btn-primary bg-gradient-to-r from-[#c87a04] via-[#dca723] to-[#f7d264]">
            <Bell className="h-5 w-5 inline mr-2" /> Upcoming Events
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="temple-card-translucent rounded-xl p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-amber-700" />
            <p className="text-sm font-semibold">Morning</p>
            <p className="text-xs tracking-wide">5:00 AM – 12:00 PM</p>
          </div>
          <div className="temple-card-translucent rounded-xl p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-amber-700" />
            <p className="text-sm font-semibold">Evening</p>
            <p className="text-xs tracking-wide">4:00 PM – 9:00 PM</p>
          </div>
          <div className="temple-card-translucent rounded-xl p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-amber-700" />
            <p className="text-sm font-semibold">Festival Days</p>
            <p className="text-xs tracking-wide">Extended Seva Timings</p>
          </div>
        </div>
        <div className="temple-divider-gold" />
      </div>
    </div>
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center text-amber-200/70 text-xs tracking-wider">
      <div className="w-7 h-12 rounded-full border-2 border-amber-300/50 flex items-start justify-center p-1 animate-pulse"><div className="w-1.5 h-3 rounded-full bg-amber-300/80"/></div>
      <span className="mt-2">SCROLL</span>
    </div>
  </section>
  );
};

export default HeroSection;