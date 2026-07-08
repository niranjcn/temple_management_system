import React, { useState, useEffect, useRef } from 'react';
import entryVideo from '@/assets/entry.mp4';

interface VideoIntroProps {
  onVideoEnd?: () => void;
}

/**
 * VideoIntro Component
 * Plays the entry.mp4 video on every page load/refresh
 * 
 * Performance Notes:
 * - Video is loaded on-demand (not preloaded in initial bundle)
 * - Uses native HTML5 video player for optimal performance
 * - Auto-removes from DOM after completion
 */
const VideoIntro: React.FC<VideoIntroProps> = ({ onVideoEnd }) => {
  const [isVideoComplete, setIsVideoComplete] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Handle video loaded event
    const handleLoadedData = () => {
      console.log('Video loaded successfully');
      setIsVideoLoaded(true);
    };

    // Handle when video can play
    const handleCanPlay = () => {
      console.log('Video can play');
      setIsVideoLoaded(true);
      
      // Try to autoplay
      const playPromise = video.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Video autoplay started');
            setIsVideoPlaying(true);
            setShowPlayButton(false);
          })
          .catch((error) => {
            console.warn('Video autoplay prevented:', error);
            // Show play button instead of skipping
            setShowPlayButton(true);
          });
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);

    // Force load the video
    video.load();

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  const handleVideoEnd = () => {
    console.log('Video ended');
    // Fade out effect before hiding
    setFadeOut(true);
    
    setTimeout(() => {
      setIsVideoComplete(true);
      setIsVideoPlaying(false);
      onVideoEnd?.();
    }, 500); // 500ms fade out duration
  };

  const handleSkip = () => {
    console.log('Video skipped');
    if (videoRef.current) {
      videoRef.current.pause();
    }
    handleVideoEnd();
  };

  const handleManualPlay = () => {
    const video = videoRef.current;
    if (video) {
      video.play()
        .then(() => {
          console.log('Manual play started');
          setIsVideoPlaying(true);
          setShowPlayButton(false);
        })
        .catch((error) => {
          console.error('Manual play failed:', error);
        });
    }
  };

  // Don't render anything if video was already watched
  if (isVideoComplete) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-[150] bg-black flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      aria-label="Welcome video"
      role="dialog"
      aria-modal="true"
    >
      {/* Video Player */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        onEnded={handleVideoEnd}
        playsInline
        muted={true} // Muted to allow autoplay on all browsers
        preload="auto"
        controls={false}
      >
        <source src={entryVideo} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Loading indicator - only show when video is NOT loaded */}
      {!isVideoLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin"></div>
            <div className="text-amber-400 text-lg font-medium">Loading Video...</div>
          </div>
        </div>
      )}

      {/* Manual Play Button - shown if autoplay is blocked */}
      {isVideoLoaded && showPlayButton && (
        <button
          onClick={handleManualPlay}
          className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm hover:bg-black/70 transition-all duration-300 cursor-pointer group"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-amber-500/90 flex items-center justify-center group-hover:bg-amber-400 group-hover:scale-110 transition-all duration-300 shadow-2xl">
              <svg 
                className="w-12 h-12 text-white ml-2" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span className="text-white text-xl font-medium">Click to Play Video</span>
          </div>
        </button>
      )}

      {/* Skip Button - only show when video is playing */}
      {isVideoPlaying && !showPlayButton && (
        <button
          onClick={handleSkip}
          className="absolute top-8 right-8 px-6 py-3 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-400/60 z-10"
          style={{
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <span className="flex items-center gap-2">
            <span>Skip Intro</span>
            <span className="text-xl">→</span>
          </span>
        </button>
      )}
    </div>
  );
};

export default VideoIntro;
