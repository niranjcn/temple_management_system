import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { get } from '../../api/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Edit, Flame, DollarSign, Plus, XCircle, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// --- Type Definitions ---
interface RequiredStock {
    stock_item_id: string;
    stock_item_name?: string; // Used for frontend display
    quantity_required: number;
}

interface Ritual {
    _id: string;
    name: string;
    description: string;
    price: number;
    duration: string;
    popular: boolean;
    icon_name: string;
    required_stock: RequiredStock[];
    booking_start_time?: string;
    booking_end_time?: string;
    employee_only?: boolean;
    available_from?: string;
    available_to?: string;
    show_on_home?: boolean; // Used for featuring on home
    is_nakshatrapooja?: boolean; // Nakshatrapooja special field
    nakshatrapooja_color?: string; // Nakshatrapooja custom color
}

interface StockItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
}

// --- API Fetching Functions ---
const fetchRituals = () => get<Ritual[]>('/rituals/admin');
const fetchStockItems = () => get<StockItem[]>('/stock/');


const ManageRituals = () => {
    const queryClient = useQueryClient();
    const { user } = (useAuth() as any) || {};
    const roleId: number = user?.role_id ?? 99;

    // --- State Management ---
    const [isEditing, setIsEditing] = useState<Ritual | null>(null);
    const [formData, setFormData] = useState({
        name: '', description: '', price: '', duration: '', popular: false, icon_name: 'Star',
        required_stock: [] as RequiredStock[],
        booking_start_time: '', booking_end_time: '', employee_only: false,
        available_from: '', available_to: '', date_range_option: 'all_time', time_range_option: 'no_limit',
        show_on_home: false
    });
    const [selectedStockId, setSelectedStockId] = useState('');
    const [requiredQuantity, setRequiredQuantity] = useState('1');

    // --- Data Fetching ---
    const { data: rituals, isLoading: isLoadingRituals } = useQuery<Ritual[]>({ queryKey: ['adminRituals'], queryFn: fetchRituals });
    const { data: stockItems, isLoading: isLoadingStock } = useQuery<StockItem[]>({ queryKey: ['stockItems'], queryFn: fetchStockItems });

    // --- Memoization for Performance ---
    const stockMap = useMemo(() => {
        const map = new Map<string, { name: string, unit: string }>();
        stockItems?.forEach(item => map.set(item._id, { name: item.name, unit: item.unit }));
        return map;
    }, [stockItems]);

    // --- Effects ---
    useEffect(() => {
        if (isEditing) {
            setFormData({
                name: isEditing.name,
                description: isEditing.description,
                price: String(isEditing.price),
                duration: isEditing.duration,
                popular: isEditing.popular,
                icon_name: isEditing.icon_name || 'Star',
                required_stock: isEditing.required_stock.map(rs => ({...rs, stock_item_name: stockMap.get(rs.stock_item_id)?.name || 'Unknown'})),
                booking_start_time: isEditing.booking_start_time || '',
                booking_end_time: isEditing.booking_end_time || '',
                employee_only: !!isEditing.employee_only,
                available_from: isEditing.available_from || '',
                available_to: isEditing.available_to || '',
                date_range_option: (isEditing.available_from || isEditing.available_to) ? 'custom' : 'all_time',
                time_range_option: (isEditing.booking_start_time || isEditing.booking_end_time) ? 'custom' : 'no_limit',
                show_on_home: !!isEditing.show_on_home
            });
        } else {
            setFormData({ name: '', description: '', price: '', duration: '', popular: false, icon_name: 'Star',
                required_stock: [], booking_start_time: '', booking_end_time: '', employee_only: false,
                available_from: '', available_to: '', date_range_option: 'all_time', time_range_option: 'no_limit', show_on_home: false });
        }
    }, [isEditing, stockMap]);

    
    // --- Mutation Error Handler ---
    const handleMutationError = (error: unknown) => {
        const resp = (error as any)?.response;
        const detail = resp?.data?.detail;
        if (resp && detail) {
            toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
            return;
        }
        const msg = (error as Error)?.message;
        toast.error(msg || 'An unexpected error occurred.');
    };

    // --- Derived State for Dashboard ---
    const totalRituals = rituals?.length || 0;
    const popularRituals = rituals?.filter(r => r.popular).length || 0;
    const averagePrice = totalRituals > 0 ? rituals.reduce((sum, r) => sum + r.price, 0) / totalRituals : 0;
    const featuredCount = rituals?.filter(r => r.show_on_home).length || 0;

    // --- Mutations (Create/Update/Delete) ---
    const mutation = useMutation({
        mutationFn: (ritualPayload: any) => {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };
            if (roleId > 4) throw new Error('Not authorized for this action.');
            
            // Used to enforce max 3 selected on client before sending
            if (ritualPayload.show_on_home) {
                const isSelectingNew = !isEditing || (isEditing && !isEditing.show_on_home);
                if (isSelectingNew && featuredCount >= 3) {
                    throw new Error('You can only feature up to 3 rituals on the home page.');
                }
            }

            // Used to sanitize required_stock before sending
            const payload = {
                name: ritualPayload.name,
                description: ritualPayload.description,
                price: ritualPayload.price,
                duration: ritualPayload.duration,
                popular: !!ritualPayload.popular,
                icon_name: ritualPayload.icon_name,
                booking_start_time: ritualPayload.time_range_option === 'custom' ? ritualPayload.booking_start_time || null : null,
                booking_end_time: ritualPayload.time_range_option === 'custom' ? ritualPayload.booking_end_time || null : null,
                employee_only: !!ritualPayload.employee_only,
                // Used to handle date range properly - null for all_time, actual dates for custom
                available_from: ritualPayload.date_range_option === 'custom' ? ritualPayload.available_from || null : null,
                available_to: ritualPayload.date_range_option === 'custom' ? ritualPayload.available_to || null : null,
                show_on_home: !!ritualPayload.show_on_home,
                // Preserve Nakshatrapooja special fields when editing
                is_nakshatrapooja: isEditing?.is_nakshatrapooja || false,
                nakshatrapooja_color: isEditing?.nakshatrapooja_color || null,
                required_stock: ritualPayload.required_stock.map(({ stock_item_id, quantity_required }: RequiredStock) => ({
                    stock_item_id,
                    quantity_required: Number(quantity_required)
                }))
            };

            if (isEditing) {
                return api.put(`/rituals/${isEditing._id}`, payload, config);
            }
            return api.post('/rituals', payload, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminRituals'] });
            queryClient.invalidateQueries({ queryKey: ['rituals'] });
            queryClient.invalidateQueries({ queryKey: ['featuredRituals'] });
            toast.success(`Ritual ${isEditing ? 'updated' : 'added'} successfully!`);
            setIsEditing(null);
        },
        onError: handleMutationError,
    });
    
    const deleteMutation = useMutation({
        mutationFn: (id: string) => {
            const token = localStorage.getItem('token');
            if (roleId > 4) throw new Error('Not authorized');
            return api.delete(`/rituals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminRituals'] });
            queryClient.invalidateQueries({ queryKey: ['rituals'] });
            queryClient.invalidateQueries({ queryKey: ['featuredRituals'] });
            toast.success('Ritual deleted!');
        },
        onError: handleMutationError,
    });

    const toggleShowOnHomeMutation = useMutation({
        mutationFn: (ritualToToggle: Ritual) => {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };
            if (roleId > 4) throw new Error('Not authorized for this action.');
    
            const isEnabling = !ritualToToggle.show_on_home;
            if (isEnabling && featuredCount >= 3) {
                throw new Error('You can only feature up to 3 rituals on the home page.');
            }
    
            const payload = {
                name: ritualToToggle.name,
                description: ritualToToggle.description,
                price: ritualToToggle.price,
                duration: ritualToToggle.duration,
                popular: !!ritualToToggle.popular,
                icon_name: ritualToToggle.icon_name,
                booking_start_time: ritualToToggle.booking_start_time || null,
                booking_end_time: ritualToToggle.booking_end_time || null,
                employee_only: !!ritualToToggle.employee_only,
                available_from: ritualToToggle.available_from || null,
                available_to: ritualToToggle.available_to || null,
                show_on_home: isEnabling, // The toggled value
                required_stock: ritualToToggle.required_stock.map(({ stock_item_id, quantity_required }) => ({
                    stock_item_id,
                    quantity_required: Number(quantity_required)
                }))
            };
    
            return api.put(`/rituals/${ritualToToggle._id}`, payload, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminRituals'] });
            queryClient.invalidateQueries({ queryKey: ['rituals'] });
            queryClient.invalidateQueries({ queryKey: ['featuredRituals'] });
            toast.success('Ritual visibility on home page updated!');
        },
        onError: handleMutationError,
    });

    // --- Event Handlers ---
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(formData.price);
        if (isNaN(price) || price <= 0) {
            toast.error("Valid price required.");
            return;
        }
        
        // Used to validate custom date range
        if (formData.date_range_option === 'custom') {
            if (!formData.available_from || !formData.available_to) {
                toast.error("Both start and end dates are required for custom date range.");
                return;
            }
            
            const fromDate = new Date(formData.available_from);
            const toDate = new Date(formData.available_to);
            
            if (fromDate >= toDate) {
                toast.error("End date must be after start date.");
                return;
            }
        }
        
        // Used to validate custom time range
        if (formData.time_range_option === 'custom') {
            if (!formData.booking_start_time || !formData.booking_end_time) {
                toast.error("Both start and end times are required for custom time range.");
                return;
            }
            
            const startTime = formData.booking_start_time;
            const endTime = formData.booking_end_time;
            
            if (startTime >= endTime) {
                toast.error("End time must be after start time.");
                return;
            }
        }
        
        if (roleId > 4) { toast.error('Not authorized.'); return; }
        mutation.mutate({ ...formData, price });
    };

    const handleAddStockItem = () => {
        if (!selectedStockId || !requiredQuantity || Number(requiredQuantity) <= 0) {
            toast.error("Please select a stock item and enter a valid quantity.");
            return;
        }
        if (formData.required_stock.some(item => item.stock_item_id === selectedStockId)) {
            toast.warning("This stock item is already added.");
            return;
        }
        const stockItem = stockItems?.find(item => item._id === selectedStockId);
        if (stockItem) {
            setFormData(prev => ({
                ...prev,
                required_stock: [...prev.required_stock, {
                    stock_item_id: selectedStockId,
                    stock_item_name: stockItem.name,
                    quantity_required: Number(requiredQuantity)
                }]
            }));
            setSelectedStockId('');
            setRequiredQuantity('1');
        }
    };

    const handleRemoveStockItem = (stockIdToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            required_stock: prev.required_stock.filter(item => item.stock_item_id !== stockIdToRemove)
        }));
    };

    const handleUpdateStockQuantity = (stockId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            toast.error("Quantity must be greater than 0.");
            return;
        }
        setFormData(prev => ({
            ...prev,
            required_stock: prev.required_stock.map(item =>
                item.stock_item_id === stockId 
                    ? { ...item, quantity_required: newQuantity }
                    : item
            )
        }));
        toast.success("Stock quantity updated!");
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Manage Rituals</h1>
            
            {/* Statistics Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-purple-300">Total Rituals</CardTitle><Flame className="h-4 w-4 text-purple-400" /></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-white">{totalRituals}</div></CardContent>
                </Card>
                <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-purple-300">Popular Rituals</CardTitle><Flame className="h-4 w-4 text-pink-400" /></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-white">{popularRituals}</div></CardContent>
                </Card>
                <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-purple-300">Avg. Price</CardTitle><DollarSign className="h-4 w-4 text-amber-400" /></CardHeader>
                    <CardContent><div className="text-2xl font-bold text-white">₹{averagePrice.toFixed(2)}</div></CardContent>
                </Card>
            </div>

            {/* Featured Counter */}
            <div className="rounded-md border border-purple-500/20 bg-slate-900/60 p-3 text-sm text-purple-200">
                Featured on Home: {featuredCount}/3
            </div>

            {/* Add/Edit Form */}
            <Card className="mb-8 bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
                <CardHeader><CardTitle className="text-purple-400">{isEditing ? 'Edit Ritual' : 'Add New Ritual'}</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Basic Info Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Name and Price inputs */}
                           <div>
                                <Label htmlFor="name" className="text-purple-300">Name</Label>
                                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-slate-800/50 border-purple-500/30 text-white" required />
                            </div>
                            <div>
                                <Label htmlFor="price" className="text-purple-300">Price</Label>
                                <Input id="price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="bg-slate-800/50 border-purple-500/30 text-white" required />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="description" className="text-purple-300">Description</Label>
                            <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="bg-slate-800/50 border-purple-500/30 text-white" required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Duration and Icon inputs */}
                             <div>
                                <Label htmlFor="duration" className="text-purple-300">Duration (in hours)</Label>
                                <Input 
                                    id="duration" 
                                    type="number" 
                                    min="0.5" 
                                    step="0.5" 
                                    placeholder="e.g., 2"
                                    value={formData.duration} 
                                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })} 
                                    className="bg-slate-800/50 border-purple-500/30 text-white placeholder-purple-300/70" 
                                    required 
                                />
                            </div>
                             <div>
                                <Label htmlFor="icon_name" className="text-purple-300">Icon</Label>
                                <select id="icon_name" value={formData.icon_name} onChange={(e) => setFormData({ ...formData, icon_name: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-purple-500/30 bg-slate-800/50 px-3 text-sm text-white" required>
                                    <option value="Flame">Flame</option><option value="Flower2">Flower</option><option value="Heart">Heart</option><option value="Star">Star</option>
                                </select>
                            </div>
                        </div>

                        {/* Required Stock Section */}
                        <div className="space-y-2 pt-4 border-t border-purple-500/20">
                            <Label className="text-purple-300">Required Stock Items</Label>
                            {isLoadingStock ? <p className="text-sm text-purple-400">Loading stock...</p> : (
                                <div className="flex items-end gap-2">
                                    <div className="flex-grow">
                                        <Label htmlFor="stock_item" className="text-xs text-purple-400">Stock Item</Label>
                                        <select id="stock_item" value={selectedStockId} onChange={e => setSelectedStockId(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-purple-500/30 bg-slate-800/50 px-3 text-sm text-white">
                                            <option value="">Select Stock...</option>
                                            {stockItems?.map(item => <option key={item._id} value={item._id}>{item.name} ({item.quantity} {item.unit} left)</option>)}
                                        </select>
                                    </div>
                                    <div>
                                         <Label htmlFor="quantity_req" className="text-xs text-purple-400">Quantity</Label>
                                        <Input id="quantity_req" type="number" min="1" value={requiredQuantity} onChange={e => setRequiredQuantity(e.target.value)} className="bg-slate-800/50 border-purple-500/30 text-white w-24" />
                                    </div>
                                    <Button type="button" size="icon" onClick={handleAddStockItem} className="bg-purple-600 hover:bg-purple-700 h-10 w-10"><Plus className="h-5 w-5" /></Button>
                                </div>
                            )}
                            <div className="space-y-2 pt-2">
                                {formData.required_stock.map(item => (
                                    <div key={item.stock_item_id} className="flex items-center justify-between bg-slate-800/60 p-2 rounded-md">
                                        <div className="flex items-center gap-3 flex-grow">
                                            <p className="text-sm text-white">{item.stock_item_name}</p>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor={`edit-qty-${item.stock_item_id}`} className="text-xs text-purple-400">Qty:</Label>
                                                <Input
                                                    id={`edit-qty-${item.stock_item_id}`}
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity_required}
                                                    onChange={(e) => {
                                                        const newQty = parseInt(e.target.value, 10);
                                                        if (!isNaN(newQty) && newQty > 0) {
                                                            handleUpdateStockQuantity(item.stock_item_id, newQty);
                                                        }
                                                    }}
                                                    className="bg-slate-700/50 border-purple-500/30 text-white w-20 h-8 text-sm"
                                                />
                                            </div>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStockItem(item.stock_item_id)} className="text-red-400 hover:text-red-300 h-6 w-6"><XCircle className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox id="popular" checked={formData.popular} onCheckedChange={(checked) => setFormData({ ...formData, popular: !!checked })} className="border-purple-500/30 data-[state=checked]:bg-purple-600" />
                            <Label htmlFor="popular" className="text-purple-300">Mark as Popular</Label>
                        </div>
                        {/* Show on Home */}
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="show_on_home"
                                checked={formData.show_on_home}
                                onCheckedChange={(checked) => {
                                    const want = !!checked;
                                    if (want) {
                                        const isSelectingNew = !isEditing || (isEditing && !isEditing.show_on_home);
                                        if (isSelectingNew && featuredCount >= 3) {
                                            toast.error('You can only feature up to 3 rituals on the home page.');
                                            return;
                                        }
                                    }
                                    setFormData({ ...formData, show_on_home: want });
                                }}
                                className="border-purple-500/30 data-[state=checked]:bg-purple-600"
                            />
                            <Label htmlFor="show_on_home" className="text-purple-300">Show on Home (max 3)</Label>
                        </div>
                        {/* Time Range Section */}
                        <div className="space-y-2 pt-4 border-t border-purple-500/20">
                            <div>
                                <Label className="text-purple-300">Booking Time Availability</Label>
                                <p className="text-xs text-purple-400 mt-1">Control what time of day this ritual can be booked</p>
                            </div>
                            <select
                                value={formData.time_range_option}
                                onChange={(e) => {
                                    const newValue = e.target.value;
                                    setFormData({ 
                                        ...formData, 
                                        time_range_option: newValue,
                                        // Used to clear times when switching to no_limit
                                        booking_start_time: newValue === 'no_limit' ? '' : formData.booking_start_time,
                                        booking_end_time: newValue === 'no_limit' ? '' : formData.booking_end_time
                                    });
                                }}
                                className="mt-1 w-full h-10 rounded-md border border-purple-500/30 bg-slate-800/50 px-3 text-sm text-white"
                            >
                                <option value="no_limit">No Time Limit (24/7 Available)</option>
                                <option value="custom">Specific Time Range</option>
                            </select>
                            
                            {formData.time_range_option === 'no_limit' && (
                                <div className="bg-green-900/20 p-3 rounded-md border border-green-500/30">
                                    <p className="text-sm text-green-300">
                                        ✓ This ritual can be booked at any time of day (24/7 availability).
                                    </p>
                                </div>
                            )}
                            
                            {formData.time_range_option === 'custom' && (
                                <div className="space-y-3">
                                    <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-md border border-blue-300 dark:border-blue-700 shadow">
                                        <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                                        🕐 Set specific hours when this ritual can be booked.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="booking_start_time" className="text-purple-300">Available From *</Label>
                                            <Input
                                                id="booking_start_time"
                                                type="time"
                                                value={formData.booking_start_time}
                                                onChange={(e) => setFormData({ ...formData, booking_start_time: e.target.value })}
                                                className="bg-slate-800/50 border-purple-500/30 text-white"
                                                required={formData.time_range_option === 'custom'}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="booking_end_time" className="text-purple-300">Available To *</Label>
                                            <Input
                                                id="booking_end_time"
                                                type="time"
                                                value={formData.booking_end_time}
                                                onChange={(e) => setFormData({ ...formData, booking_end_time: e.target.value })}
                                                className="bg-slate-800/50 border-purple-500/30 text-white"
                                                required={formData.time_range_option === 'custom'}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center mt-6">
                            <Checkbox id="employee_only" checked={formData.employee_only}
                                onCheckedChange={c => setFormData({ ...formData, employee_only: !!c }) }
                                className="border-purple-500/30 data-[state=checked]:bg-purple-600" />
                            <Label htmlFor="employee_only" className="ml-2 text-purple-300">Employee Only</Label>
                        </div>

                        {/* Date Range Section */}
                        <div className="space-y-2 pt-4 border-t border-purple-500/20">
                            <div>
                                <Label className="text-purple-300">Availability Date Range</Label>
                                <p className="text-xs text-purple-400 mt-1">Control when this ritual is available for booking</p>
                            </div>
                            <select
                                value={formData.date_range_option}
                                onChange={(e) => {
                                    const newValue = e.target.value;
                                    setFormData({ 
                                        ...formData, 
                                        date_range_option: newValue,
                                        // Used to clear dates when switching to all_time
                                        available_from: newValue === 'all_time' ? '' : formData.available_from,
                                        available_to: newValue === 'all_time' ? '' : formData.available_to
                                    });
                                }}
                                className="mt-1 w-full h-10 rounded-md border border-purple-500/30 bg-slate-800/50 px-3 text-sm text-white"
                            >
                                <option value="all_time">All Time (Always Available)</option>
                                <option value="custom">Custom Date Range</option>
                            </select>
                            
                            {formData.date_range_option === 'all_time' && (
                                <div className="bg-purple-900/20 p-3 rounded-md border border-purple-500/30">
                                    <p className="text-sm text-purple-300">
                                        ✓ This ritual will be available for booking indefinitely, without any date restrictions.
                                    </p>
                                </div>
                            )}
                            
                            {formData.date_range_option === 'custom' && (
                                <div className="space-y-3">
                                    <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-md border border-blue-300 dark:border-blue-700 shadow">
                                            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                                            📅 Set specific start and end dates for this ritual's availability.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="available_from" className="text-purple-300">Available From *</Label>
                                            <Input
                                                id="available_from"
                                                type="date"
                                                value={formData.available_from}
                                                onChange={(e) => setFormData({ ...formData, available_from: e.target.value })}
                                                className="bg-slate-800/50 border-purple-500/30 text-white"
                                                required={formData.date_range_option === 'custom'}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="available_to" className="text-purple-300">Available To *</Label>
                                            <Input
                                                id="available_to"
                                                type="date"
                                                value={formData.available_to}
                                                onChange={(e) => setFormData({ ...formData, available_to: e.target.value })}
                                                className="bg-slate-800/50 border-purple-500/30 text-white"
                                                min={formData.available_from || undefined}
                                                required={formData.date_range_option === 'custom'}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                           <Button type="submit" disabled={mutation.isPending} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">{isEditing ? 'Update Ritual' : 'Add Ritual'}</Button>
                           {isEditing && <Button variant="outline" type="button" onClick={() => setIsEditing(null)} className="border-purple-500/30 text-purple-300 hover:bg-purple-900/50">Cancel</Button>}
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Existing Rituals List */}
            <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Existing Rituals</h2>
            {isLoadingRituals ? <p className="text-purple-300">Loading rituals...</p> : (
                <div className="space-y-2">
                    {rituals?.map((ritual) => (
                        <Card key={ritual._id} className="p-4 bg-slate-900/80 backdrop-blur-sm border-purple-500/30">
                            <div className="flex items-center justify-between">
                                <div className="flex-grow">
                                    <div className="font-semibold text-white">{ritual.name} - ₹{ritual.price}</div>
                                    <p className="text-xs text-purple-400">
                                        {ritual.booking_start_time && ritual.booking_end_time
                                            ? `Window: ${ritual.booking_start_time} - ${ritual.booking_end_time}` : 'No window'}
                                        {ritual.employee_only && <span className="ml-2 text-amber-400">(Employee Only)</span>}
                                        {ritual.show_on_home && <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200">Featured</span>}
                                    </p>
                                    {ritual.available_from && ritual.available_to ? (
                                        <p className="text-xs text-purple-400">
                                            📅 Available: {new Date(ritual.available_from).toLocaleDateString()} - {new Date(ritual.available_to).toLocaleDateString()}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-purple-400">📅 Available: All time</p>
                                    )}
                                    <p className="text-sm text-purple-300 overflow-hidden line-clamp-3">
                                        {ritual.description}
                                    </p>
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <Button
                                        variant={ritual.show_on_home ? "default" : "outline"}
                                        size="icon"
                                        onClick={() => toggleShowOnHomeMutation.mutate(ritual)}
                                        disabled={
                                            roleId > 4 ||
                                            (featuredCount >= 3 && !ritual.show_on_home) ||
                                            toggleShowOnHomeMutation.isPending
                                        }
                                        className={
                                            ritual.show_on_home
                                                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                                                : "border-purple-500/30 text-purple-300 hover:bg-purple-900/50"
                                        }
                                        title={ritual.show_on_home ? "Remove from Home" : "Show on Home"}
                                    >
                                        <Star className={`h-4 w-4 ${ritual.show_on_home ? 'fill-current' : ''}`} />
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={() => setIsEditing(ritual)} disabled={roleId > 4} className="border-purple-500/30 text-purple-300 hover:bg-purple-900/50"><Edit className="h-4 w-4" /></Button>
                                    <Button size="icon"onClick={() => deleteMutation.mutate(ritual._id)}disabled={roleId > 4 || deleteMutation.isPending}className="bg-red-600 hover:bg-red-700 text-white border border-red-700 shadow-md"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </div>
                            {ritual.required_stock?.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-purple-500/20">
                                    <h4 className="text-xs font-semibold text-purple-400 mb-1">Required Stock:</h4>
                                    <ul className="text-xs text-purple-200 list-disc list-inside">
                                        {ritual.required_stock.map(rs => (
                                            <li key={rs.stock_item_id}>{stockMap.get(rs.stock_item_id)?.name || 'Loading...'}: {rs.quantity_required}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ManageRituals;
