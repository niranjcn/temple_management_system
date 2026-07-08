import React from 'react';
import VideoIntro from '@/components/VideoIntro';
import Door from '@/components/Door';
import Index from './Index';

/**
 * HomePage wraps the existing Index (landing) page with:
 * 1. Video intro (entry.mp4) - plays on every page load
 * 2. Door entrance animation - shows after video ends
 * 3. Main content (Index) - the actual landing page
 * 
 * This file is intentionally separate so we don't modify App.tsx or main.tsx directly.
 */
const HomePage: React.FC = () => {
  return (
    <>
      <VideoIntro />
      <Index />
    </>
  );
};

export default HomePage;
