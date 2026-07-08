import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/api';
import { ArrowLeft, Calendar, Clock, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { resolveImageUrl } from '@/lib/utils';

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

// Fetch a single event by its ID
const fetchEventById = (id: string) => get<Event>(`/events/${id}`);

const EventDetails = () => {
  const { id } = useParams<{ id: string }>();

  const { data: event, isLoading, isError } = useQuery<Event>({
    queryKey: ['event', id],
    queryFn: () => fetchEventById(id!),
    enabled: !!id, // Only run the query if the id exists
  });

  if (isLoading) {
    return <div className="text-center py-20">Loading event details...</div>;
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-gradient-sacred py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-playfair font-bold mb-4">Event Not Found</h1>
          <Link to="/events" className="btn-divine">
            Return to All Events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-sacred py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/events" className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to All Events
          </Link>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-playfair font-bold text-foreground mb-4">
                {event.title}
              </h1>
              <div className="flex flex-wrap gap-4 text-muted-foreground mb-4">
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-primary" />
                  {new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div className="flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-primary" />
                  {event.time}
                </div>
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-primary" />
                  {event.location}
                </div>
              </div>
            </div>
            <div className="relative">
              <img
                src={resolveImageUrl(event.image)}
                alt={event.title}
                className="w-full h-64 object-cover rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>

        <Card className="card-divine p-6">
          <h2 className="text-2xl font-playfair font-semibold mb-4 text-foreground">
            About This Event
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {event.description}
          </p>
        </Card>
      </div>
    </div>
  );
};

export default EventDetails;
