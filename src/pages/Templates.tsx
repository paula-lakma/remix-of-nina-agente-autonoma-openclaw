import React, { useState } from "react";
import { useMetaTemplates } from "@/hooks/useMetaTemplates";
import { Button } from "@/components/Button";
import { FileText, Plus, RefreshCw, Trash2, Loader2, X, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { templateStatusLabel, categoryChange, CATEGORY_LABEL, templateReview } from "../../supabase/functions/_shared/templateRules";

const statusStyle: Record<string, { color: string; icon: React.ReactNode }> = {
  APPROVED: { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  PENDING: { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: <Clock className="w-3 h-3" /> },
  IN_APPEAL: { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: <Clock className="w-3 h-3" /> },
  REJECTED: { color: "bg-red-500/20 text-red-300 border-red-500/30", icon: <XCircle className="w-3 h-3" /> },
  PAUSED: { color: "bg-orange-500/20 text-orange-300 border-orange-500/30", icon: <Clock className="w-3 h-3" /> },
  DISABLED: { color: "bg-red-500/20 text-red-300 border-red-500/30", icon: <XCircle className="w-3 h-3" /> },
};

const Templates: React.FC = () => {
  const { templates, loading, submit, syncStatuses, remove } = useMetaTemplates();
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState(false);

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-cyan-400" /> Templates HSM (Meta)
          </h2>
          <p className="text-sm text-slate-400 mt-1">Templates oficiais aprovados pela Meta para uso fora da janela 24h.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              setSyncing(true);
              try {
                const res: any = await syncStatuses();
                const changed = (res?.updated ?? 0) + (res?.inserted ?? 0);
                toast.success(
                  changed > 0
                    ? `Status atualizado: ${changed} alterado(s), ${res?.unchanged ?? 0} sem mudança`
                    : `Sincronizado: nenhum status mudou (${res?.unchanged ?? 0} iguais)`,
                );
              } catch (e: any) {
                toast.error(e?.message || "Falha ao sincronizar com a Meta");
              }
              setSyncing(false);
            }}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sincronizar
          </Button>

          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-2" /> Novo template</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : templates.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-2xl p-10 text-center">
          <FileText className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">Nenhum template ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const s = statusStyle[t.status] || { color: "bg-slate-700 text-slate-200", icon: null };
            const review = templateReview(t.samples);
            const reason = typeof review.rejected_reason === "string" ? review.rejected_reason : null;
            const catChange = categoryChange(review, t.category);
            return (
              <div key={t.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-white">{t.name}</h3>
                    <div className="text-xs text-slate-500">{CATEGORY_LABEL[t.category] ?? t.category} · {t.language}</div>
                  </div>
                  <span title={t.status} className={`px-2 py-0.5 rounded-full text-xs border inline-flex items-center gap-1 ${s.color}`}>
                    {s.icon} {templateStatusLabel(t.status)}
                  </span>
                </div>
                {t.status === "REJECTED" && reason && (
                  <div className="text-xs text-red-300 mb-2">Motivo da Meta: {reason}</div>
                )}
                {catChange && (
                  <div role="note" className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2 py-1 mb-2">
                    Categoria solicitada: {CATEGORY_LABEL[catChange.requested] ?? catChange.requested}.<br />
                    Categoria definida pela Meta: {CATEGORY_LABEL[catChange.current] ?? catChange.current}.
                  </div>
                )}
                <div className="text-xs text-slate-500 mb-3">ID: {t.meta_template_id || "—"}</div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={async () => { if (confirm("Excluir?")) { await remove(t.id); toast.success("Removido"); } }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewTemplateModal onClose={() => setShowNew(false)} onSubmit={submit} />}
    </div>
  );
};

const NewTemplateModal: React.FC<{
  onClose: () => void;
  onSubmit: (data: unknown, opts?: { isEdit?: boolean; templateId?: string; metaTemplateId?: string }) => Promise<unknown>;
}> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [samples, setSamples] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !body) { toast.error("Nome e corpo são obrigatórios"); return; }
    if (!/^[a-z0-9_]+$/.test(name)) { toast.error("Nome só pode ter letras minúsculas, números e underscore"); return; }
    setSaving(true);
    try {
      const components: any[] = [{ type: "BODY", text: body }];
      if (footer) components.push({ type: "FOOTER", text: footer });
      const bodySamples = samples.split(",").map((s) => s.trim()).filter(Boolean);
      const templateData = {
        name, category, language, components,
        samples: bodySamples.length ? { bodySamples } : undefined,
      };
      await onSubmit(templateData);
      toast.success("Template enviado para aprovação Meta");
      onClose();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold">Novo template HSM</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Nome (a-z, 0-9, _)</label>
            <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-300">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidade</option>
                <option value="AUTHENTICATION">Autenticação</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Idioma</label>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-300">Corpo (use {"{{1}}"}, {"{{2}}"}…)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm text-slate-300">Exemplos das variáveis (separados por vírgula)</label>
            <input value={samples} onChange={(e) => setSamples(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" placeholder="João, R$ 100,00" />
          </div>
          <div>
            <label className="text-sm text-slate-300">Rodapé (opcional)</label>
            <input value={footer} onChange={(e) => setFooter(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar para Meta"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Templates;
