import React, { useMemo, useState } from 'react';
import { Truck, Lock, Loader2, CheckCircle2, XCircle, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useManualTracking } from '@/hooks/useManualTracking';
import { useUserRole } from '@/hooks/useUserRole';
import {
  CARRIERS, buildTemplatePreview, normalizePhoneClient, validateTrackingForm,
  type Carrier, type CarrierSelection, type ManualTrackingForm, type ManualTrackingInput,
} from '@/lib/trackingForm';

const EMPTY: ManualTrackingForm = {
  customer_name: '',
  phone_number: '',
  order_number: '',
  tracking_number: '',
  carrier: '',
};

const Req: React.FC = () => <span className="text-destructive" aria-hidden="true"> *</span>;


const statusMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  processing: { label: 'Aguardando', icon: Clock, className: 'text-amber-500' },
  queued: { label: 'Aguardando', icon: Clock, className: 'text-amber-500' },
  sent: { label: 'Enviado', icon: CheckCircle2, className: 'text-emerald-500' },
  failed: { label: 'Falhou', icon: XCircle, className: 'text-destructive' },
  duplicate: { label: 'Duplicado', icon: Copy, className: 'text-muted-foreground' },
};

const TrackingSend: React.FC = () => {
  const { role } = useUserRole();
  const { logs, loading, sending, sendingEnabled, send } = useManualTracking(role === 'rastreio');
  const [form, setForm] = useState<ManualTrackingForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const preview = useMemo(() => buildTemplatePreview(form), [form]);
  const set = (k: keyof ManualTrackingForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v } as ManualTrackingForm));

  const formErrors = useMemo(() => validateTrackingForm(form), [form]);
  const isValid = Object.keys(formErrors).length === 0;

  const openConfirm = () => {
    if (!isValid) {
      setErrors(formErrors);
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  };

  const handleSend = async () => {
    if (sending || !isValid) return;
    try {
      const res = await send(form as ManualTrackingInput);
      if (res?.disabled) {
        toast.warning(res.message || 'Envio manual de rastreio está desativado.');
      } else if (res?.error === 'validation_error') {
        setErrors(res.fields || {});
        toast.error('Verifique os campos do formulário.');
      } else if (res?.error === 'template_not_approved') {
        toast.error('Este template ainda não está aprovado pela Meta.');
      } else if (res?.error === 'forbidden') {
        toast.error('Você não tem permissão para enviar rastreios.');
      } else if (res?.code === 'duplicate') {
        toast.error(res.message || 'Este código de rastreio já foi enviado ao cliente.');
      } else if (res?.ok) {
        toast.success('Envio enfileirado. O status é atualizado automaticamente.');
        setForm(EMPTY);
        setErrors({});
      } else {
        toast.error(res?.message || 'Não foi possível enviar.');
      }
    } catch (err) {
      toast.error((err as Error)?.message || 'Falha na comunicação com o servidor.');
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Envio de rastreio</h1>
            <p className="text-sm text-muted-foreground">
              Envio manual do código de rastreio para o cliente via WhatsApp.
            </p>
          </div>
        </header>

        {sendingEnabled === false && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <Lock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Envio desativado</p>
              <p className="text-muted-foreground">
                Esta área está em homologação. Nenhuma mensagem de WhatsApp é enviada e nenhum registro é criado.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Dados do envio</h2>

            <div className="space-y-1.5">
              <Label htmlFor="customer_name">Nome do cliente<Req /></Label>
              <Input id="customer_name" value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)} placeholder="Maria Silva" />
              {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone_number">Telefone<Req /></Label>
              <Input id="phone_number" value={form.phone_number}
                onChange={(e) => set('phone_number', e.target.value)} placeholder="(11) 99888-7777" />
              {errors.phone_number && <p className="text-xs text-destructive">{errors.phone_number}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="order_number">Número do pedido<Req /></Label>
              <Input id="order_number" value={form.order_number}
                onChange={(e) => set('order_number', e.target.value)} placeholder="1885" />
              {errors.order_number && <p className="text-xs text-destructive">{errors.order_number}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="carrier">Transportadora<Req /></Label>
              <Select value={form.carrier || undefined} onValueChange={(v) => set('carrier', v as CarrierSelection)}>
                <SelectTrigger id="carrier"><SelectValue placeholder="Selecione a transportadora" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="correios">Correios</SelectItem>
                  <SelectItem value="jadlog">Jadlog</SelectItem>
                </SelectContent>
              </Select>
              {errors.carrier && <p className="text-xs text-destructive">{errors.carrier}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tracking_number">Código de rastreio<Req /></Label>
              <Input id="tracking_number" value={form.tracking_number}
                onChange={(e) => set('tracking_number', e.target.value.toUpperCase())}
                placeholder="AA123456789BR" />
              {errors.tracking_number && <p className="text-xs text-destructive">{errors.tracking_number}</p>}
            </div>

            <Button onClick={openConfirm} disabled={sending || !isValid} className="w-full">
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar rastreio
            </Button>
          </section>

          <section className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Prévia da mensagem</h2>
            {form.carrier && CARRIERS[form.carrier as Carrier] && (
              <p className="text-xs text-muted-foreground">
                Template{' '}
                <span className="font-mono">{CARRIERS[form.carrier as Carrier].template}</span>
                {' '}· pt_BR · UTILITY
              </p>
            )}
            <div className="rounded-lg bg-muted/40 p-4 whitespace-pre-wrap text-sm text-foreground">
              {preview ?? (
                <span className="text-muted-foreground">
                  Preencha todos os campos para visualizar a mensagem.
                </span>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card/50 p-5">
          <h2 className="font-semibold text-foreground mb-3">Histórico de envios</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((l) => {
                const meta = statusMeta[l.status] || statusMeta.processing;
                const Icon = meta.icon;
                return (
                  <div key={l.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="text-foreground font-medium">
                        #{l.order_number}{l.customer_name ? ` · ${l.customer_name}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {l.carrier} · {l.tracking_number}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1.5 ${meta.className}`}>
                      <Icon className="w-4 h-4" />
                      {meta.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio</DialogTitle>
            <DialogDescription>Confira os dados antes de enviar ao cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> {form.customer_name}</p>
            <p><span className="text-muted-foreground">Telefone:</span> {normalizePhoneClient(form.phone_number)}</p>
            <p><span className="text-muted-foreground">Pedido:</span> #{form.order_number.replace(/^#/, '')}</p>
            <p><span className="text-muted-foreground">Transportadora:</span> {form.carrier ? CARRIERS[form.carrier as Carrier].label : '—'}</p>
            <p><span className="text-muted-foreground">Rastreio:</span> {form.tracking_number}</p>
            <div className="rounded-lg bg-muted/40 p-3 whitespace-pre-wrap">{preview}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={sending || !isValid}>
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrackingSend;
