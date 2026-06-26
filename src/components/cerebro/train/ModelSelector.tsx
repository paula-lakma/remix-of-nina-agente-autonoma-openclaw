import React, { useEffect, useState } from 'react';
import { Cpu, Loader2, Check, Zap, Sparkles, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type ModelKey = 'haiku' | 'sonnet' | 'opus';

interface ModelOption {
  key: ModelKey;
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const OPTIONS: ModelOption[] = [
  {
    key: 'haiku',
    id: 'claude-haiku-4-5',
    label: 'Haiku',
    description: 'Mais rápido e econômico. Ideal para respostas curtas e alto volume.',
    icon: <Zap className="w-4 h-4" />,
  },
  {
    key: 'sonnet',
    id: 'claude-sonnet-4-6',
    label: 'Sonnet',
    description: 'Equilíbrio entre custo, velocidade e raciocínio. Recomendado.',
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    key: 'opus',
    id: 'claude-opus-4-1',
    label: 'Opus',
    description: 'Máxima capacidade de raciocínio. Mais caro e mais lento.',
    icon: <Brain className="w-4 h-4" />,
  },
];

function resolveKey(id: string | null | undefined): ModelKey {
  const v = (id ?? '').toLowerCase();
  if (v.includes('opus')) return 'opus';
  if (v.includes('haiku')) return 'haiku';
  return 'sonnet';
}

const ModelSelector: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ModelKey | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ModelKey>('sonnet');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('nina_settings')
        .select('id, openclaw_model')
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[ModelSelector] load error', error);
      } else if (data) {
        setSettingsId(data.id);
        setSelected(resolveKey(data.openclaw_model));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSelect = async (opt: ModelOption) => {
    if (!settingsId || saving) return;
    if (opt.key === selected) return;
    setSaving(opt.key);
    const { error } = await supabase
      .from('nina_settings')
      .update({ openclaw_model: opt.id, updated_at: new Date().toISOString() })
      .eq('id', settingsId);
    setSaving(null);
    if (error) {
      console.error('[ModelSelector] save error', error);
      toast.error('Erro ao salvar modelo');
      return;
    }
    setSelected(opt.key);
    toast.success(`Modelo definido para ${opt.label}`);
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
        <Cpu className="w-4 h-4" />
        Modelo do OpenClaw (Claude)
      </label>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map((opt) => {
            const active = selected === opt.key;
            const busy = saving === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelect(opt)}
                disabled={!!saving}
                className={[
                  'relative text-left rounded-lg border p-3 transition-all',
                  active
                    ? 'border-cyan-500/60 bg-cyan-500/10 ring-1 ring-cyan-500/40'
                    : 'border-slate-700 bg-slate-950/60 hover:border-slate-600',
                  saving && !busy ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                    {opt.icon}
                    {opt.label}
                  </span>
                  {busy ? (
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : active ? (
                    <Check className="w-4 h-4 text-cyan-400" />
                  ) : null}
                </div>
                <p className="text-xs text-slate-400 leading-snug">{opt.description}</p>
                <code className="block text-[10px] text-slate-600 mt-2 font-mono">{opt.id}</code>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-2">
        O modelo selecionado é usado pelo gateway OpenClaw nas respostas da Nina.
      </p>
    </div>
  );
};

export default ModelSelector;
