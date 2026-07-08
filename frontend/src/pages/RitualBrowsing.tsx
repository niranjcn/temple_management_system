import React, { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../api/api';
import { ArrowLeft, Flame, Flower2, Heart, Star, LucideProps } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';


// --- Type Definitions ---
interface ApiRitual {
  _id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
	icon?: string;
	icon_name?: string;
  booking_start_time?: string;
  booking_end_time?: string;
  employee_only?: boolean;
  available_from?: string;
  available_to?: string;
}
interface Ritual extends ApiRitual {
  id: string;
}

const iconMap: { [key: string]: React.FC<LucideProps> } = {
  Flame,
  Flower2,
  Heart,
  Star,
};
const RitualIcon = ({ name, ...props }: { name: string } & LucideProps) => {
    const IconComponent = iconMap[name] || Star;
    return <IconComponent {...props} />;
};

const fetchRituals = async (): Promise<Ritual[]> => {
	const data = await get<ApiRitual[]>('/rituals/all');
	return data.map(r => ({ ...r, id: r._id }));
};

const RitualBrowsing = () => {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

    const { data: rituals = [], isLoading } = useQuery({
        queryKey: ['rituals'],
        queryFn: fetchRituals,
    });

	const publicRituals = useMemo(() => rituals.filter(r => !r.employee_only), [rituals]);

	const handleBookRitual = (ritualId: string) => {
		// Navigate back to ritual booking with scroll param
		navigate('/ritual-booking?scroll=selected&add=' + ritualId);
	};

	return (
		<div className="min-h-screen bg-gradient-sacred py-20">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mb-8">
					<Link to="/ritual-booking" className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
						<ArrowLeft className="h-5 w-5 mr-2" />
						Back to Ritual Booking
					</Link>
					<h1 className="text-4xl font-playfair font-bold text-foreground mb-2">
						Browse <span className="text-primary">All Rituals</span>
					</h1>
					<p className="text-muted-foreground">Explore all available rituals in detail</p>
				</div>

				<div className="space-y-6">
					{isLoading ? (
						Array.from({ length: 6 }).map((_, i) => (
							<div
								key={`browse-skeleton-${i}`}
								className="rounded-lg border border-primary/20 p-6 h-48 bg-slate-200 animate-pulse w-full"
							/>
						))
					) : (
						publicRituals.map((ritual) => (
							<div
								key={`browse-${ritual.id}`}
								className="
									rounded-lg
									border border-primary/20
									p-4 sm:p-6
									bg-card/50
									w-full
									overflow-hidden
								"
							>
								<div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
									{/* Left Side: Icon + Name */}
									<div className="flex items-start gap-3 min-w-0 flex-1">
										<RitualIcon
											name={(ritual.icon_name || ritual.icon || 'Star') as string}
											className="h-6 w-6 text-primary flex-shrink-0 mt-1"
										/>
										<h3 className="text-lg sm:text-xl font-medium text-foreground">
											{ritual.name}
										</h3>
									</div>

									{/* Right Side: Price + Duration */}
									<div className="text-left sm:text-right flex-shrink-0">
										<div className="text-lg sm:text-xl font-semibold text-primary">
											₹{ritual.price}
										</div>
										<div className="text-sm text-muted-foreground">
											Duration: {ritual.duration} hour(s)
										</div>
									</div>
								</div>

								<p className="text-sm sm:text-base text-muted-foreground mb-4 break-words">
									{ritual.description}
								</p>

								<div className="grid grid-cols-1 gap-4 mb-6 w-full text-sm">
									{ritual.booking_start_time && ritual.booking_end_time && (
										<div className="break-words">
											<span className="font-medium text-foreground">
												Booking Window:
											</span>
											<span className="text-muted-foreground ml-2">
												{ritual.booking_start_time} - {ritual.booking_end_time}
											</span>
										</div>
									)}
									{(ritual.available_from || ritual.available_to) && (
										<div className="break-words">
											<span className="font-medium text-foreground">
												Availability:
											</span>
											<span className="text-muted-foreground ml-2">
												{ritual.available_from || 'N/A'} to {ritual.available_to || 'N/A'}
											</span>
										</div>
									)}
								</div>

								<div className="flex justify-end">
									<Button
										onClick={() => handleBookRitual(ritual.id)}
										className="btn-divine w-full sm:w-auto"
									>
										Book this Ritual
									</Button>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
};

export default RitualBrowsing;