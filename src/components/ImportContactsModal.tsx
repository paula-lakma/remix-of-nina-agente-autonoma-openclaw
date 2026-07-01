import React, { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import { Upload, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
}

type CsvRow = Record<string, string>;

const CANONICAL = ["phone", "name", "company", "city", "tags", "status"] as const;
type CanonicalField = typeof CANONICAL[number];

const ImportContactsModal: React.FC<Props> = ({ isOpen, onClose, onImported }) => {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<CanonicalField, string>>({} as any);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ inserted: 0, failed: 0 });

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setLoading(true);
    Papa.parse<CsvRow>(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const data = (res.data || []).filter((r) => Object.values(r).some((v) => (v ?? "").toString().trim()));
        const hs = res.meta.fields || [];
        setRows(data); setHeaders(hs);
        // AI-mapping
        try {
          const { data: aiRes } = await supabase.functions.invoke("ai-column-mapper", {
            body: { headers: hs, sampleRows: data.slice(0, 3) },
          });
          if (aiRes?.mapping) setMapping(aiRes.mapping);
          if (aiRes?.custom_fields) setCustomFields(aiRes.custom_fields);
        } catch (e) { console.warn("AI mapper failed", e); }
        setLoading(false);
      },
      error: (err) => { toast.error(`Erro CSV: ${err.message}`); setLoading(false); },
    });
  };

  const normalizePhone = (raw: string): string | null => {
    let d = String(raw ?? "").replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    if (d.length < 10 || d.length > 11) return null;
    if (d.length === 10) return "55" + d.slice(0, 2) + "9" + d.slice(2);
    return "55" + d;
  };

  const runImport = async () => {
    if (!mapping.phone) { toast.error("Mapeie a coluna de telefone"); return; }
    setImporting(true);
    setProgress({ inserted: 0, failed: 0 });
    let inserted = 0, failed = 0;
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const payload = chunk.map((r) => {
        const phone = normalizePhone(r[mapping.phone]);
        if (!phone) return null;
        const custom: Record<string, string> = {};
        for (const c of customFields) if (r[c]) custom[c] = r[c];
        return {
          phone_number: phone,
          phone: phone,
          name: mapping.name ? r[mapping.name] : null,
          company: mapping.company ? r[mapping.company] : null,
          city: mapping.city ? r[mapping.city] : null,
          status_lead: mapping.status ? r[mapping.status] : null,
          tags: mapping.tags ? (r[mapping.tags] || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean) : null,
          custom_fields: Object.keys(custom).length ? custom : null,
          whatsapp_valid: true,
        };
      }).filter(Boolean) as any[];
      if (!payload.length) { failed += chunk.length; continue; }
      const { error } = await supabase.from("contacts").upsert(payload, { onConflict: "phone_number" });
      if (error) { failed += payload.length; console.error(error); }
      else inserted += payload.length;
      setProgress({ inserted, failed });
    }
    toast.success(`Importação concluída: ${inserted} inseridos, ${failed} falhas`);
    setImporting(false);
    onImported?.(inserted);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2"><Upload className="w-5 h-5" /> Importar contatos (CSV)</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-6">
          {!rows.length && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-10 cursor-pointer hover:border-cyan-500 transition-colors">
              <Upload className="w-8 h-8 text-slate-500 mb-3" />
              <span className="text-sm text-slate-300">Selecione um arquivo .csv</span>
              <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {loading && <Loader2 className="w-5 h-5 animate-spin mt-3 text-cyan-400" />}
            </label>
          )}

          {rows.length > 0 && (
            <>
              <div className="text-sm text-slate-400">{rows.length} linhas detectadas • {headers.length} colunas</div>
              <div className="space-y-3">
                <h4 className="font-semibold text-white text-sm">Mapeamento de colunas</h4>
                {CANONICAL.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <label className="w-32 text-sm text-slate-300 capitalize">{f}{f === "phone" ? " *" : ""}</label>
                    <select
                      value={mapping[f] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                    >
                      <option value="">— não mapear —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {customFields.length > 0 && (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Campos extras: {customFields.join(", ")} (irão para <code>custom_fields</code>)
                </div>
              )}
              {importing && (
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  Inseridos: {progress.inserted} · Falhas: {progress.failed}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose} disabled={importing}>Cancelar</Button>
                <Button onClick={runImport} disabled={importing || !mapping.phone}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Importar"}
                </Button>
              </div>
              {!mapping.phone && (
                <div className="text-xs text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Mapeie a coluna de telefone para prosseguir.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportContactsModal;
