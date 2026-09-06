/**
 * Ecosystem directory — public grid of dApps building on LitVM alongside
 * WolfDex. The owner wallet (owner of the DexAggregatorRouter contract) gets an
 * inline manager to add, edit, and remove entries; every write is signed by
 * that wallet and verified server-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useDexContext } from '@/context/DexContext';
import { useAggregatorOwner } from '@/hooks/useAggregator';
import {
  listEcosystemDapps,
  saveEcosystemDapp,
  buildEcosystemMessage,
  type EcosystemDapp,
} from '@/lib/ecosystem.functions';

const CATEGORIES = ['DeFi', 'NFT', 'Gaming', 'Infra', 'Tools', 'Social', 'Bridge'] as const;

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
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>('All');

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

  const submit = async (remove = false) => {
    if (!wallet.signer) { toast.error('Connect the owner wallet first'); return; }
    if (!remove) {
      if (!form.name.trim()) { toast.error('Name is required'); return; }
      if (!/^https:\/\/\S+$/i.test(form.url.trim())) { toast.error('Website must be a full https link'); return; }
      if (form.logo_url.trim() && !/^https:\/\/\S+$/i.test(form.logo_url.trim())) {
        toast.error('Logo must be a full https image link'); return;
      }
    }
    setBusy(true);
    try {
      const timestamp = Date.now();
      const signature = await wallet.signer.signMessage(
        buildEcosystemMessage(form.name.trim(), form.url.trim(), timestamp),
      );
      await saveEcosystemDapp({
        data: {
          id: form.id,
          name: form.name.trim(),
          url: form.url.trim(),
          logo_url: form.logo_url.trim(),
          description: form.description.trim(),
          category: form.category,
          remove,
          timestamp,
          signature,
        },
      });
      toast.success(remove ? 'App removed' : form.id ? 'App updated' : 'App added to the ecosystem');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast.error('Could not save', { description: e?.message || 'Please retry' });
    } finally {
      setBusy(false);
    }
  };

  const edit = (d: EcosystemDapp) => {
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

  const categories = ['All', ...Array.from(new Set(dapps.map(d => d.category)))];
  const visible = filter === 'All' ? dapps : dapps.filter(d => d.category === filter);

  return (
    <div className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <div className="text-center mb-8 relative">
        <div className="absolute inset-x-10 -top-6 h-40 -z-10 rounded-full bg-wolf-pink/10 blur-3xl" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-surface/60 border border-wolf-border/30 text-[11px] mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" />
          <span className="text-muted-foreground">Built on LitVM</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black wolf-gradient-text mb-2 tracking-tight">Ecosystem</h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Explore the apps growing around WolfDex — DeFi, NFTs, gaming, tooling and more.
        </p>
      </div>

      {/* Owner controls */}
      {isOwner && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs px-2 py-1 rounded-full bg-wolf-gold/15 text-wolf-gold border border-wolf-gold/30">
              Owner wallet connected
            </span>
            <button
              onClick={() => { setForm(EMPTY_FORM); setShowForm(v => !v); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-wolf-pink to-wolf-gold text-white"
            >
              {showForm ? 'Close' : '+ Add dApp'}
            </button>
          </div>

          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-wolf-border/30 bg-wolf-surface/50 p-4 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>App name</span>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="LitDex"
                        className="w-full px-3 py-2 rounded-xl bg-wolf-bg border border-wolf-border/40 text-sm text-foreground outline-none focus:border-wolf-pink/50"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>Website link</span>
                      <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                        placeholder="https://example.com"
                        className="w-full px-3 py-2 rounded-xl bg-wolf-bg border border-wolf-border/40 text-sm text-foreground outline-none focus:border-wolf-pink/50"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>Logo image link (https)</span>
                      <input value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })}
                        placeholder="https://example.com/logo.png"
                        className="w-full px-3 py-2 rounded-xl bg-wolf-bg border border-wolf-border/40 text-sm text-foreground outline-none focus:border-wolf-pink/50"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground space-y-1 block">
                      <span>Category</span>
                      <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-wolf-bg border border-wolf-border/40 text-sm text-foreground outline-none focus:border-wolf-pink/50"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="text-xs text-muted-foreground space-y-1 block">
                    <span>Short description</span>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                      rows={2} maxLength={280}
                      placeholder="What does this app do?"
                      className="w-full px-3 py-2 rounded-xl bg-wolf-bg border border-wolf-border/40 text-sm text-foreground outline-none focus:border-wolf-pink/50 resize-none"
                    />
                  </label>
                  {form.logo_url.trim() && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <img src={form.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-wolf-border/30"
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                      />
                      Logo preview
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => submit(false)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-wolf-pink to-wolf-gold text-white disabled:opacity-50"
                    >
                      {busy ? 'Signing…' : form.id ? 'Save changes' : 'Add to ecosystem'}
                    </button>
                    {form.id && (
                      <button disabled={busy} onClick={() => submit(true)}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border border-wolf-red/40 text-wolf-red disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Each change is signed by your wallet and verified against the contract owner.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Filters */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {categories.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === c
                  ? 'bg-wolf-pink/20 border-wolf-pink/50 text-foreground'
                  : 'bg-wolf-surface/60 border-wolf-border/30 text-muted-foreground hover:text-foreground'
              }`}
            >{c}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-36 rounded-2xl bg-wolf-surface/40 border border-wolf-border/20 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-wolf-border/25 bg-wolf-surface/30">
          <p className="text-sm text-muted-foreground">No apps listed yet.</p>
          {isOwner && <p className="text-xs text-muted-foreground mt-1">Use “Add dApp” to publish the first one.</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((d, i) => (
            <motion.div key={d.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl border border-wolf-border/30 bg-wolf-surface/50 p-4 overflow-hidden"
            >
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-wolf-pink/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start gap-3 relative">
                {d.logo_url ? (
                  <img src={d.logo_url} alt={`${d.name} logo`} loading="lazy"
                    className="w-11 h-11 rounded-xl object-cover border border-wolf-border/30 bg-wolf-bg"
                    onError={e => { (e.target as HTMLImageElement).src = '/favicon.ico'; }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-wolf-pink/30 to-wolf-gold/30 flex items-center justify-center font-bold">
                    {d.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm truncate">{d.name}</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wolf-gold/15 text-wolf-gold">{d.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{d.url.replace(/^https?:\/\//, '')}</p>
                </div>
              </div>
              {d.description && (
                <p className="mt-3 text-xs text-muted-foreground line-clamp-3 relative">{d.description}</p>
              )}
              <div className="mt-4 flex items-center gap-2 relative">
                <a href={d.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-wolf-pink to-wolf-gold text-white"
                >Visit site</a>
                {isOwner && (
                  <button onClick={() => edit(d)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-wolf-border/40 text-muted-foreground hover:text-foreground"
                  >Edit</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
