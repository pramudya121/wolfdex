/**
 * Ecosystem directory — public grid of dApps building on LitVM alongside
 * WolfDex. The owner wallet (owner of the DexAggregatorRouter contract) gets an
 * inline manager to add, edit, and remove entries; every write is signed by
 * that wallet and verified server-side.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  CheckCircle2,
  ImagePlus,
  LayoutGrid,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useDexContext } from '@/context/DexContext';
import { useAggregatorOwner } from '@/hooks/useAggregator';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WolfSkeleton } from '@/components/dex/ui/WolfSkeleton';
import {
  listEcosystemDapps,
  saveEcosystemDapp,
  buildEcosystemMessage,
  type EcosystemDapp,
} from '@/lib/ecosystem.functions';

const CATEGORIES = ['DeFi', 'Launchpad', 'NFT', 'Gaming', 'Infrastructure', 'Tools', 'Social', 'Bridge'] as const;
const MAX_LOGO_BYTES = 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface FormState {
  id?: string;
  name: string;
  url: string;
  logo_url: string;
  description: string;
  category: string;
}

const EMPTY_FORM: FormState = { name: '', url: '', logo_url: '', description: '', category: 'DeFi' };

export default function EcosystemView() {
  const { wallet } = useDexContext();
  const { isOwner } = useAggregatorOwner(wallet.address);
  const [dapps, setDapps] = useState<EcosystemDapp[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listEcosystemDapps();
      setDapps(rows);
    } catch {
      setDapps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const clearLogoFile = () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetForm = () => {
    clearLogoFile();
    setForm(EMPTY_FORM);
  };

  const acceptLogo = (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      toast.error('Unsupported logo format', { description: 'Use PNG, JPG, or WEBP.' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo is too large', { description: 'Maximum file size is 1 MB.' });
      return;
    }
    clearLogoFile();
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (file: File) => {
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const safeName = form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dapp';
    const path = `ecosystem/${safeName}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('token-logos').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message || 'Logo upload failed');
    const { data } = supabase.storage.from('token-logos').getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Could not create the logo link');
    return data.publicUrl;
  };

  const submit = async (remove = false) => {
    if (!wallet.signer) { toast.error('Connect the owner wallet first'); return; }
    if (!remove) {
      if (!form.name.trim()) { toast.error('Name is required'); return; }
      if (!/^https:\/\/\S+$/i.test(form.url.trim())) { toast.error('Website must be a full https link'); return; }
    }
    setBusy(true);
    try {
      const logoUrl = logoFile ? await uploadLogo(logoFile) : form.logo_url.trim();
      const timestamp = Date.now();
      const signature = await wallet.signer.signMessage(
        buildEcosystemMessage(form.name.trim(), form.url.trim(), timestamp),
      );
      await saveEcosystemDapp({
        data: {
          id: form.id,
          name: form.name.trim(),
          url: form.url.trim(),
          logo_url: logoUrl,
          description: form.description.trim(),
          category: form.category,
          remove,
          timestamp,
          signature,
        },
      });
      toast.success(remove ? 'App removed' : form.id ? 'App updated' : 'App added to the ecosystem');
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error('Could not save', { description: e?.message || 'Please retry' });
    } finally {
      setBusy(false);
    }
  };

  const edit = (d: EcosystemDapp) => {
    clearLogoFile();
    setForm({
      id: d.id,
      name: d.name,
      url: d.url,
      logo_url: d.logo_url ?? '',
      description: d.description ?? '',
      category: d.category,
    });
    setShowForm(true);
  };

  const categories = ['All', ...CATEGORIES];
  const visible = filter === 'All' ? dapps : dapps.filter(d => d.category === filter);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <section className="relative mb-8 overflow-hidden border-y border-wolf-border/30 py-10 sm:py-14">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase text-wolf-gold">
            <span className="h-px w-8 bg-wolf-gold/70" />
            Built on LitVM
          </div>
          <h1 className="mb-4 text-4xl font-black sm:text-6xl">The WolfDex <span className="wolf-gradient-text">Ecosystem</span></h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Discover trusted products, protocols, and communities shaping the next generation of the LitVM network.
          </p>
          <div className="mt-7 flex flex-wrap gap-6 text-sm">
            <div><strong className="block text-2xl text-foreground">{dapps.length}</strong><span className="text-muted-foreground">Listed projects</span></div>
            <div><strong className="block text-2xl text-foreground">{new Set(dapps.map(d => d.category)).size}</strong><span className="text-muted-foreground">Active categories</span></div>
            <div className="flex items-center gap-2 text-wolf-green"><ShieldCheck className="h-5 w-5" /> Owner curated</div>
          </div>
        </div>
        <LayoutGrid className="absolute right-6 top-1/2 hidden h-48 w-48 -translate-y-1/2 text-wolf-pink/10 lg:block" strokeWidth={0.6} />
      </section>

      {/* Owner controls */}
      {isOwner && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <span className="inline-flex items-center gap-2 text-xs text-wolf-green">
              <CheckCircle2 className="h-4 w-4" /> Owner wallet verified
            </span>
            <Button onClick={() => { resetForm(); setShowForm(v => !v); }} className="h-10 px-4">
              {showForm ? <><X /> Close</> : <><Plus /> Add project</>}
            </Button>
          </div>

          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-7 border border-wolf-border/40 bg-wolf-surface/50 p-5 sm:p-6 space-y-5 rounded-lg">
                  <div>
                    <h2 className="text-lg font-bold">{form.id ? 'Edit project' : 'Add a new project'}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Project details are published after verification with your owner wallet.</p>
                  </div>
                  <div className="grid lg:grid-cols-[1fr_220px] gap-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>App name</span>
                      <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="LitDex"
                        className="h-11 bg-wolf-bg/70"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>Website link</span>
                      <Input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                        placeholder="https://example.com"
                        className="h-11 bg-wolf-bg/70"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>Category</span>
                      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                        className="h-11 w-full rounded-md border border-input bg-wolf-bg/70 px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                      <label className="text-xs text-muted-foreground space-y-1 block sm:col-span-2">
                        <span>Short description</span>
                        <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                          rows={4} maxLength={280} placeholder="Tell visitors what this project does."
                          className="resize-none bg-wolf-bg/70"
                        />
                        <span className="block text-right text-[10px]">{form.description.length}/280</span>
                      </label>
                    </div>
                    <label
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); acceptLogo(e.dataTransfer.files[0]); }}
                      className={`relative flex min-h-44 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed p-4 text-center transition-colors ${dragging ? 'border-wolf-pink bg-wolf-pink/10' : 'border-wolf-border/60 bg-wolf-bg/50 hover:border-wolf-pink/60'}`}
                    >
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => acceptLogo(e.target.files?.[0])} />
                      {logoPreview || form.logo_url ? (
                        <>
                          <img src={logoPreview || form.logo_url} alt="Logo preview" className="h-20 w-20 rounded-lg border border-wolf-border/40 bg-wolf-bg object-cover" />
                          <span className="mt-3 text-xs font-semibold text-foreground">Replace logo</span>
                        </>
                      ) : (
                        <>
                          <span className="mb-3 rounded-full bg-wolf-pink/10 p-3 text-wolf-pink"><UploadCloud className="h-6 w-6" /></span>
                          <span className="text-xs font-semibold text-foreground">Upload project logo</span>
                          <span className="mt-1 text-[10px] text-muted-foreground">PNG, JPG, WEBP · max 1 MB</span>
                        </>
                      )}
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-wolf-border/30 pt-4">
                    <Button disabled={busy} onClick={() => submit(false)}>
                      {busy ? <><LoaderCircle className="animate-spin" /> Publishing…</> : <><ImagePlus /> {form.id ? 'Save changes' : 'Publish project'}</>}
                    </Button>
                    {form.id && (
                      <Button variant="outline" disabled={busy} onClick={() => submit(true)} className="border-wolf-red/40 text-wolf-red hover:text-wolf-red">
                        <Trash2 /> Remove
                      </Button>
                    )}
                    <p className="ml-auto text-[11px] text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Secured by owner wallet signature</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase text-wolf-gold">Directory</p><h2 className="mt-1 text-2xl font-bold">Explore projects</h2></div>
        <p className="hidden text-xs text-muted-foreground sm:block">{visible.length} {visible.length === 1 ? 'project' : 'projects'}</p>
      </div>
      {categories.length > 1 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {categories.map(c => (
            <Button key={c} variant="outline" size="sm" onClick={() => setFilter(c)}
              className={`shrink-0 ${
                filter === c
                  ? 'border-wolf-pink/60 bg-wolf-pink/15 text-foreground'
                  : 'border-wolf-border/30 bg-wolf-surface/40 text-muted-foreground'
              }`}
            >{c}</Button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <WolfSkeleton key={i} flat className="h-56 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="border-y border-wolf-border/25 py-20 text-center">
          <LayoutGrid className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
          <p className="font-semibold">No projects found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another category or check back soon.</p>
          {isOwner && <p className="text-xs text-muted-foreground mt-1">Use “Add dApp” to publish the first one.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((d, i) => (
            <motion.div key={d.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
              whileHover={{ y: -4 }}
              className="group relative flex min-h-56 flex-col overflow-hidden rounded-lg border border-wolf-border/35 bg-wolf-surface/45 p-5 transition-colors hover:border-wolf-pink/45"
            >
              <div className="flex items-start gap-3 relative">
                {d.logo_url ? (
                  <img src={d.logo_url} alt={`${d.name} logo`} loading="lazy"
                    className="h-12 w-12 rounded-lg border border-wolf-border/30 bg-wolf-bg object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = '/favicon.ico'; }}
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-wolf-pink/15 font-bold text-wolf-pink">
                    {d.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold">{d.name}</h3>
                    <span className="rounded-full bg-wolf-gold/15 px-2 py-0.5 text-[10px] text-wolf-gold">{d.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{d.url.replace(/^https?:\/\//, '')}</p>
                </div>
              </div>
              {d.description && (
                <p className="relative mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{d.description}</p>
              )}
              <div className="relative mt-auto flex items-center gap-2 pt-5">
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >Visit project <ArrowUpRight className="h-3.5 w-3.5" /></a>
                {isOwner && (
                  <Button variant="outline" size="icon" onClick={() => edit(d)} aria-label={`Edit ${d.name}`}>
                    <Pencil />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
