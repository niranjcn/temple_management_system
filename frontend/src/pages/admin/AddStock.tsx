import React, { useState, useEffect } from 'react';
import { Plus, Package, Calendar, DollarSign, AlertTriangle, Save, Edit, Trash2, X, Search, Filter, Download, Upload, RefreshCw, Barcode, TrendingDown, History } from 'lucide-react';
import api from '@/api/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface StockItem {
  _id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  supplier?: string;
  expiryDate?: string;
  minimumStock: number;
  description?: string;
  addedOn: string;
  sku?: string;
  location?: string;
  reorderPoint?: number;
  lastRestocked?: string;
}

type StockItemForm = Omit<StockItem, '_id' | 'addedOn' | 'quantity' | 'price' | 'minimumStock' | 'reorderPoint'> & {
  quantity: string | number;
  price: string | number;
  minimumStock: string | number;
  reorderPoint: string | number;
};

const AddStock = () => {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<StockItem[]>([]);
  const initialFormState: StockItemForm = {
    name: '', category: '', quantity: '', unit: '', price: '',
    supplier: '', expiryDate: '', minimumStock: '', description: '',
    sku: '', location: '', reorderPoint: '', lastRestocked: ''
  };
  const [formState, setFormState] = useState<StockItemForm>(initialFormState);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'expiring' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'quantity' | 'value' | 'expiry'>('name');
  const [showIncrementModal, setShowIncrementModal] = useState(false);
  const [incrementingItem, setIncrementingItem] = useState<StockItem | null>(null);
  const [incrementAmount, setIncrementAmount] = useState<string>('');
  const { user } = (useAuth() as any) || {};
  const roleId: number = user?.role_id ?? 99;

  const fetchStockItems = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<StockItem[]>('/stock/');
      setStockItems(response.data);
      setFilteredItems(response.data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch stock items.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStockItems();
  }, []);

  useEffect(() => {
    let filtered = [...stockItems];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplier?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Category filter
    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => {
        if (statusFilter === 'low') return isLowStock(item);
        if (statusFilter === 'expiring') return isExpiringSoon(item);
        if (statusFilter === 'out') return item.quantity === 0;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'quantity': return b.quantity - a.quantity;
        case 'value': return (b.quantity * b.price) - (a.quantity * a.price);
        case 'expiry':
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        default: return 0;
      }
    });

    setFilteredItems(filtered);
  }, [searchTerm, categoryFilter, statusFilter, sortBy, stockItems]);

  const categories = [
    'Puja Items', 'Abhishek Items', 'Flowers & Garlands', 'Food Items',
    'Cleaning Supplies', 'Decorative Items', 'Ceremonial Items', 'Maintenance Supplies',
    'Oils & Ghee', 'Incense & Dhoop', 'Fabrics & Cloths', 'Others'
  ];
  const units = ['pieces', 'kg', 'liters', 'packets', 'boxes', 'bundles', 'meters', 'grams', 'ml'];

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
  };

  const handleSubmit = async () => {
    // Validate required fields
    if (!formState.name.trim()) {
      setError("Item name is required.");
      return;
    }
    if (!formState.category) {
      setError("Category is required.");
      return;
    }
    if (!formState.unit) {
      setError("Unit is required.");
      return;
    }
    if (!formState.quantity || Number(formState.quantity) < 0) {
      setError("Valid quantity is required.");
      return;
    }
    if (!formState.price || Number(formState.price) <= 0) {
      setError("Valid price is required.");
      return;
    }

    try {
        const itemToSend = {
            ...formState,
            name: formState.name.trim(),
            quantity: Number(formState.quantity),
            price: Number(formState.price),
            minimumStock: Number(formState.minimumStock) || 10,
            reorderPoint: Number(formState.reorderPoint) || Number(formState.minimumStock) || 10,
            expiryDate: formState.expiryDate || undefined,
            supplier: formState.supplier?.trim() || undefined,
            description: formState.description?.trim() || undefined,
            sku: formState.sku?.trim() || undefined,
            location: formState.location?.trim() || undefined,
            lastRestocked: formState.lastRestocked || new Date().toISOString().split('T')[0],
        };

        if (editingItem && 'addedOn' in itemToSend) {
            delete itemToSend.addedOn;
        }

        if (editingItem) {
            if (roleId > 4) throw new Error('Not authorized to update stock items');
            const response = await api.put<StockItem>(`/stock/${editingItem._id}`, itemToSend);
            setStockItems(stockItems.map(item => item._id === editingItem._id ? response.data : item));
            setEditingItem(null);
            setError(null);
            toast.success('Stock item updated successfully!');
        } else {
            if (roleId > 4) throw new Error('Not authorized to create stock items');
            const response = await api.post<StockItem>('/stock/', { 
                ...itemToSend, 
                addedOn: new Date().toISOString().split('T')[0] 
            });
            setStockItems([response.data, ...stockItems]);
            setError(null);
            toast.success('Stock item added successfully!');
        }
        
        setFormState(initialFormState);
        setShowAddForm(false);
        
    } catch (err: any) {
        const errorMessage = err.response?.data?.detail || err.message || `Failed to ${editingItem ? 'update' : 'add'} stock item.`;
        setError(errorMessage);
        console.error('Stock operation error:', err);
    }
  };
  
  const handleEdit = (item: StockItem) => {
    if (roleId > 4) { setError('You are not authorized to edit stock.'); return; }
    setEditingItem(item);
    setFormState({
        ...item,
        quantity: String(item.quantity),
        price: String(item.price),
        minimumStock: String(item.minimumStock),
        reorderPoint: String(item.reorderPoint || item.minimumStock),
        expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
        lastRestocked: item.lastRestocked ? item.lastRestocked.split('T')[0] : '',
    });
    setShowAddForm(true);
    setError(null);
  };
  
  const handleDelete = async (itemId: string) => {
    const itemToDelete = stockItems.find(item => item._id === itemId);
    const confirmMessage = itemToDelete 
        ? `Are you sure you want to delete "${itemToDelete.name}"? This action cannot be undone.`
        : "Are you sure you want to delete this item?";
        
    if (window.confirm(confirmMessage)) {
        try {
            if (roleId > 4) throw new Error('Not authorized to delete stock items');
            await api.delete(`/stock/${itemId}`);
            setStockItems(stockItems.filter(item => item._id !== itemId));
            setError(null);
            toast.success('Stock item deleted successfully!');
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || err.message || "Failed to delete stock item.";
            setError(errorMessage);
            console.error('Stock deletion error:', err);
        }
    }
  };

  const handleIncrementStock = (item: StockItem) => {
    if (roleId > 4) { 
      toast.error('You are not authorized to update stock.'); 
      return; 
    }
    setIncrementingItem(item);
    setIncrementAmount('');
    setShowIncrementModal(true);
  };

  const submitIncrementStock = async () => {
    if (!incrementingItem) return;
    
    const additionalQuantity = Number(incrementAmount);
    if (!additionalQuantity || additionalQuantity <= 0) {
      toast.error('Please enter a valid quantity greater than 0.');
      return;
    }

    try {
      const newQuantity = incrementingItem.quantity + additionalQuantity;
      
      const updatedItem = {
        ...incrementingItem,
        quantity: newQuantity,
        lastRestocked: new Date().toISOString().split('T')[0],
      };

      // Remove fields that shouldn't be sent in the update
      const { _id, addedOn, ...itemToSend } = updatedItem;

      const response = await api.put<StockItem>(`/stock/${incrementingItem._id}`, itemToSend);
      
      setStockItems(stockItems.map(item => 
        item._id === incrementingItem._id ? response.data : item
      ));
      
      toast.success(`Stock updated! Added ${additionalQuantity} ${incrementingItem.unit}. New total: ${newQuantity} ${incrementingItem.unit}`);
      
      setShowIncrementModal(false);
      setIncrementingItem(null);
      setIncrementAmount('');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to update stock.';
      toast.error(errorMessage);
      console.error('Stock increment error:', err);
    }
  };

  const closeIncrementModal = () => {
    setShowIncrementModal(false);
    setIncrementingItem(null);
    setIncrementAmount('');
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingItem(null);
    setFormState(initialFormState);
  };

  const isLowStock = (item: StockItem) => item.quantity <= item.minimumStock;
  const isExpiringSoon = (item: StockItem) => {
    if (!item.expiryDate) return false;
    const today = new Date();
    const expiry = new Date(item.expiryDate);
    const daysDiff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 3600 * 24));
    return daysDiff >= 0 && daysDiff <= 30;
  };

  const exportToCSV = () => {
    const headers = ['Name', 'SKU', 'Category', 'Quantity', 'Unit', 'Price', 'Total Value', 'Supplier', 'Expiry Date', 'Min Stock', 'Location'];
    const rows = filteredItems.map(item => [
      item.name,
      item.sku || '',
      item.category,
      item.quantity,
      item.unit,
      item.price,
      item.quantity * item.price,
      item.supplier || '',
      item.expiryDate || '',
      item.minimumStock,
      item.location || ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Stock data exported successfully!');
  };

  const needsReorder = (item: StockItem) => {
    const reorderPoint = item.reorderPoint || item.minimumStock;
    return item.quantity <= reorderPoint;
  };

  const reorderSuggestions = stockItems.filter(needsReorder);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Stock Management</h1>
          <p className="text-purple-300 mt-2">Comprehensive inventory control and tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchStockItems}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all duration-300 flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={exportToCSV}
            className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-all duration-300 flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => { setEditingItem(null); setFormState(initialFormState); setShowAddForm(true); }}
            disabled={roleId > 4}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-purple-500/30 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5" />
            <span>Add New Item</span>
          </button>
        </div>
      </div>

      {/* Stock Overview Cards */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900/80 backdrop-blur-sm border border-purple-500/30 p-6 rounded-xl shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-purple-300 text-sm">Total Items</p>
                    <p className="text-3xl font-bold">{stockItems.length}</p>
                    <p className="text-xs text-purple-400 mt-1">{filteredItems.length} filtered</p>
                </div>
                <Package className="h-12 w-12 text-purple-400" />
            </div>
        </div>
        <div className="bg-slate-900/80 backdrop-blur-sm border border-red-500/30 p-6 rounded-xl shadow-lg shadow-red-500/10 hover:shadow-red-500/20 transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-red-300 text-sm">Low Stock Items</p>
                    <p className="text-3xl font-bold">{stockItems.filter(isLowStock).length}</p>
                    <p className="text-xs text-red-400 mt-1">Needs attention</p>
                </div>
                <AlertTriangle className="h-12 w-12 text-red-400" />
            </div>
        </div>
        <div className="bg-slate-900/80 backdrop-blur-sm border border-amber-500/30 p-6 rounded-xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-amber-300 text-sm">Expiring Soon</p>
                    <p className="text-3xl font-bold">{stockItems.filter(isExpiringSoon).length}</p>
                    <p className="text-xs text-amber-400 mt-1">Within 30 days</p>
                </div>
                <Calendar className="h-12 w-12 text-amber-400" />
            </div>
        </div>
        <div className="bg-slate-900/80 backdrop-blur-sm border border-green-500/30 p-6 rounded-xl shadow-lg shadow-green-500/10 hover:shadow-green-500/20 transition-shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-green-300 text-sm">Total Value</p>
                    <p className="text-3xl font-bold">
                        ₹{(stockItems.reduce((sum, item) => sum + (item.quantity * item.price), 0) / 1000).toFixed(1)}K
                    </p>
                    <p className="text-xs text-green-400 mt-1">Inventory worth</p>
                </div>
                <DollarSign className="h-12 w-12 text-green-400" />
            </div>
        </div>
      </div>

      {/* Reorder Suggestions */}
      {reorderSuggestions.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-5 w-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-orange-300">Reorder Suggestions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {reorderSuggestions.slice(0, 6).map(item => (
              <div key={item._id} className="bg-orange-900/30 border border-orange-500/20 rounded-lg p-3 text-sm">
                <p className="font-semibold text-white">{item.name}</p>
                <p className="text-orange-300">Current: {item.quantity} {item.unit}</p>
                <p className="text-orange-400">Reorder at: {item.reorderPoint || item.minimumStock} {item.unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-purple-500/30">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, SKU, or supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white placeholder-gray-500"
              />
            </div>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white"
          >
            <option value="">All Categories</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white"
          >
            <option value="all">All Status</option>
            <option value="low">Low Stock</option>
            <option value="expiring">Expiring Soon</option>
            <option value="out">Out of Stock</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white"
          >
            <option value="name">Sort by Name</option>
            <option value="quantity">Sort by Quantity</option>
            <option value="value">Sort by Value</option>
            <option value="expiry">Sort by Expiry</option>
          </select>
        </div>
      </div>

      {/* Increment Stock Modal */}
      {showIncrementModal && incrementingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4">
          <div className="bg-slate-900 rounded-xl shadow-lg p-6 border border-purple-500/30 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-purple-400">Add Stock</h2>
              <button onClick={closeIncrementModal} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20">
                <p className="text-white font-semibold text-lg">{incrementingItem.name}</p>
                <p className="text-purple-300 text-sm mt-1">Category: {incrementingItem.category}</p>
                <p className="text-purple-300 text-sm">Unit: {incrementingItem.unit}</p>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <p className="text-blue-300 text-sm font-medium mb-1">Current Stock</p>
                <p className="text-white text-2xl font-bold">
                  {incrementingItem.quantity} {incrementingItem.unit}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-300 mb-2">
                  Additional Quantity to Add *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={incrementAmount}
                  onChange={(e) => setIncrementAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white placeholder-gray-500"
                  placeholder="Enter quantity to add"
                  autoFocus
                />
              </div>

              {incrementAmount && Number(incrementAmount) > 0 && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <p className="text-green-300 text-sm font-medium mb-1">New Total Stock</p>
                  <p className="text-white text-2xl font-bold">
                    {incrementingItem.quantity + Number(incrementAmount)} {incrementingItem.unit}
                  </p>
                  <p className="text-green-400 text-sm mt-2">
                    Adding: +{Number(incrementAmount)} {incrementingItem.unit}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4 mt-6">
              <button
                onClick={closeIncrementModal}
                className="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={submitIncrementStock}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-300 flex items-center space-x-2"
                type="button"
              >
                <Plus className="h-5 w-5" />
                <span>Add to Stock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4">
            <div className="bg-slate-900 rounded-xl shadow-lg p-6 border border-purple-500/30 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-purple-400">{editingItem ? 'Edit Stock Item' : 'Add New Stock Item'}</h2>
                    <button onClick={closeForm} className="text-gray-400 hover:text-white"><X size={24}/></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                        { label: 'Item Name *', name: 'name', type: 'text', placeholder: 'Enter item name' },
                        { label: 'SKU / Barcode', name: 'sku', type: 'text', placeholder: 'SKU or barcode', icon: Barcode },
                        { label: 'Category *', name: 'category', type: 'select', options: categories },
                        { label: 'Quantity *', name: 'quantity', type: 'number', placeholder: 'Enter quantity' },
                        { label: 'Unit *', name: 'unit', type: 'select', options: units },
                        { label: 'Price per Unit (₹) *', name: 'price', type: 'number', step: '0.01', placeholder: 'Enter price' },
                        { label: 'Supplier', name: 'supplier', type: 'text', placeholder: 'Supplier name' },
                        { label: 'Storage Location', name: 'location', type: 'text', placeholder: 'e.g., Shelf A3' },
                        { label: 'Expiry Date', name: 'expiryDate', type: 'date' },
                        { label: 'Minimum Stock Level *', name: 'minimumStock', type: 'number', placeholder: 'Minimum quantity' },
                        { label: 'Reorder Point', name: 'reorderPoint', type: 'number', placeholder: 'Reorder trigger point' },
                        { label: 'Last Restocked', name: 'lastRestocked', type: 'date' },
                    ].map(field => (
                        <div key={field.name}>
                            <label className="block text-sm font-medium text-purple-300 mb-2">
                              {field.icon && <field.icon className="inline h-4 w-4 mr-1" />}
                              {field.label}
                            </label>
                            {field.type === 'select' ? (
                                <select
                                    name={field.name}
                                    value={formState[field.name as keyof StockItemForm] as string}
                                    onChange={handleFormChange}
                                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white"
                                >
                                    <option value="">Select {field.label}</option>
                                    {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                            ) : (
                                <input
                                    type={field.type}
                                    name={field.name}
                                    value={formState[field.name as keyof StockItemForm] as string}
                                    onChange={handleFormChange}
                                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white placeholder-gray-500"
                                    placeholder={field.placeholder}
                                    step={field.step}
                                />
                            )}
                        </div>
                    ))}
                    <div className="md:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-purple-300 mb-2">Description / Notes</label>
                        <textarea
                            name="description"
                            value={formState.description}
                            onChange={handleFormChange}
                            className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-white placeholder-gray-500"
                            rows={3}
                            placeholder="Additional notes about this item..."
                        />
                    </div>
                </div>
                {error && (
                  <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}
                <div className="flex justify-end space-x-4 mt-6">
                    <button 
                        onClick={closeForm} 
                        className="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                        type="button"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={roleId > 4} 
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        type="button"
                    >
                        <Save className="h-5 w-5" />
                        <span>{editingItem ? 'Update Item' : 'Add Item'}</span>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Stock Items Grid */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-purple-500/30">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-purple-400">
            Current Stock Items
            {filteredItems.length !== stockItems.length && (
              <span className="text-sm text-purple-300 ml-2">({filteredItems.length} of {stockItems.length})</span>
            )}
          </h2>
        </div>
        {isLoading && <p className="text-center py-8">Loading stock data...</p>}
        {!isLoading && filteredItems.length === 0 && (
          <p className="text-center py-8 text-gray-400">No items match your filters. Try adjusting your search.</p>
        )}
        {!isLoading && filteredItems.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
                <div key={item._id} className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/20 flex flex-col justify-between hover:shadow-md hover:shadow-purple-500/10 transition-all hover:border-purple-500/40">
                    <div>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                              {item.sku && <p className="text-xs text-gray-400 flex items-center gap-1 mt-1"><Barcode className="h-3 w-3" />{item.sku}</p>}
                            </div>
                            <div className="flex flex-wrap gap-1 flex-shrink-0 ml-2">
                            {item.quantity === 0 && (
                                <span className="bg-gray-900/50 text-gray-300 text-xs px-2 py-1 rounded-full border border-gray-500/30">Out of Stock</span>
                            )}
                            {item.quantity > 0 && isLowStock(item) && (
                                <span className="bg-red-900/50 text-red-300 text-xs px-2 py-1 rounded-full border border-red-500/30">Low</span>
                            )}
                            {isExpiringSoon(item) && (
                                <span className="bg-amber-900/50 text-amber-300 text-xs px-2 py-1 rounded-full border border-amber-500/30">Expiring</span>
                            )}
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-purple-200">
                            <p><span className="font-medium text-purple-300">Category:</span> {item.category}</p>
                            <p className={`font-semibold ${item.quantity === 0 ? 'text-red-400' : isLowStock(item) ? 'text-orange-400' : 'text-green-400'}`}>
                              <span className="font-medium text-purple-300">Quantity:</span> {item.quantity} {item.unit}
                            </p>
                            <p><span className="font-medium text-purple-300">Price:</span> ₹{item.price.toLocaleString()} / {item.unit}</p>
                            {item.supplier && <p><span className="font-medium text-purple-300">Supplier:</span> {item.supplier}</p>}
                            {item.location && <p><span className="font-medium text-purple-300">Location:</span> {item.location}</p>}
                            {item.expiryDate && (
                            <p><span className="font-medium text-purple-300">Expiry:</span> {new Date(item.expiryDate).toLocaleDateString('en-IN')}</p>
                            )}
                            <p className="text-green-300"><span className="font-medium text-purple-300">Total Value:</span> ₹{(item.quantity * item.price).toLocaleString()}</p>
                            <p className="text-xs text-gray-400">Min stock: {item.minimumStock} {item.unit}</p>
                        </div>
                    </div>
                    <div className="flex justify-between items-center space-x-2 mt-4 pt-4 border-t border-purple-500/20">
                      <button 
                        onClick={() => handleIncrementStock(item)} 
                        disabled={roleId > 4} 
                        className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg disabled:opacity-50 transition-all duration-300 flex items-center space-x-1 text-sm shadow-md hover:shadow-lg transform hover:scale-105" 
                        title="Add Stock"
                      >
                        <Plus size={16}/>
                        <span>Add Stock</span>
                      </button>
                      <div className="flex space-x-2">
                        <button onClick={() => handleEdit(item)} disabled={roleId > 4} className="p-2 text-blue-400 hover:bg-blue-900/50 rounded-md disabled:opacity-50 transition-colors" title="Edit">
                          <Edit size={16}/>
                        </button>
                        <button onClick={() => handleDelete(item._id)} disabled={roleId > 4} className="p-2 text-red-400 hover:bg-red-900/50 rounded-md disabled:opacity-50 transition-colors" title="Delete">
                          <Trash2 size={16}/>
                        </button>
                      </div>
                    </div>
                </div>
            ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default AddStock;