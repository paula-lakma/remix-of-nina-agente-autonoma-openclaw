import React, { useState } from "react";
import { useBroadcasts, BroadcastCampaign } from "@/hooks/useBroadcasts";
import { useMetaTemplates } from "@/hooks/useMetaTemplates";
import { Button } from "@/components/Button";
import { Megaphone, Play, Pause, Trash2, Plus, Loader2, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";

const statusColor: Record<string, string> = {
  draft: "bg-slate-700 text-slate-200",
  processing: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  paused: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  failed: "bg-red-500/20 text-red-300 border border-red-500/30",
};

const Campaigns: React.FC = () => {
  const { campaigns, loading, create, start, pause, resume, remove } = useBroadcasts();
  const { templates } = useMetaTemplates();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Megaphone className="w-7 h-7 text-cyan-400" /> Campanhas de disparo
          </h2>
          <p className="text-sm text-slate-400 mt-1">Envio em massa via WhatsApp Cloud API oficial (Meta).</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : campaigns.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-2xl p-10 text-center">
          <Megaphone className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">Nenhuma campanha ainda. Crie a primeira.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((c) => <CampaignCard key={c.id} c={c} onStart={start} onPause={pause} onResume={resume} onRemove={remove} />)}
        </div>
      )}

      {showNew && (
        <NewCampaignModal onClose={() => setShowNew(false)} onCreate={create} approvedTemplates={templates.filter((t) => t.status === "APPROVED")} />
      )}
    </div>
  );
};

const CampaignCard: React.FC<{
  c: BroadcastCampaign;
  onStart: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}> = ({ c, onStart, onPause, onResume, onRemove }) => {
  const [busy, setBusy] = useState(false);
  const pct = c.total_recipients ? Math.round(((c.sent_count + c.failed_count) / c.total_recipients) * 100) : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-white">{c.name}</h3>
          <div className="text-xs text-slate-500 mt-1">{c.message_type.toUpperCase()} · {c.total_recipients} destinatários</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[c.status] || "bg-slate-700 text-slate-200"}`}>{c.status}</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
        <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mb-4">
        <span>Enviados: {c.sent_count}</span>
        <span>Falhas: {c.failed_count}</span>
        <span>{pct}%</span>
      </div>
      <div className="flex gap-2">
        {c.status === "draft" && (
          <Button size="sm" onClick={async () => { setBusy(true); try { await onStart(c.id); toast.success("Iniciada"); } catch (e: any) { toast.error(e.message); } setBusy(false); }} disabled={busy}>
            <Play className="w-3 h-3 mr-1" /> Iniciar
          </Button>
        )}
        {c.status === "processing" && (
          <Button size="sm" variant="outline" onClick={async () => { setBusy(true); await onPause(c.id); setBusy(false); }} disabled={busy}>
            <Pause className="w-3 h-3 mr-1" /> Pausar
          </Button>
        )}
        {c.status === "paused" && (
          <Button size="sm" onClick={async () => { setBusy(true); await onResume(c.id); setBusy(false); }} disabled={busy}>
            <Play className="w-3 h-3 mr-1" /> Retomar
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={async () => { if (confirm("Excluir campanha?")) { await onRemove(c.id); toast.success("Removida"); } }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};

const NewCampaignModal: React.FC<{
  onClose: () => void;
  onCreate: (payload: Partial<BroadcastCampaign>, recipients: Array<{ phone_number: string; variables?: Record<string, unknown> }>) => Promise<BroadcastCampaign>;
  approvedTemplates: any[];
}> = ({ onClose, onCreate, approvedTemplates }) => {
  const [name, setName] = useState("");
  const [messageType, setMessageType] = useState<"text" | "template">("text");
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLang, setTemplateLang] = useState("pt_BR");
  const [batchSize, setBatchSize] = useState(10);
  const [delayMin, setDelayMin] = useState(5000);
  const [delayMax, setDelayMax] = useState(15000);
  const [delayBatch, setDelayBatch] = useState(300);
  const [recipients, setRecipients] = useState<Array<{ phone_number: string; variables?: Record<string, string> }>>([]);
  const [saving, setSaving] = useState(false);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  const loadFromContacts = async () => {
    const { data } = await supabase.from("contacts").select("phone_number, name").limit(5000);
    if (!data) return;
    setRecipients(data.filter((c) => c.phone_number).map((c: any) => ({ phone_number: c.phone_number, variables: { name: c.name || "" } })));
    toast.success(`${data.length} contatos carregados`);
  };

  const loadFromCsv = (file: File) => {
    Papa.parse<any>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const phoneCol = (res.meta.fields || []).find((f) => /phone|telefone|celular|whatsapp/i.test(f));
        if (!phoneCol) { toast.error("Coluna de telefone não encontrada"); return; }
        const rs = (res.data || []).map((r: any) => {
          const raw = String(r[phoneCol] || "").replace(/\D/g, "");
          if (!raw) return null;
          const { [phoneCol]: _p, ...rest } = r;
          return { phone_number: raw.startsWith("55") ? raw : "55" + raw, variables: rest };
        }).filter(Boolean) as any[];
        setRecipients(rs);
        toast.success(`${rs.length} destinatários carregados`);
      },
    });
  };

  const submit = async () => {
    if (!name || !recipients.length) { toast.error("Nome e destinatários são obrigatórios"); return; }
    if (messageType === "template" && !templateName) { toast.error("Selecione um template aprovado"); return; }
    if (messageType === "text" && !message) { toast.error("Escreva a mensagem"); return; }
    setSaving(true);
    try {
      await onCreate({
        name,
        message_type: messageType,
        message_template: message || templateName,
        template_name: messageType === "template" ? templateName : null,
        template_language: templateLang,
        batch_size: batchSize,
        delay_min_ms: delayMin,
        delay_max_ms: delayMax,
        delay_between_batches: delayBatch,
      }, recipients);
      toast.success("Campanha criada");
      onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold">Nova campanha</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-300">Tipo</label>
              <select value={messageType} onChange={(e) => setMessageType(e.target.value as any)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                <option value="text">Texto livre (janela 24h)</option>
                <option value="template">Template HSM (fora da janela)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Batch / delay batch (s)</label>
              <div className="flex gap-2 mt-1">
                <input type="number" value={batchSize} onChange={(e) => setBatchSize(+e.target.value)} className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
                <input type="number" value={delayBatch} onChange={(e) => setDelayBatch(+e.target.value)} className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          {messageType === "text" ? (
            <div>
              <label className="text-sm text-slate-300">Mensagem <span className="text-slate-500">(use {"{{name}}"} para personalizar)</span></label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-300">Template aprovado</label>
                <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                  <option value="">Selecione…</option>
                  {approvedTemplates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-300">Idioma</label>
                <input value={templateLang} onChange={(e) => setTemplateLang(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-300">Delay entre msgs (ms)</label>
              <div className="flex gap-2 mt-1">
                <input type="number" value={delayMin} onChange={(e) => setDelayMin(+e.target.value)} className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
                <input type="number" value={delayMax} onChange={(e) => setDelayMax(+e.target.value)} className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Destinatários: <b>{recipients.length}</b></span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadFromContacts}>Da base</Button>
                <label className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" /> CSV
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromCsv(e.target.files[0])} />
                </label>
              </div>
            </div>
            {recipients.slice(0, 5).map((r, i) => (
              <div key={i} className="text-xs text-slate-500">{r.phone_number}</div>
            ))}
            {recipients.length > 5 && <div className="text-xs text-slate-600">…e mais {recipients.length - 5}</div>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar rascunho"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Campaigns;
