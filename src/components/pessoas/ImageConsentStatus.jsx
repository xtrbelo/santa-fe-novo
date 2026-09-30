import React from 'react';
import { CheckCircle2, CircleHelp, ShieldX } from 'lucide-react';

const statusConfig = {
  autorizado: { label: 'Autorizado', detail: 'O membro registrou a autorização usando a própria conta.', icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  nao_autorizado: { label: 'Não autorizado', detail: 'O membro optou por não autorizar usando a própria conta.', icon: ShieldX, tone: 'border-rose-200 bg-rose-50 text-rose-900' },
  pendente: { label: 'Autorização pendente', detail: 'O membro deve registrar a decisão em Meu Cadastro, usando a própria conta.', icon: CircleHelp, tone: 'border-amber-200 bg-amber-50 text-amber-950' },
};

const dateText = value => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : null;
};

export function ImageConsentStatus({ pessoa }) {
  const authorized = pessoa?.consentimentoImagem?.origem === 'titular_presencial' ? undefined : pessoa?.consentimentoImagem?.autorizado;
  const status = authorized === true ? 'autorizado' : authorized === false ? 'nao_autorizado' : 'pendente';
  const config = statusConfig[status];
  const Icon = config.icon;
  const registeredAt = dateText(pessoa?.consentimentoImagem?.registradoEm);
  return <section className={`rounded-2xl border p-4 ${config.tone}`}>
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80"><Icon size={21}/></div>
      <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wider">Autorização de uso de imagem</p><p className="mt-1 font-black">{config.label}</p><p className="mt-1 text-xs leading-relaxed opacity-80">{config.detail}</p></div>
    </div>
    {registeredAt && <p className="mt-3 text-[11px] font-bold opacity-70">Decisão registrada em {registeredAt}{pessoa.consentimentoImagem?.protocolo ? ` • Protocolo ${pessoa.consentimentoImagem.protocolo}` : ''}</p>}
  </section>;
}
