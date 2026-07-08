import React from 'react';
import EventSection from '@/components/EventSection';

const EventsSectionPreview = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto py-10 px-6">
        <h1 className="text-3xl font-bold mb-6">Homepage Events Section Preview</h1>
        <p className="text-muted-foreground mb-8">This preview shows exactly which events will appear on the homepage events section.</p>
        <EventSection />
      </div>
    </div>
  );
};

export default EventsSectionPreview;
