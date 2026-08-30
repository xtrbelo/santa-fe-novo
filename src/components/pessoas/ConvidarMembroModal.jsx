import React, { useState } from 'react';
import { CheckCircle2, Clipboard, MessageCircle, UserPlus } from 'lucide-react';
import { createMemberInvite } from '../../services/firebase';
import { maskCPF } from '../../utils/formatters';
import { MEMBER_INVITE_EXPIRATION_DAYS, buildMemberInviteWhatsAppUrl } from '../../utils/memberInvite';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const inputClass = 'w-full rounded-xl border border-transparent bg-gray-50 px-4 py-3 text-sm font-bold outline-none focus:border-purple-500 focus:bg-white';

export function InviteCreatedContent({ result, onCopy }) {
  const convite = result.convite;
  const sendByWhatsApp = () => {
    const openedWindow = window.open(buildMemberInviteWhatsAppUrl({ nome: convite.nome, url: result.url }), '_blank', 'noopener,noreferrer');
    if (openedWindow) openedWindow.opener = null;
  };
  return <div className="space-y-5">
    <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-700"><CheckCircle2 className="mx-auto mb-2" /><p className="font-black">Convite criado com sucesso</p></div>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-gray-400">Nome</dt><dd className="font-bold">{convite.nome}</dd></div><div><dt className="text-xs font-black uppercase text-gray-400">CPF</dt><dd className="font-bold">{maskCPF(convite.cpf)}</dd></div>{convite.email && <div><dt className="text-xs font-black uppercase text-gray-400">E-mail</dt><dd className="font-bold">{convite.email}</dd></div>}<div><dt className="text-xs font-black uppercase text-gray-400">Validade</dt><dd className="font-bold">{MEMBER_INVITE_EXPIRATION_DAYS} dias</dd></div></dl>
    <label className="block text-xs font-black uppercase text-gray-500">Link individual<input readOnly value={result.url} onFocus={event => event.target.select()} className={`${inputClass} mt-1 font-mono text-xs`} /></label>
    <div className="grid gap-2 sm:grid-cols-2"><Button variant="purple" onClick={onCopy} className="w-full"><Clipboard size={16} /> Copiar link</Button><Button variant="success" onClick={sendByWhatsApp} className="w-full"><MessageCircle size={16} /> Enviar por WhatsApp</Button></div>
    <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">Por segurança, este link não poderá ser recuperado depois que esta janela for fechada. Se necessário, gere um novo convite.</p>
  </div>;
}

export function ConvidarMembroModal({ isOpen, userId, onClose, onCreated, toast }) {
  const [form, setForm] = useState({ nome: '', cpf: '', email: '' });
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const close = () => { setForm({ nome: '', cpf: '', email: '' }); setResult(null); onClose(); };
  const copy = async () => {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(result.url); toast.success('Link copiado.'); }
    catch { toast.error('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.'); }
  };
  const submit = async event => {
    event.preventDefault(); setSubmitting(true);
    try { const created = await createMemberInvite({ ...form, userId, origin: window.location.origin }); setResult(created); onCreated?.(created); }
    catch (error) {
      if (error.message === 'CPF_DUPLICADO') toast.error('Já existe uma pessoa cadastrada com este CPF.');
      else if (error.message === 'CONVITE_ATIVO_JA_EXISTE') toast.error('Já existe um convite ativo para este CPF.');
      else if (error.message === 'AUTOCADASTRO_PENDENTE') toast.error('Já existe um autocadastro aguardando análise para este CPF.');
      else toast.error(error.message.replace('CONVITE_INVALIDO:', '') || 'Erro ao gerar convite.');
    }
    finally { setSubmitting(false); }
  };
  return <Modal isOpen={isOpen} onClose={close} title={result ? 'Convite de membro' : 'Convidar membro'} maxWidth="max-w-xl">
    {result ? <InviteCreatedContent result={result} onCopy={copy} /> : <form onSubmit={submit} className="space-y-4">
      <label className="block text-xs font-black uppercase text-gray-500">Nome *<input required value={form.nome} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))} className={`${inputClass} mt-1`} /></label>
      <label className="block text-xs font-black uppercase text-gray-500">CPF *<input required value={form.cpf} onChange={event => setForm(current => ({ ...current, cpf: maskCPF(event.target.value) }))} maxLength={14} inputMode="numeric" className={`${inputClass} mt-1`} /></label>
      <label className="block text-xs font-black uppercase text-gray-500">E-mail (opcional)<input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} className={`${inputClass} mt-1`} /></label>
      <p className="text-sm font-bold text-purple-700">Este convite será válido por {MEMBER_INVITE_EXPIRATION_DAYS} dias.</p>
      <Button type="submit" variant="purple" disabled={submitting} className="w-full"><UserPlus size={17} /> {submitting ? 'Gerando...' : 'Gerar convite'}</Button>
    </form>}
  </Modal>;
}
