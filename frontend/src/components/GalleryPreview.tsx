import { ExternalLink, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, API_BASE_URL } from '../api/api';
import { resolveImageUrl } from '../lib/utils';
import React, { useEffect, useMemo, useState } from 'react';
import ImageWithBlur from '@/components/ImageWithBlur';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

interface GalleryImage {
	_id: string;
	src: string;
	title: string;
	category: string;
}

/**
 * Fetches gallery images from the API.
 * @returns {Promise<GalleryImage[]>} A promise that resolves to an array of gallery images.
 */
const fetchGalleryImages = () => get<GalleryImage[]>('/gallery/');


const GalleryPreview = () => {
	const { data: galleryImages, isLoading, isError } = useQuery<GalleryImage[]>({
		queryKey: ['galleryPreview'],
		queryFn: fetchGalleryImages,
		select: (data) => data,
	});
	const imagesById = useMemo(() => Object.fromEntries((galleryImages || []).map(i => [i._id, i])), [galleryImages]);

	const { data: homeConfig } = useQuery<{ _id?: string; slots: (string | null)[] }>({
		queryKey: ['galleryHomePreview'],
		queryFn: async () => {
			try {
				return await get<{ _id?: string; slots: (string | null)[] }>('/gallery-home-preview/');
			} catch (e) {
				return { slots: [null, null, null, null, null, null] };
			}
		},
	});
	const slots = (homeConfig?.slots || [null, null, null, null, null, null]) as (string | null)[];

	const slotImage = (idx: number): GalleryImage | null => {
		const id = slots[idx];
		if (!id) return null;
		return imagesById[id] ?? null;
	};

	const Slot = ({ idx, size }: { idx: number; size: 'lg' | 'md' | 'sm' }) => {
		const img = slotImage(idx);
		const base = size === 'lg' ? 'h-72 md:h-[420px]' : size === 'md' ? 'h-48 md:h-52' : 'h-40';
		return (
			<div className={`relative rounded-lg overflow-hidden border-2 border-primary/30 bg-transparent ${base}`}>
				{img ? (
					<ImageWithBlur
						src={resolveImageUrl(img.src)}
						alt={img.title}
						className="w-full h-full"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-sm text-purple-300/80">
						Empty slot
					</div>
				)}
				<div className="absolute top-2 left-2 bg-gradient-golden text-secondary-foreground px-2 py-0.5 rounded-full text-[10px] font-medium">
					{size === 'lg' ? 'Featured' : size === 'md' ? 'Highlighted' : 'Gallery'}
				</div>
			</div>
		);
	};

	const { ref: headerRef, isVisible: headerVisible } = useScrollAnimation();
	const { ref: topRef, isVisible: topVisible } = useScrollAnimation();
	const { ref: bottomRef, isVisible: bottomVisible } = useScrollAnimation();

	return (
		// 1. Main wrapper with reduced vertical space
	    <section className="py-10 px-6">
		    {/* 2. The visible outline container - replaced red debug border with temple frame */}
		    <div className="max-w-screen-2xl mx-auto bg-transparent rounded-xl p-6 sm:p-8 lg:p-12 temple-section-frame transparent-bg">
				{/* 3. The content container */}
				<div className="max-w-7xl mx-auto">
					
					{/* Section Header */}
					<div ref={headerRef} className={`text-center mb-16 ${headerVisible ? 'animate-fade-in-up' : ''}`}>
						<h2 className="temple-heading-xl">Sacred <span className="sub">Gallery</span></h2>
						<div className="temple-heading-divider" />
						<p className="mt-6 text-amber-900/90 text-lg leading-relaxed max-w-3xl mx-auto">
							Witness the divine beauty and spiritual moments captured during our
							ceremonies, festivals, and daily temple activities.
						</p>
					</div>

					{/* Gallery fixed slots */}
					{isLoading && <p className="text-center">Loading gallery...</p>}
					{isError && <p className="text-center text-red-500">Error loading gallery.</p>}
					{!isLoading && !isError && (
						<div className="space-y-6 max-h-[70vh] overflow-y-auto md:max-h-none md:overflow-visible pr-2 md:pr-0">
							{/* Top area: 1 large + 2 medium */}
							<div ref={topRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
								<div className={`md:col-span-2 ${topVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0s'}}>
									<Slot idx={0} size="lg" />
								</div>
								<div className="space-y-6">
									<div className={`${topVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0.15s'}}>
										<Slot idx={1} size="md" />
									</div>
									<div className={`${topVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0.3s'}}>
										<Slot idx={2} size="md" />
									</div>
								</div>
							</div>
							{/* Bottom area: 3 small centered */}
							<div ref={bottomRef} className="flex flex-wrap items-stretch justify-center gap-6">
								<div className={`w-full md:w-auto md:flex-1 md:max-w-sm ${bottomVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0s'}}><Slot idx={3} size="sm" /></div>
								<div className={`w-full md:w-auto md:flex-1 md:max-w-sm ${bottomVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0.15s'}}><Slot idx={4} size="sm" /></div>
								<div className={`w-full md:w-auto md:flex-1 md:max-w-sm ${bottomVisible ? 'animate-scale-in' : ''}`} style={{animationDelay: '0.3s'}}><Slot idx={5} size="sm" /></div>
							</div>
						</div>
					)}
					{/* CTA */}
					<div className="text-center mt-12">
						<Link
							to="/gallery"
							className="btn-divine inline-flex items-center gap-2"
						>
							<Camera className="h-5 w-5" />
							View Complete Gallery
						</Link>
					</div>
					
				</div>
			</div>
		</section>
	);
};

export default GalleryPreview;
