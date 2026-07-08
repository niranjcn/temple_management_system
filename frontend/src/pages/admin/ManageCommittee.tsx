import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, put, del } from '@/api/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// removed dialog import as we are using inline sections for forms
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Trash2, Edit, Plus, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveImageUrl } from '@/lib/utils';
import { requestSignedUpload, uploadFileToCloudinary } from '@/lib/cloudinary';

interface CommitteeMember {
    _id: string;
    name: string;
    designation: string;
    profile_description: string;
    mobile_prefix?: string;
    phone_number: string;
    image: string;
    preview_order?: number | null;
    view_order?: number | null;
}

const fetchCommitteeMembers = async (): Promise<CommitteeMember[]> => {
    const data = await get<CommitteeMember[]>('/committee/');
    return data;
};

const ManageCommittee = () => {
    const queryClient = useQueryClient();
    const { user } = (useAuth() as any) || {};
    const roleId: number = user?.role_id ?? 99;
    const isReadOnly = roleId > 1;
    const [isEditing, setIsEditing] = useState<CommitteeMember | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        designation: '',
        profile_description: '',
        mobile_prefix: '+91',
        phone_number: '',
        image: ''
    });
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showOrder, setShowOrder] = useState(false);

    const { data: members, isLoading } = useQuery<CommitteeMember[]>({
        queryKey: ['committeeMembers'],
        queryFn: fetchCommitteeMembers,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
    });

    const mutation = useMutation({
        mutationFn: async (memberPayload: Omit<CommitteeMember, '_id'>) => {
            if (isEditing) {
                return put(`/committee/${isEditing._id}`, memberPayload);
            } else {
                return post('/committee/', memberPayload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['committeeMembers'] });
            toast.success(`Committee member ${isEditing ? 'updated' : 'added'} successfully!`);
            resetForm();
            setShowForm(false);
        },
        onError: () => toast.error('Failed to save committee member.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => del(`/committee/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['committeeMembers'] });
            toast.success('Committee member deleted successfully!');
        },
        onError: () => toast.error('Failed to delete committee member.'),
    });

    const orderMutation = useMutation({
        mutationFn: async (ordered: Array<{ _id: string; preview_order: number | null; view_order: number | null }>) => {
            for (const entry of ordered) {
                const original = (members ?? []).find(m => m._id === entry._id);
                if (!original) continue;
                await put(`/committee/${entry._id}`, {
                    name: original.name,
                    designation: original.designation,
                    profile_description: original.profile_description,
                    mobile_prefix: original.mobile_prefix ?? '+91',
                    phone_number: original.phone_number,
                    image: original.image,
                    preview_order: entry.preview_order,
                    view_order: entry.view_order,
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['committeeMembers'] });
            toast.success('Display order updated');
            setShowOrder(false);
        },
        onError: () => toast.error('Failed to update display order'),
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.designation || !formData.profile_description || !formData.phone_number) {
            toast.error('Please fill in all required fields.');
            return;
        }

        let imageUrl = formData.image;

        // If a new file is selected, upload it first
        if (selectedFile) {
            setUploading(true);
            setUploadError(null);
            try {
                const signed = await requestSignedUpload('/committee/get_signed_upload', selectedFile);

                if (selectedFile.size > signed.max_file_bytes) {
                    throw new Error('Image exceeds the 2 MB limit.');
                }

                const cloudinaryResult = await uploadFileToCloudinary(signed, selectedFile);

                const finalizePayload = {
                    object_path: signed.object_path,
                    public_id: cloudinaryResult.public_id,
                    secure_url: cloudinaryResult.secure_url,
                    format: cloudinaryResult.format,
                    bytes: cloudinaryResult.bytes,
                    version: cloudinaryResult.version ? String(cloudinaryResult.version) : undefined,
                };

                const finalizeResponse = await post<{ public_url: string }, typeof finalizePayload>('/committee/finalize_upload', finalizePayload);
                imageUrl = finalizeResponse.public_url;
                toast.success('Image uploaded successfully!');
            } catch (error) {
                console.error('Committee image upload failed:', error);
                setUploadError('Failed to upload image.');
                toast.error('Failed to upload image.');
                setUploading(false);
                return;
            } finally {
                setUploading(false);
            }
        }

        mutation.mutate({ ...formData, image: imageUrl });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Invalid file type. Please select an image.');
                setSelectedFile(null);
                setSelectedFileName('');
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
                return;
            }
            setSelectedFile(file);
            setSelectedFileName(file.name);
            setUploadError(null);
        } else {
            setSelectedFile(null);
            setSelectedFileName('');
        }
    };

    const resetForm = () => {
        setFormData({ name: '', designation: '', profile_description: '', mobile_prefix: '+91', phone_number: '', image: '' });
        setSelectedFile(null);
        setSelectedFileName('');
        setIsEditing(null);
        setUploadError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleEdit = (member: CommitteeMember) => {
        setIsEditing(member);
        setFormData({
            name: member.name,
            designation: member.designation,
            profile_description: member.profile_description,
            mobile_prefix: member.mobile_prefix ?? '+91',
            phone_number: member.phone_number,
            image: member.image
        });
        setShowForm(true);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this committee member?')) {
            deleteMutation.mutate(id);
        }
    };

    if (isLoading) return <div>Loading...</div>;

    return (
    <div className="p-6">
            <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">Manage Committee Members</h1>
                {!isReadOnly && (
                    <div className="flex gap-2 flex-wrap">
                        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Member
                        </Button>
                        <Button variant="outline" onClick={() => setShowOrder(true)} className="border-orange-300 text-orange-700 bg-white hover:bg-orange-50">Configure Order</Button>
                                                <Link to={{ pathname: '/committee' }} state={{ fromAdmin: '/admin/committee' }} className="inline-flex">
                                                    <Button variant="outline" className="border-orange-300 text-orange-700 bg-white hover:bg-orange-50">
                                                        View Public Members <ExternalLink className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Link to={{ pathname: '/' }} state={{ fromAdmin: '/admin/committee', scrollTo: 'committee' }} className="inline-flex">
                                                    <Button variant="outline" className="border-orange-300 text-orange-700 bg-white hover:bg-orange-50">
                                                        View Home Section <ExternalLink className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </Link>
                    </div>
                )}
            </div>

            {/* Inline Add/Edit Form */}
            {!isReadOnly && showForm && (
                <Card className="mb-6 overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-white">{isEditing ? 'Edit' : 'Add'} Committee Member</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <Input
                                placeholder="Name"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                required
                            />
                            <Input
                                placeholder="Designation"
                                value={formData.designation}
                                onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                                required
                            />
                            <Textarea
                                placeholder="Profile Description"
                                value={formData.profile_description}
                                onChange={(e) => setFormData(prev => ({ ...prev, profile_description: e.target.value }))}
                                required
                                className="min-h-24 resize-y"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <Input
                                    placeholder="Prefix"
                                    value={formData.mobile_prefix}
                                    onChange={(e) => {
                                        let value = e.target.value;
                                        if (!value || value[0] !== '+') {
                                            const digits = value.replace(/\D/g, '');
                                            value = `+${digits}`;
                                        }
                                        setFormData(prev => ({ ...prev, mobile_prefix: value }));
                                    }}
                                    required
                                />
                                <div className="col-span-2">
                                    <Input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        placeholder="Phone Number"
                                        value={formData.phone_number}
                                        onChange={(e) => {
                                            const onlyDigits = e.target.value.replace(/[^0-9]/g, '');
                                            setFormData(prev => ({ ...prev, phone_number: onlyDigits }));
                                        }}
                                        onBeforeInput={(e: any) => {
                                            // Block non-digit characters before they get inserted
                                            if (e?.data && /\D/.test(e.data)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.ctrlKey || e.metaKey) return; // allow shortcuts
                                            const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                                            if (allowed.includes(e.key)) return;
                                            if (!/^[0-9]$/.test(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onPaste={(e) => {
                                            // Ensure pasted content is digits only
                                            const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                                            e.preventDefault();
                                            setFormData(prev => ({ ...prev, phone_number: (prev.phone_number + text).slice(0, 15) }));
                                        }}
                                        onDrop={(e) => {
                                            // Prevent dropping arbitrary text into the field
                                            e.preventDefault();
                                        }}
                                        maxLength={15}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    ref={fileInputRef}
                                    disabled={false}
                                />
                                {uploading && <p>Uploading...</p>}
                                {uploadError && <p className="text-red-500">{uploadError}</p>}
                                {(formData.image || selectedFile) && (
                                    <div className="mt-2">
                                        <img
                                            src={selectedFile ? URL.createObjectURL(selectedFile) : resolveImageUrl(formData.image)}
                                            alt="Preview"
                                            className="w-full h-32 object-cover rounded-md"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/600x400'; }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 justify-end flex-wrap">
                                <Button type="button" variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>Cancel</Button>
                                <Button type="submit" disabled={mutation.isPending || uploading}>
                                    {mutation.isPending || uploading ? 'Saving...' : (isEditing ? 'Update' : 'Save')}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Inline Configure Order Section */}
            {!isReadOnly && showOrder && (
                <Card className="mb-6 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                        <CardTitle>Configure Display Order</CardTitle>
                        <Button variant="ghost" onClick={() => setShowOrder(false)} className="text-orange-700 hover:bg-orange-50">Close</Button>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="preview">
                            <TabsList className="flex flex-wrap gap-2">
                                <TabsTrigger value="preview">Preview Order (Homepage Section)</TabsTrigger>
                                <TabsTrigger value="view">View Order (Members Page)</TabsTrigger>
                            </TabsList>
                            <TabsContent value="preview">
                                <OrderConfigurator type="preview" members={members ?? []} onSave={(payload) => {
                                    orderMutation.mutate(payload);
                                }} />
                            </TabsContent>
                            <TabsContent value="view">
                                <OrderConfigurator type="view" members={members ?? []} onSave={(payload) => {
                                    orderMutation.mutate(payload);
                                }} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {members?.map((member) => (
                    <Card key={member._id}>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg">{member.name}</h3>
                                    <p className="text-sm text-gray-600">{member.designation}</p>
                                </div>
                                {!isReadOnly && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleEdit(member)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleDelete(member._id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {member.image && (
                                <div className="flex justify-center mb-4">
                                    <img src={resolveImageUrl(member.image)} alt={member.name} className="w-24 h-24 object-cover rounded-full border-2 border-primary/20" />
                                </div>
                            )}
                            <p className="text-sm mb-2">{member.profile_description}</p>
                            <p className="text-sm text-gray-600">{(member.mobile_prefix ?? '+91') + ' ' + member.phone_number}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {/* removed modal-based order dialog; using inline section above */}
        </div>
    );
};

export default ManageCommittee;

// --- Ordering UI below ---
type OrderType = 'preview' | 'view';

const OrderConfigurator = ({ type, members, onSave }: {
    type: OrderType;
    members: CommitteeMember[];
    onSave: (payload: Array<{ _id: string; preview_order: number | null; view_order: number | null }>) => void;
}) => {
    const [local, setLocal] = useState(members.map(m => ({ ...m })));
    const isPreview = type === 'preview';
    const maxPreview = 7;
    const [dragId, setDragId] = useState<string | null>(null);

    const sorted = useMemo(() => {
        return local.slice().sort((a, b) => {
            const ao = isPreview ? (a.preview_order ?? Number.POSITIVE_INFINITY) : (a.view_order ?? Number.POSITIVE_INFINITY);
            const bo = isPreview ? (b.preview_order ?? Number.POSITIVE_INFINITY) : (b.view_order ?? Number.POSITIVE_INFINITY);
            if (ao !== bo) return ao - bo;
            return a.name.localeCompare(b.name);
        });
    }, [local, isPreview]);

    const handleChange = (id: string, value: string) => {
        const raw = value ? parseInt(value, 10) : NaN;
        setLocal(prev => {
            const key: 'preview_order' | 'view_order' = isPreview ? 'preview_order' : 'view_order';
            const maxPreview = 7;
            const nextList = prev.map(m => ({ ...m }));
            const idx = nextList.findIndex(m => m._id === id);
            if (idx === -1) return prev;

            if (isPreview) {
                // Preview: block duplicates instead of auto-resolving.
                if (isNaN(raw)) {
                    (nextList[idx] as any)[key] = null; // None selected
                    return nextList;
                }
                const n = Math.min(Math.max(raw, 1), maxPreview);
                const duplicateOwner = nextList.find(m => m._id !== id && (m as any)[key] === n);
                if (duplicateOwner) {
                    toast.error(`Position ${n} is already assigned to ${duplicateOwner.name}.`);
                    return prev; // do not change
                }
                (nextList[idx] as any)[key] = n;
                return nextList;
            }

            // View: interpret value as a command for reordering (up/down/top/bottom/clear)
            const cmd = value;
            const sortedByView = nextList.slice().sort((a, b) => {
                const ao = a.view_order ?? Number.POSITIVE_INFINITY;
                const bo = b.view_order ?? Number.POSITIVE_INFINITY;
                if (ao !== bo) return ao - bo;
                return a.name.localeCompare(b.name);
            });
            const iInSorted = sortedByView.findIndex(m => m._id === id);
            if (iInSorted === -1) return prev;
            const move = (from: number, to: number) => {
                const arr = sortedByView;
                const [item] = arr.splice(from, 1);
                arr.splice(to, 0, item);
            };
            if (cmd === 'up' && iInSorted > 0) move(iInSorted, iInSorted - 1);
            if (cmd === 'down' && iInSorted < sortedByView.length - 1) move(iInSorted, iInSorted + 1);
            if (cmd === 'top') move(iInSorted, 0);
            if (cmd === 'bottom') move(iInSorted, sortedByView.length - 1);
            if (cmd === 'clear') {
                // send to end (null for view_order)
                (nextList[idx] as any)[key] = null;
                return nextList;
            }
            // write back new sequential view_order based on new order
            sortedByView.forEach((m, i) => {
                const target = nextList.find(n => n._id === m._id)!;
                (target as any)[key] = i + 1;
            });
            return nextList;
        });
    };

    const handleSave = () => {
        if (isPreview) {
            const count = local.filter(m => typeof m.preview_order === 'number').length;
            if (count > maxPreview) {
                toast.error(`Preview can include at most ${maxPreview} members.`);
                return;
            }
        }
        // Ensure view_order is sequential based on current order for 'view'
        let payload = local.map(m => ({ ...m }));
        if (!isPreview) {
            const ordered = payload.slice().sort((a, b) => {
                const ao = a.view_order ?? Number.POSITIVE_INFINITY;
                const bo = b.view_order ?? Number.POSITIVE_INFINITY;
                if (ao !== bo) return ao - bo;
                return a.name.localeCompare(b.name);
            });
            ordered.forEach((m, i) => {
                const found = payload.find(x => x._id === m._id)!;
                found.view_order = i + 1;
            });
        }
        onSave(payload.map(m => ({ _id: m._id, preview_order: m.preview_order ?? null, view_order: m.view_order ?? null })));
    };

    const swapByDrag = (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return;
        setLocal(prev => {
            const next = prev.map(m => ({ ...m }));
            // Build ordered list by current view order
            const ordered = next.slice().sort((a, b) => {
                const ao = a.view_order ?? Number.POSITIVE_INFINITY;
                const bo = b.view_order ?? Number.POSITIVE_INFINITY;
                if (ao !== bo) return ao - bo;
                return a.name.localeCompare(b.name);
            });
            const si = ordered.findIndex(m => m._id === sourceId);
            const ti = ordered.findIndex(m => m._id === targetId);
            if (si === -1 || ti === -1) return prev;
            const [item] = ordered.splice(si, 1);
            ordered.splice(ti, 0, item);
            // Re-sequence 1..N for view_order
            ordered.forEach((m, i) => {
                const ref = next.find(x => x._id === m._id)!;
                ref.view_order = i + 1;
            });
            return next;
        });
    };

    const onDragStartCard = (id: string) => (e: React.DragEvent) => {
        setDragId(id);
        try { e.dataTransfer.setData('text/plain', id); } catch {}
        e.dataTransfer.effectAllowed = 'move';
    };
    const onDragOverCard = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const onDropOnCard = (id: string) => (e: React.DragEvent) => {
        e.preventDefault();
        const src = dragId || (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return ''; } })();
        if (!src || src === id) return;
        swapByDrag(src, id);
        setDragId(null);
    };

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground">
                {isPreview ? 'Assign 1-7 for homepage preview. Leave blank to exclude (null).' : 'Drag and drop cards below to reorder them on the public members page.'}
            </div>
            {isPreview ? (
                <div>
                    <div className="mb-6 text-center">
                        {sorted.find(m => m.preview_order === 1) ? (
                            <PreviewAvatar member={sorted.find(m => m.preview_order === 1)!} size="lg" />
                        ) : (
                            <div className="text-muted-foreground">No member assigned to position 1</div>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-10 md:gap-x-20">
                        {sorted.filter(m => typeof m.preview_order === 'number' && m.preview_order! >= 2 && m.preview_order! <= 7)
                            .sort((a, b) => (a.preview_order! - b.preview_order!))
                            .map(m => (<PreviewAvatar key={m._id} member={m} />))}
                    </div>
                </div>
            ) : (
                (() => {
                    const featured = sorted.length > 0 ? sorted[0] : null;
                    const rest = sorted.slice(1);
                    return (
                        <div className="space-y-8">
                            {featured && (
                                <div className="flex justify-center mb-4">
                                    <div
                                        draggable
                                        onDragStart={onDragStartCard(featured._id)}
                                        onDragOver={onDragOverCard}
                                        onDrop={onDropOnCard(featured._id)}
                                        className="cursor-move"
                                    >
                                        <Card className="overflow-hidden card-divine w-full max-w-md">
                                            {featured.image && (
                                                <div className="flex justify-center mt-6">
                                                    <img src={resolveImageUrl(featured.image)} alt={featured.name} className="w-28 h-28 object-cover rounded-full border-4 border-primary/20" />
                                                </div>
                                            )}
                                            <CardHeader className="pb-2 text-center">
                                                <CardTitle className="text-2xl">{featured.name}</CardTitle>
                                                <p className="text-sm text-muted-foreground font-medium">{featured.designation}</p>
                                            </CardHeader>
                                            <CardContent className="text-center">
                                                <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {(featured.mobile_prefix ?? '+91') + ' ' + featured.phone_number}</p>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            )}
                            {rest.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
                                    {rest.map(m => (
                                        <div
                                            key={m._id}
                                            draggable
                                            onDragStart={onDragStartCard(m._id)}
                                            onDragOver={onDragOverCard}
                                            onDrop={onDropOnCard(m._id)}
                                            className="cursor-move w-full max-w-xs"
                                        >
                                            <Card className="overflow-hidden card-divine w-full">
                                                {m.image && (
                                                    <div className="flex justify-center mt-6">
                                                        <img src={resolveImageUrl(m.image)} alt={m.name} className="w-24 h-24 object-cover rounded-full border-4 border-primary/20" />
                                                    </div>
                                                )}
                                                <CardHeader className="pb-2 text-center">
                                                    <CardTitle className="text-xl">{m.name}</CardTitle>
                                                    <p className="text-sm text-muted-foreground font-medium">{m.designation}</p>
                                                </CardHeader>
                                                <CardContent className="text-center">
                                                    <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {(m.mobile_prefix ?? '+91') + ' ' + m.phone_number}</p>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()
            )}

                <div className="border rounded-md p-4">
                <div className="grid grid-cols-12 text-xs font-semibold text-muted-foreground mb-2">
                    <div className="col-span-5">Member</div>
                    <div className="col-span-5">Designation</div>
                    <div className="col-span-2 text-right">{isPreview ? 'Preview Pos' : 'Drag above'}</div>
                </div>
                <div className="space-y-2 max-h-80 overflow-auto pr-2">
                    {local.map(m => (
                        <div key={m._id} className="grid grid-cols-12 items-center gap-2">
                            <div className="col-span-5 truncate">{m.name}</div>
                            <div className="col-span-5 truncate text-muted-foreground">{m.designation}</div>
                            <div className="col-span-2">
                                {isPreview ? (
                                    <Select
                                        value={m.preview_order ? String(m.preview_order) : '__none__'}
                                        onValueChange={(v) => handleChange(m._id, v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="None" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {/* Use a non-empty sentinel value for None to satisfy Radix requirement */}
                                            <SelectItem value="__none__">None</SelectItem>
                                            {[1,2,3,4,5,6,7].map(n => {
                                                const usedByOther = local.some(o => o._id !== m._id && o.preview_order === n);
                                                const label = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
                                                return (
                                                    <SelectItem key={n} value={String(n)} disabled={usedByOther}>
                                                        {label}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="text-right text-xs text-muted-foreground">Drag cards above</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLocal(members.map(m => ({ ...m })))}>Reset</Button>
                <Button onClick={handleSave}>Save Order</Button>
            </div>
        </div>
    );
};

const PreviewAvatar = ({ member, size = 'md' }: { member: CommitteeMember; size?: 'md' | 'lg' }) => {
    const dim = size === 'lg' ? 'w-40 h-40' : 'w-32 h-32';
    return (
        <div className="text-center flex-shrink-0">
            <div className={`${dim} mx-auto rounded-full overflow-hidden border-4 border-primary/20 shadow-sm`}>
                {member.image ? (
                    <img src={resolveImageUrl(member.image)} alt={member.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-muted" />
                )}
            </div>
            <div className="mt-2">
                <div className="text-sm font-semibold">{member.name}</div>
                <div className="text-xs text-muted-foreground">{member.designation}</div>
            </div>
        </div>
    );
};
