import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { approveMemberSelfRegistration, getAppCollection, onSnapshot, rejectMemberSelfRegistration } from '../../services/firebase';
import { maskCPF } from '../../utils/formatters';
import { canReviewSelfRegistration, normalizeRejectionReason } from '../../utils/memberSelfRegistrationReview';
import { formatDateBr } from '../../utils/pessoaDetails';

const statusLabels = { aguardando_validacao: 'Aguardando análise', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
const filters = [['aguardando_validacao', 'Pendentes'], ['aprovado', 'Aprovados'], ['rejeitado', 'Rejeitados'], ['todos', 'Todos']];
const timestampText = value => value?.toDate ? `${formatDateBr(value.toDate().toISOString().slice(0, 10))} ${value.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não informado';
const maskContact = value => value ? `${String(value).slice(0, 2)}*****${String(value).slice(-4)}` : 'Não informado';
const show = value => value || 'Não informado';
const errorMessage = error => {
  const message = String(error?.message || '');
  if (message.includes('CPF_DUPLICADO')) return 'Já existe uma pessoa cadastrada com este CPF.';
  if (message.includes('AUTOCADASTRO_JA_ANALISADO')) return 'Este cadastro já foi analisado.';
  if (message.includes('MOTIVO_REJEICAO_OBRIGATORIO')) return 'Informe o motivo da rejeição.';
  return 'Não foi possível concluir a análise. Verifique a integridade do cadastro.';
};

export function AutocadastrosModule({ user }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('aguardando_validacao');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => onSnapshot(getAppCollection('autocadastros_membro'), snapshot => {
    setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, error => { console.error(error); toast.error('Não foi possível carregar os autocadastros.'); }), [toast]);
  const filtered = useMemo(() => items
    .filter(item => filter === 'todos' || item.statusCadastro === filter)
    .sort((a, b) => (a.enviadoEm?.toMillis?.() || 0) - (b.enviadoEm?.toMillis?.() || 0)), [filter, items]);
  const decide = async action => {
    if (busy || !selected) return;
    if (action === 'approve' && !window.confirm('Confirmar a aprovação deste cadastro?')) return;
    const normalizedReason = normalizeRejectionReason(reason);
    if (action === 'reject' && !normalizedReason) { toast.error('Informe o motivo da rejeição.'); return; }
    if (action === 'reject' && !window.confirm('Confirmar a rejeição definitiva deste cadastro?')) return;
    setBusy(true);
    try {
      if (action === 'approve') await approveMemberSelfRegistration({ inviteId: selected.id, userId: user.uid });
      else await rejectMemberSelfRegistration({ inviteId: selected.id, userId: user.uid, reason: normalizedReason });
      toast.success(action === 'approve' ? 'Cadastro aprovado e membro criado com sucesso.' : 'Cadastro rejeitado.');
      setSelected(null); setReason('');
    } catch (error) { console.error(error); toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-6 pb-10">
    <header><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Autocadastros</h2><p className="mt-1 text-sm font-medium text-gray-500">Análise administrativa dos cadastros enviados por convite</p></header>
    <div className="flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${filter === value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>{label}</button>)}</div>
    <div className="grid gap-3">{filtered.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum autocadastro neste filtro.</Card> : filtered.map(item => <button key={item.id} onClick={() => { setSelected(item); setReason(''); }} className="text-left"><Card className="!border-none shadow-md"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600"><ClipboardCheck size={22} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-900">{item.nome}</h3><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-700">{statusLabels[item.statusCadastro] || item.statusCadastro}</span></div><p className="mt-1 text-xs font-bold text-gray-500">CPF: {maskCPF(item.cpf)} · Contato: {maskContact(item.contato)}</p><p className="mt-1 text-xs text-gray-500">{show(item.email)}</p><p className="mt-1 text-xs text-gray-400">Enviado em: {timestampText(item.enviadoEm)}</p></div></div></Card></button>)}</div>
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} title="Analisar autocadastro" maxWidth="max-w-2xl">{selected && <div className="space-y-6">
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Dados pessoais</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{[['Nome', selected.nome], ['CPF', maskCPF(selected.cpf)], ['Data de nascimento', selected.dataNascimento ? formatDateBr(selected.dataNascimento) : null], ['Sexo', selected.sexo], ['Estado civil', selected.estadoCivil], ['Contato', selected.contato], ['E-mail', selected.email]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Endereço</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{[['CEP', selected.endereco?.cep], ['Logradouro', selected.endereco?.logradouro], ['Número', selected.endereco?.numero], ['Complemento', selected.endereco?.complemento], ['Bairro', selected.endereco?.bairro], ['Cidade', selected.endereco?.cidade], ['UF', selected.endereco?.uf]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Origem</h4><p className="text-sm"><span className="block text-xs font-bold text-gray-400">Data de envio</span>{timestampText(selected.enviadoEm)}</p><p className="mt-3 break-all text-sm"><span className="block text-xs font-bold text-gray-400">Convite relacionado</span>{selected.inviteId}</p></section>
      {selected.motivoRejeicao && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><strong>Motivo da rejeição:</strong> {selected.motivoRejeicao}</p>}
      {canReviewSelfRegistration(selected) && <div className="space-y-3 border-t border-gray-100 pt-5"><label className="block text-xs font-black uppercase text-gray-500">Motivo para rejeição<textarea value={reason} onChange={event => setReason(event.target.value)} disabled={busy} className="mt-2 min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium normal-case" placeholder="Obrigatório somente ao rejeitar" /></label><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => decide('approve')} disabled={busy}><CheckCircle2 size={18} /> {busy ? 'Processando...' : 'Aprovar cadastro'}</Button><Button variant="danger" onClick={() => decide('reject')} disabled={busy}><XCircle size={18} /> {busy ? 'Processando...' : 'Rejeitar cadastro'}</Button></div></div>}
    </div>}</Modal>
  </div>;
}
