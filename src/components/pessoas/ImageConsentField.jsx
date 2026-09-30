import React, { useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '../ui/Button';

export const IMAGE_CONSENT_VERSION = '2026-09-29.1';

export function ImageConsentField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return <>
    <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
      <div className="flex items-start gap-3"><Camera className="mt-0.5 shrink-0 text-violet-700" size={20}/><div><p className="text-sm font-black text-violet-950">Uso de imagem</p><button type="button" onClick={() => setOpen(true)} className="mt-1 text-left text-xs font-bold text-violet-700 underline underline-offset-2">Leia os termos antes de responder</button></div></div>
      <label className="mt-3 flex items-start gap-3 text-sm font-medium text-gray-700"><input type="checkbox" className="mt-1" checked={value === true} onChange={event => onChange(event.target.checked)}/><span>Autorizo o uso da minha imagem pela Casa de Auxílio Santa Fé para fins institucionais.</span></label>
      <p className="mt-2 text-[11px] text-gray-500">A autorização é opcional, não impede o cadastro e pode ser revogada posteriormente.</p>
    </section>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="image-consent-title"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><h2 id="image-consent-title" className="text-lg font-black text-gray-900">Termo de autorização de uso de imagem</h2><button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="rounded-full bg-gray-100 p-2 text-gray-500"><X size={18}/></button></div><div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600"><p>A Casa de Auxílio Santa Fé poderá utilizar fotografias e vídeos em que você apareça para divulgação institucional, portal, comunicados, redes sociais e registros de atividades da Casa.</p><p>A autorização é livre, específica e não condiciona seu cadastro ou atendimento. Não haverá finalidade comercial.</p><p>Você poderá solicitar a revogação gratuitamente pelos canais da Casa. A revogação não invalida usos realizados antes do pedido.</p><p className="text-xs font-bold text-gray-500">Versão do termo: {IMAGE_CONSENT_VERSION}</p></div><Button type="button" className="mt-5 w-full" onClick={() => setOpen(false)}>Entendi</Button></div></div>}
  </>;
}
