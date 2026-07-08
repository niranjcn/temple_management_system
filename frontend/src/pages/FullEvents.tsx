import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, API_BASE_URL } from '../api/api';
import { resolveImageUrl } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Calendar, Clock, MapPin } from 'lucide-react';

// Define the shape of an event object
interface Event {
  _id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
}
interface FeaturedEvent { event_id: string | null }

// Fetch all events
const fetchEvents = () => get<Event[]>('/events/');

const FullEvents = () => {
  const location = useLocation() as any;
  const fromAdmin: string | undefined = location.state?.fromAdmin;
  const { data: events, isLoading, isError } = useQuery<Event[]>({
    queryKey: ['events'],
    queryFn: fetchEvents,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  const { data: featured } = useQuery<FeaturedEvent>({
    queryKey: ['featuredEvent'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/featured-event/`);
      if (!res.ok) return { event_id: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  if (isLoading) return <div className="text-center py-20">Loading events...</div>;
  if (isError) return <div className="text-center py-20">Error fetching events.</div>;

  return (
    <div className="min-h-screen temple-canvas py-20 relative overflow-hidden">
      {/* Hanging temple lamps - desktop only */}
      <div className="hidden md:block absolute -top-6 -left-2 z-0 pointer-events-none">
        <svg width="150" height="240" viewBox="0 0 150 240" xmlns="http://www.w3.org/2000/svg" className="swing-gentle">
          {/* chain */}
          <line x1="75" y1="0" x2="75" y2="80" stroke="rgba(255,210,120,0.75)" strokeWidth="2"/>
          <line x1="75" y1="0" x2="75" y2="80" stroke="rgba(190,120,30,0.8)" strokeWidth="0.8"/>
          {/* bracket */}
          <rect x="60" y="80" width="30" height="6" rx="3" fill="rgba(200,130,40,0.9)" />
          {/* dish */}
          <ellipse cx="75" cy="150" rx="55" ry="16" fill="#6b3a0a" opacity="0.55"/>
          <path d="M20 140 C45 165,105 165,130 140 C120 150,30 150,20 140 Z" fill="#d4952b" stroke="#8a5a18" strokeWidth="2"/>
          {/* stand */}
          <rect x="71" y="86" width="8" height="56" fill="#a66b1d"/>
          {/* flames */}
          <g>
            <path d="M55 140 C58 132,62 132,64 140 C64 146,56 146,55 140 Z" fill="#ffce54"/>
            <path d="M74 138 C77 130,81 130,83 138 C83 144,75 144,74 138 Z" fill="#ffd978"/>
            <path d="M95 140 C98 132,102 132,104 140 C104 146,96 146,95 140 Z" fill="#ffce54"/>
          </g>
        </svg>
      </div>
      <div className="hidden md:block absolute -top-6 -right-2 z-0 pointer-events-none">
        <svg width="150" height="240" viewBox="0 0 150 240" xmlns="http://www.w3.org/2000/svg" className="swing-gentle">
          {/* chain */}
          <line x1="75" y1="0" x2="75" y2="80" stroke="rgba(255,210,120,0.75)" strokeWidth="2"/>
          <line x1="75" y1="0" x2="75" y2="80" stroke="rgba(190,120,30,0.8)" strokeWidth="0.8"/>
          {/* bracket */}
          <rect x="60" y="80" width="30" height="6" rx="3" fill="rgba(200,130,40,0.9)" />
          {/* dish */}
          <ellipse cx="75" cy="150" rx="55" ry="16" fill="#6b3a0a" opacity="0.55"/>
          <path d="M20 140 C45 165,105 165,130 140 C120 150,30 150,20 140 Z" fill="#d4952b" stroke="#8a5a18" strokeWidth="2"/>
          {/* stand */}
          <rect x="71" y="86" width="8" height="56" fill="#a66b1d"/>
          {/* flames */}
          <g>
            <path d="M55 140 C58 132,62 132,64 140 C64 146,56 146,55 140 Z" fill="#ffce54"/>
            <path d="M74 138 C77 130,81 130,83 138 C83 144,75 144,74 138 Z" fill="#ffd978"/>
            <path d="M95 140 C98 132,102 132,104 140 C104 146,96 146,95 140 Z" fill="#ffce54"/>
          </g>
        </svg>
      </div>
  <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 golden-text-scheme">
        <div className="mb-12">
            <Link to={fromAdmin || "/"} state={undefined} className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
                <ArrowLeft className="h-5 w-5 mr-2" />
                {fromAdmin ? 'Back to Admin' : 'Back to Home'}
            </Link>
            <h1 className="text-4xl md:text-5xl font-playfair font-bold text-center text-foreground">
                All Upcoming <span className="text-primary">Events</span>
            </h1>
            <p className="text-xl text-center text-muted-foreground max-w-3xl mx-auto mt-4">
                Explore our diverse range of spiritual and community events. Click on any event to learn more.
            </p>
        </div>

        {/* Featured event centered */}
        {featured?.event_id && (events || []).some(e => e._id === featured.event_id) && (
          <div className="mb-16">
            {(() => {
              const ev = (events || []).find(e => e._id === featured.event_id)!;
              return (
                <Link to={`/events/${ev._id}`} className="block group">
                  <Card className="relative overflow-hidden rounded-2xl border-2 !border-amber-400/70 shadow-xl shadow-[0_20px_40px_-20px_rgba(255,200,120,0.35)]">
                    <div className="relative h-[420px]">
                      <img src={resolveImageUrl(ev.image)} alt={ev.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                      <span className="absolute top-4 left-4 bg-orange-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow">Featured</span>
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <h3 className="text-4xl font-playfair font-bold text-white drop-shadow mb-2">{ev.title}</h3>
                        <p className="text-slate-100/90 mb-4 max-w-3xl">{ev.description}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-orange-300">
                          <div className="flex items-center"><Calendar className="h-4 w-4 mr-2 text-orange-300" /><span>{new Date(ev.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
                          <div className="flex items-center"><Clock className="h-4 w-4 mr-2 text-orange-300" /><span>{ev.time}</span></div>
                          <div className="flex items-center"><MapPin className="h-4 w-4 mr-2 text-orange-300" /><span>{ev.location}</span></div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })()}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {(events || [])
            .filter(e => e._id !== (featured?.event_id || ''))
            .map((event) => (
            <Link to={`/events/${event._id}`} key={event._id} className="block group">
              <Card className="card-divine h-full flex flex-col overflow-hidden transform transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl !border-amber-300/50 hover:!border-amber-400/60 shadow-[0_8px_25px_-10px_rgba(255,200,100,0.25)]">
                <div className="relative h-56">
                  <img
                    src={resolveImageUrl(event.image)}
                    alt={event.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-2xl font-playfair font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {event.title}
                  </h3>
                  <p className="text-muted-foreground mb-4 flex-grow">{event.description}</p>
                  <div className="border-t border-amber-300/40 pt-4 mt-auto space-y-2 text-sm">
                    <div className="flex items-center text-primary/90">
                      <Calendar className="h-4 w-4 mr-2 text-primary" />
                      <span>{new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center text-primary/90">
                      <Clock className="h-4 w-4 mr-2 text-primary" />
                      <span>{event.time}</span>
                    </div>
                     <div className="flex items-center text-primary/90">
                      <MapPin className="h-4 w-4 mr-2 text-primary" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FullEvents;
