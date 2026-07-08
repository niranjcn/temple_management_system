import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api, { get } from '../api/api';
import { toast } from 'sonner';
import { ArrowLeft, Flame, Flower2, Heart, Star, ChevronDown, ChevronUp, LucideProps } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';


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
  is_nakshatrapooja?: boolean;
  nakshatrapooja_color?: string;
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

const NAALS = ['അശ്വതി (Ashwathi)','ഭരണി (Bharani)','കാർത്തിക (Karthika)','രോഹിണി (Rohini)','മകയിരം (Makayiram)','തിരുവാതിര (Thiruvathira)','പുണർതം (Punartham)','പൂയം (Pooyam)','ആയില്യം (Aayilyam)','മകം (Makam)','പൂരം (Pooram)','ഉത്രം (Uthram)','അത്തം (Atham)','ചിത്തിര (Chithira)','ചോതി (Chothi)','വിശാഖം (Vishakham)','അനിഴം (Anizham)','തൃക്കേട്ട (Thrikketta)','മൂലം (Moolam)','പൂരാടം (Pooradam)','ഉത്രാടം (Uthradam)','തിരുവോണം (Thiruvonam)','അവിട്ടം (Avittam)','ചതയം (Chathayam)','പൂരുരുട്ടാതി (Pooruruttathi)','ഉത്തൃട്ടാതി (Uthruttathi)','രേവതി (Revathi)'];
type Subscription = 'one-time' | 'daily' | 'weekly' | 'monthly';
type DateRangeType = 'this_month' | 'this_year' | 'custom_range';

type RitualInstance = {
	id: string;
	ritualId: string;
	devoteeName: string;
	naal: string;
	dob: string;
	subscription: Subscription;
	quantity: number;
	// Nakshatrapooja specific fields
	date_range_type?: DateRangeType;
	custom_range_start?: string;
	custom_range_end?: string;
	naal_count?: number; // Number of naals found in the selected date range
};

const frequencyMultipliers: Record<Subscription, number> = { 'one-time': 1, daily: 30, weekly: 4, monthly: 1 };

const RitualBooking = () => {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
    const { data: rituals = [], isLoading } = useQuery({ 
        queryKey: ['rituals'], 
        queryFn: fetchRituals,
    });
	
	const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });
	const [search, setSearch] = useState('');
	const [instances, setInstances] = useState<RitualInstance[]>([]);
	const [showAllRituals, setShowAllRituals] = useState(false);
	const [gridCols, setGridCols] = useState(1);
	const selectedEntriesRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const updateCols = () => setGridCols(window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1);
		updateCols();
		window.addEventListener('resize', updateCols);
		return () => window.removeEventListener('resize', updateCols);
	}, []);

	useEffect(() => {
		const scroll = searchParams.get('scroll');
		const addRitual = searchParams.get('add');
		if (scroll === 'selected' && addRitual) {
			addInstance(addRitual);
			// Clear the params
			setSearchParams({});
			// Scroll after a short delay to ensure the instance is added
			setTimeout(() => {
				selectedEntriesRef.current?.scrollIntoView({ behavior: 'smooth' });
			}, 100);
		}
	}, [searchParams]);

	const filteredRituals = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return rituals;
		return rituals.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
	}, [search, rituals]);

	const publicRituals = useMemo(() => filteredRituals.filter(r => !r.employee_only), [filteredRituals]);

	const visibleRituals = useMemo(() => {
		const max = showAllRituals ? publicRituals.length : gridCols * 2;
		return publicRituals.slice(0, max);
	}, [publicRituals, showAllRituals, gridCols]);

	const addInstance = (ritualId: string) => {
		const uniqueId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
			? (crypto as any).randomUUID()
			: `${ritualId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
		const ritual = ritualById(ritualId);
		const newInstance: RitualInstance = {
			id: uniqueId,
			ritualId,
			devoteeName: '',
			naal: '',
			dob: '',
			subscription: 'one-time',
			quantity: 1
		};
		
		// Add Nakshatrapooja specific fields if it's a Nakshatrapooja ritual
		if (ritual?.is_nakshatrapooja) {
			newInstance.date_range_type = 'this_month';
			newInstance.custom_range_start = '';
			newInstance.custom_range_end = '';
			newInstance.naal_count = 0;
			// For Nakshatrapooja, subscription is fixed to one-time and quantity is fixed to 1
			newInstance.subscription = 'one-time';
			newInstance.quantity = 1;
		}
		
		setInstances(prev => [...prev, newInstance]);
	};

	const updateInstance = <K extends keyof RitualInstance>(id: RitualInstance['id'], key: K, value: RitualInstance[K]) => {
		setInstances(prev => prev.map(i => (i.id === id ? { ...i, [key]: value } : i)));
	};

	const removeInstance = (id: RitualInstance['id']) => {
		setInstances(prev => prev.filter(i => i.id !== id));
	};

	const ritualById = (id: string) => rituals.find(r => r.id === id)!;
    
	// Function to fetch naal count for Nakshatrapooja rituals
	const fetchNaalCount = async (instance: RitualInstance) => {
		const ritual = ritualById(instance.ritualId);
		if (!ritual?.is_nakshatrapooja || !instance.naal) {
			return 0;
		}

		try {
			const now = new Date();
			let startDate = '';
			let endDate = '';

			if (instance.date_range_type === 'this_month') {
				// Current month
				const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
				const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
				startDate = firstDay.toISOString().split('T')[0];
				endDate = lastDay.toISOString().split('T')[0];
			} else if (instance.date_range_type === 'this_year') {
				// Current year
				startDate = `${now.getFullYear()}-01-01`;
				endDate = `${now.getFullYear()}-12-31`;
			} else if (instance.date_range_type === 'custom_range') {
				if (!instance.custom_range_start || !instance.custom_range_end) {
					return 0;
				}
				startDate = instance.custom_range_start;
				endDate = instance.custom_range_end;
			}

			// Call the backend API to get naal dates in range
			const response = await get<string[]>(
				`/v1/calendar/search-naal-range?naal=${encodeURIComponent(instance.naal)}&start_date=${startDate}&end_date=${endDate}`
			);

			return response.length;
		} catch (error) {
			console.error('Error fetching naal count:', error);
			return 0;
		}
	};

	// Update naal count when relevant fields change
	const updateInstanceWithNaalCount = async (id: RitualInstance['id'], key: keyof RitualInstance, value: any) => {
		updateInstance(id, key, value);
		
		const instance = instances.find(i => i.id === id);
		if (!instance) return;
		
		const ritual = ritualById(instance.ritualId);
		if (ritual?.is_nakshatrapooja) {
			// If changing naal, date_range_type, or custom dates, recalculate naal count
			if (key === 'naal' || key === 'date_range_type' || key === 'custom_range_start' || key === 'custom_range_end') {
				// Create updated instance with new value
				const updatedInstance = { ...instance, [key]: value };
				const count = await fetchNaalCount(updatedInstance);
				updateInstance(id, 'naal_count', count);
			}
		}
	};
    
	const calcInstanceTotal = (i: RitualInstance) => {
        const ritual = ritualById(i.ritualId);
        if (!ritual) return 0;
        
        // For Nakshatrapooja, calculate based on naal_count instead of quantity and subscription
        if (ritual.is_nakshatrapooja) {
            return ritual.price * (i.naal_count || 0);
        }
        
        return ritual.price * i.quantity * frequencyMultipliers[i.subscription];
    }

	const calculateTotal = () => instances.reduce((sum, i) => sum + calcInstanceTotal(i), 0);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setFormData({ ...formData, [e.target.name]: e.target.value });
	};

	const bookingMutation = useMutation({
		mutationFn: (newBooking: any) => api.post('/bookings/', newBooking),
        onSuccess: () => {
            toast.success("Booking successful! Thank you for your devotion.");
            setFormData({ name: '', email: '', phone: '', address: '' });
            setInstances([]);
            setTimeout(() => navigate('/'), 2000);
        },
        onError: () => {
            toast.error("Booking failed. Please check your details and try again.");
        }
    });

    const handleCheckout = () => {
        const total_cost = calculateTotal();
        const bookingPayload = {
            ...formData,
            total_cost,
            booked_by: 'self',
            instances: instances.map(({id, ...rest}) => ({
                ...rest,
                ritualName: ritualById(rest.ritualId)?.name || 'Unknown Ritual'
            }))
        };
        bookingMutation.mutate(bookingPayload);
    };

	const allInstancesValid = instances.every(i => i.devoteeName.trim() && i.naal.trim() && i.dob.trim());
	const canCheckout = instances.length > 0 && allInstancesValid && formData.name && formData.email && formData.phone && formData.address;

	const getBookingStatus = (ritual: ApiRitual) => {
		const start = ritual.booking_start_time;
		const end = ritual.booking_end_time;
		if (!start || !end) return 'open';
		const now = new Date();
		const toMinutes = (t: string) => {
			const [h, m] = t.split(':').map(Number);
			return h * 60 + m;
		};
		const nowM = now.getHours() * 60 + now.getMinutes();
		const sM = toMinutes(start);
		const eM = toMinutes(end);
		if (nowM < sM) return 'upcoming';
		if (nowM >= eM) return 'ended';
		return 'open';
	};

	return (
		<div className="min-h-screen bg-gradient-sacred py-20">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* -- MODIFIED: Header now stacks on mobile -- */}
				<div className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6">
					<div>
						<Link to="/" className="inline-flex items-center text-primary hover:text-primary/80 mb-4"><ArrowLeft className="h-5 w-5 mr-2" />Back to Home</Link>
						<h1 className="text-4xl font-playfair font-bold text-foreground mb-2">Book Your <span className="text-primary">Sacred Ritual</span></h1>
						<p className="text-muted-foreground">Fill in your details and select the rituals you wish to book</p>
					</div>
					<div className="sm:mt-6">
						<Button 
							onClick={() => navigate('/ritual-browsing')}
							className="px-8 py-4 shadow-lg btn-divine text-xl font-medium w-full sm:w-auto"
						>
							Browse All Rituals
						</Button>
					</div>
				</div>

				<Card className="card-divine p-6 mb-8">
					<h2 className="text-2xl font-playfair font-semibold mb-6 text-foreground">Personal Information</h2>
					<div className="space-y-4">
						<div><Label htmlFor="name">Full Name *</Label><Input id="name" name="name" type="text" value={formData.name} onChange={handleInputChange} className="mt-1" required /></div>
						<div><Label htmlFor="email">Email Address *</Label><Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} className="mt-1" required /></div>
						<div><Label htmlFor="phone">Phone Number *</Label><Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} className="mt-1" required /></div>
						<div><Label htmlFor="address">Address *</Label><Input id="address" name="address" type="text" value={formData.address} onChange={handleInputChange} className="mt-1" required /></div>
					</div>
				</Card>

				<Card className="p-6 mb-8 border-primary/30 ring-1 ring-primary/10 card-matrix">
					<h2 className="text-2xl font-playfair font-semibold mb-8 py-6 text-foreground">Select Rituals</h2>
					<div className="mb-6 p-6"><Label htmlFor="search">Search Ritual</Label><Input id="search" placeholder="Search by name or description..." value={search} onChange={e => setSearch(e.target.value)} className="mt-1" /></div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
						{isLoading ? Array.from({ length: 3 }).map((_, i) => (
							<div key={`skeleton-${i}`} className="rounded-lg border border-primary/20 p-4 h-40 bg-slate-200 animate-pulse"></div>
						))
                        : visibleRituals.map((ritual) => {
                            const status = getBookingStatus(ritual);
                            const disabled = status !== 'open';
                            const isNakshatrapooja = ritual.is_nakshatrapooja;
                            const customColor = ritual.nakshatrapooja_color || '#FF6B35';
                            
                            return (
                                <div
                                    key={ritual.id}
                                    role="button"
                                    tabIndex={disabled ? -1 : 0}
                                    onClick={() => !disabled && addInstance(ritual.id)}
                                    onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) addInstance(ritual.id);}}
                                    className={`rounded-lg border p-4 transition-colors relative
                                        ${isNakshatrapooja ? 'ring-2 ring-offset-2 shadow-lg' : 'border-primary/20'}
                                        ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-card/50 cursor-pointer'}
                                        focus:outline-none focus:ring-2 focus:ring-primary/40`}
                                    style={isNakshatrapooja ? {
                                        borderColor: customColor,
                                        boxShadow: `0 0 20px ${customColor}40`
                                    } : {}}
                                >
                                    {isNakshatrapooja && (
                                        <div className="absolute top-2 right-2 px-2 py-1 text-xs font-bold rounded-full text-white"
                                             style={{ backgroundColor: customColor }}>
                                            Special
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 mb-2">
										<RitualIcon 
                                            name={(ritual.icon_name || ritual.icon || 'Star') as string} 
                                            className="h-5 w-5"
                                            style={isNakshatrapooja ? { color: customColor } : {}}
                                        />
                                        <div className="text-lg font-medium text-foreground">{ritual.name}</div>
                                    </div>
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <span className="font-semibold" style={isNakshatrapooja ? { color: customColor } : {}}>
                                            ₹{ritual.price}
                                        </span>
                                    </div>
                                    {ritual.booking_start_time && ritual.booking_end_time && (
                                        <div className="text-xs text-muted-foreground">
                                            Window: {ritual.booking_start_time} - {ritual.booking_end_time}
                                        </div>
                                    )}
                                    {status === 'ended' && (
                                        <div className="mt-2 text-xs font-medium text-destructive">
                                            Booking time ended for today
                                        </div>
                                    )}
                                    {status === 'upcoming' && (
                                        <div className="mt-2 text-xs font-medium text-amber-500">
                                            Opens at {ritual.booking_start_time}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
					</div>
					{publicRituals.length > visibleRituals.length ? (
                        <div className="flex justify-center mt-4">
                            <Button variant="ghost" size="icon" onClick={() => setShowAllRituals(true)} aria-label="Show more rituals">
                                <ChevronDown className="h-5 w-5" />
                            </Button>
                        </div>
                    ) : publicRituals.length > gridCols * 2 && showAllRituals ? (
                        <div className="flex justify-center mt-4">
                            <Button variant="ghost" size="icon" onClick={() => setShowAllRituals(false)} aria-label="Show fewer rituals">
                                <ChevronUp className="h-5 w-5" />
                            </Button>
                        </div>
                    ) : null}
				</Card>

				<Card ref={selectedEntriesRef} className="card-divine p-6 mb-8">
					<h2 className="text-2xl font-playfair font-semibold mb-6 text-foreground">Selected Entries</h2>
					{instances.length === 0 ? <p className="text-muted-foreground">Click a ritual above to add an entry.</p> : (
						<div className="space-y-4">
							{instances.map((inst, idx) => {
								const r = ritualById(inst.ritualId);
								if (!r) return null;
								const isNakshatrapooja = r.is_nakshatrapooja;
								const customColor = r.nakshatrapooja_color || '#FF6B35';
								
								return (
									<div 
                                        key={inst.id} 
                                        className="rounded-md border p-4"
                                        style={isNakshatrapooja ? {
                                            borderColor: customColor,
                                            backgroundColor: `${customColor}08`
                                        } : {
                                            borderColor: 'hsl(var(--primary) / 0.1)',
                                            backgroundColor: 'hsl(var(--background) / 0.5)'
                                        }}
                                    >
										<div className="flex justify-between items-center mb-3">
                                            <div className="text-sm font-medium text-foreground">
                                                {r.name} #{idx + 1}
                                                {isNakshatrapooja && (
                                                    <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full text-white"
                                                          style={{ backgroundColor: customColor }}>
                                                        Special Nakshatrapooja
                                                    </span>
                                                )}
                                            </div>
                                        </div>
										<div className="space-y-3">
											<div><Label htmlFor={`devotee-${inst.id}`}>Devotee Name *</Label><Input id={`devotee-${inst.id}`} value={inst.devoteeName} onChange={e => updateInstance(inst.id, 'devoteeName', e.target.value)} className="mt-1" placeholder="Enter devotee name" required/></div>
											<div>
												<Label htmlFor={`naal-${inst.id}`}>Naal (Birth Star) *</Label>
												<select
													id={`naal-${inst.id}`}
													value={inst.naal}
													onChange={e => updateInstanceWithNaalCount(inst.id, 'naal', e.target.value)}
													className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
													required
												>
													<option value="" disabled>Select Naal</option>
													{NAALS.map((n, idx) => (
														<option key={`naal-${idx}`} value={n}>{n}</option>
													))}
												</select>
											</div>
											
											{isNakshatrapooja && (
												<div className="p-3 rounded-lg" style={{ backgroundColor: `${customColor}15`, borderLeft: `3px solid ${customColor}` }}>
													<Label htmlFor={`dateRange-${inst.id}`} className="font-semibold">Date Range for Naal Search *</Label>
													<p className="text-xs text-muted-foreground mb-2">We'll calculate the cost based on how many times your Naal occurs in the selected period</p>
													<select
														id={`dateRange-${inst.id}`}
														value={inst.date_range_type || 'this_month'}
														onChange={e => updateInstanceWithNaalCount(inst.id, 'date_range_type', e.target.value as DateRangeType)}
														className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
														required
													>
														<option value="this_month">This Month</option>
														<option value="this_year">This Year</option>
														<option value="custom_range">Custom Date Range</option>
													</select>
													
													{inst.date_range_type === 'custom_range' && (
														<div className="grid grid-cols-2 gap-2 mt-2">
															<div>
																<Label htmlFor={`rangeStart-${inst.id}`} className="text-xs">Start Date</Label>
																<Input
																	id={`rangeStart-${inst.id}`}
																	type="date"
																	value={inst.custom_range_start || ''}
																	onChange={e => updateInstanceWithNaalCount(inst.id, 'custom_range_start', e.target.value)}
																	className="mt-1"
																	required
																/>
															</div>
															<div>
																<Label htmlFor={`rangeEnd-${inst.id}`} className="text-xs">End Date</Label>
																<Input
																	id={`rangeEnd-${inst.id}`}
																	type="date"
																	value={inst.custom_range_end || ''}
																	onChange={e => updateInstanceWithNaalCount(inst.id, 'custom_range_end', e.target.value)}
																	className="mt-1"
																	required
																/>
															</div>
														</div>
													)}
													
													{inst.naal_count !== undefined && inst.naal_count > 0 && (
														<div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-md">
															<p className="text-sm text-green-800 font-medium">
																✓ Found {inst.naal_count} occurrence{inst.naal_count !== 1 ? 's' : ''} of your Naal in the selected period
															</p>
															<p className="text-xs text-green-600 mt-1">
																Cost: ₹{r.price} × {inst.naal_count} = ₹{calcInstanceTotal(inst)}
															</p>
														</div>
													)}
													
													{inst.naal && inst.naal_count === 0 && (
														<div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
															<p className="text-sm text-amber-800 font-medium">
																No occurrences found for the selected Naal in this period
															</p>
														</div>
													)}
												</div>
											)}
											
											<div><Label htmlFor={`dob-${inst.id}`}>Date of Birth *</Label><Input id={`dob-${inst.id}`} type="date" value={inst.dob} onChange={e => updateInstance(inst.id, 'dob', e.target.value)} className="mt-1" required/></div>
											
											{/* Hide subscription and quantity for Nakshatrapooja */}
											{!isNakshatrapooja && (
												<div className="grid grid-cols-3 gap-3">
													<div className="col-span-2"><Label htmlFor={`sub-${inst.id}`}>Subscription</Label><select id={`sub-${inst.id}`} value={inst.subscription} onChange={e => updateInstance(inst.id, 'subscription', e.target.value as Subscription)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="one-time">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
													<div>
														<Label htmlFor={`qty-${inst.id}`}>Qty</Label>
														<Input
															id={`qty-${inst.id}`}
															type="number"
															min={1}
															value={inst.quantity === 0 ? '' : inst.quantity}
															onChange={e => {
																const qty = parseInt(e.target.value, 10);
																updateInstance(inst.id, 'quantity', isNaN(qty) ? 0 : qty);
															}}
															onBlur={() => {
																if (inst.quantity < 1) {
																	updateInstance(inst.id, 'quantity', 1);
																}
															}}
															className="mt-1"
														/>
													</div>
												</div>
											)}
											
											<div className="flex items-center justify-between pt-2"><div className="text-sm text-muted-foreground">Total: <span className="font-semibold text-primary">₹{calcInstanceTotal(inst)}</span></div><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeInstance(inst.id)}>Remove</Button></div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</Card>

				<Card className="card-divine p-6">
					<h2 className="text-2xl font-playfair font-semibold mb-6 text-foreground">Checkout Summary</h2>
					{instances.length === 0 ? <p className="text-muted-foreground mb-6">Please add at least one ritual to proceed.</p> : (
						<div className="space-y-4 mb-6">
							<h3 className="text-lg font-medium text-foreground mb-3">Selected Rituals:</h3>
							{instances.map((inst) => {
								const r = ritualById(inst.ritualId);
                                if (!r) return null;
								return (
									<div key={inst.id} className="flex justify-between items-center py-2 border-b border-primary/10">
										<div className="text-foreground text-sm">{r.name} • {inst.devoteeName || 'Name'} • {inst.naal || 'Naal'} • {inst.dob || 'DOB'} • {inst.subscription} • Qty {inst.quantity}</div>
										<div className="font-semibold text-primary">₹{calcInstanceTotal(inst)}</div>
									</div>
								);
							})}
							<div className="flex justify-between items-center py-3 text-xl font-playfair font-bold border-t-2 border-primary/20"><span className="text-foreground">Total Amount:</span><span className="text-primary">₹{calculateTotal()}</span></div>
						</div>
					)}
					<Button 
                        onClick={handleCheckout}
                        className="w-full btn-divine text-lg py-3" 
                        disabled={!canCheckout || bookingMutation.isPending}
                    >
                        {bookingMutation.isPending ? 'Processing...' : `Proceed to Payment - ₹${calculateTotal()}`}
                    </Button>
					<p className="text-sm text-muted-foreground mt-4 text-center">You will be redirected to our secure payment gateway to complete your booking.</p>
				</Card>
			</div>
		</div>
	);
};

export default RitualBooking;

