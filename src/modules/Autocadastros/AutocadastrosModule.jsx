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
import { getEffectiveMemberFunctions } from '../../utils/pessoaForm';

const statusLabels = { aguardando_validacao: 'Aguardando análise', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
const filters = [['aguardando_validacao', 'Pendentes'], ['aprovado', 'Aprovados'], ['rejeitado', 'Rejeitados'], ['todos', 'Todos']];
const timestampText = value => value?.toDate ? `${formatDateBr(value.toDate().toISOString().slice(0, 10))} ${value.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não informado';
const maskContact = value => value ? `${String(value).slice(0, 2)}*****${String(value).slice(-4)}` : 'Não informado';
const show = value => value || 'Não informado';
const emptyHouseData = { dataIngresso: '', batizadoCaesf: null, dataBatismoCaesf: '' };
const errorMessage = error => {
  const message = String(error?.message || '');
  if (message.includes('CPF_DUPLICADO')) return 'Já existe uma pessoa cadastrada com este CPF.';
  if (message.includes('AUTOCADASTRO_JA_ANALISADO')) return 'Este cadastro já foi analisado.';
  if (message.includes('MOTIVO_REJEICAO_OBRIGATORIO')) return 'Informe o motivo da rejeição.';
  if (message.includes('FUNCAO_CASA_OBRIGATORIA')) return 'Selecione pelo menos uma função na Casa.';
  if (message.includes('FUNCAO_CASA_INVALIDA')) return 'Uma função selecionada não está mais ativa.';
  if (message.includes('DATA_INGRESSO')) return 'Informe uma data de entrada válida e não futura.';
  if (message.includes('BATIZADO_OBRIGATORIO')) return 'Informe se o membro foi batizado na CAESF.';
  if (message.includes('DATA_BATISMO')) return 'Informe uma data de batismo válida, não futura e posterior à entrada.';
  if (message.includes('BATISMO_ANTERIOR')) return 'A data de batismo não pode ser anterior à entrada na Casa.';
  return 'Não foi possível concluir a análise. Verifique a integridade do cadastro.';
};

export function AutocadastrosModule({ user }) {
  const [items, setItems] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [filter, setFilter] = useState('aguardando_validacao');
  const [selected, setSelected] = useState(null);
  const [selectedFunctions, setSelectedFunctions] = useState([]);
  const [houseData, setHouseData] = useState(emptyHouseData);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const unsubscribeRegistrations = onSnapshot(getAppCollection('autocadastros_membro'), snapshot => setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => { console.error(error); toast.error('Não foi possível carregar os autocadastros.'); });
    const unsubscribeFunctions = onSnapshot(getAppCollection('config_funcoes_membro'), snapshot => setFunctions(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => { console.error(error); toast.error('Não foi possível carregar as funções da Casa.'); });
    return () => { unsubscribeRegistrations(); unsubscribeFunctions(); };
  }, [toast]);
  const effectiveFunctions = useMemo(() => getEffectiveMemberFunctions(functions), [functions]);
  const filtered = useMemo(() => items.filter(item => filter === 'todos' || item.statusCadastro === filter).sort((a, b) => (a.enviadoEm?.toMillis?.() || 0) - (b.enviadoEm?.toMillis?.() || 0)), [filter, items]);
  const open = item => { setSelected(item); setReason(''); setSelectedFunctions([]); setHouseData({ ...emptyHouseData, ...(item.dadosCasa || {}) }); };
  const updateHouseData = (key, value) => setHouseData(current => ({ ...current, [key]: value, ...(key === 'batizadoCaesf' && value === false ? { dataBatismoCaesf: '' } : {}) }));
  const toggleFunction = id => setSelectedFunctions(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const decide = async action => {
    if (busy || !selected) return;
    if (action === 'approve' && selectedFunctions.length === 0) { toast.error('Selecione pelo menos uma função na Casa.'); return; }
    if (action === 'approve' && !window.confirm('Confirmar a aprovação deste cadastro?')) return;
    const normalizedReason = normalizeRejectionReason(reason);
    if (action === 'reject' && !normalizedReason) { toast.error('Informe o motivo da rejeição.'); return; }
    if (action === 'reject' && !window.confirm('Confirmar a rejeição definitiva deste cadastro?')) return;
    setBusy(true);
    try {
      if (action === 'approve') await approveMemberSelfRegistration({ inviteId: selected.id, userId: user.uid, funcoesCasa: selectedFunctions, dadosCasa: houseData });
      else await rejectMemberSelfRegistration({ inviteId: selected.id, userId: user.uid, reason: normalizedReason });
      toast.success(action === 'approve' ? 'Cadastro aprovado e membro criado com sucesso.' : 'Cadastro rejeitado.'); setSelected(null); setReason('');
    } catch (error) { console.error(error); toast.error(errorMessage(error)); } finally { setBusy(false); }
  };
  return <div className="space-y-6 pb-10">
    <header><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Autocadastros</h2><p className="mt-1 text-sm font-medium text-gray-500">Análise administrativa dos cadastros enviados por convite</p></header>
    <div className="flex flex-wrap gap-2">{filters.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${filter === value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>{label}</button>)}</div>
    <div className="grid gap-3">{filtered.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum autocadastro neste filtro.</Card> : filtered.map(item => <button key={item.id} onClick={() => open(item)} className="text-left"><Card className="!border-none shadow-md"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600"><ClipboardCheck size={22} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-900">{item.nome}</h3><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-700">{statusLabels[item.statusCadastro] || item.statusCadastro}</span></div><p className="mt-1 text-xs font-bold text-gray-500">CPF: {maskCPF(item.cpf)} · Contato: {maskContact(item.contato)}</p><p className="mt-1 text-xs text-gray-500">{show(item.email)}</p><p className="mt-1 text-xs text-gray-400">Enviado em: {timestampText(item.enviadoEm)}</p></div></div></Card></button>)}</div>
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} title="Analisar autocadastro" maxWidth="max-w-2xl">{selected && <div className="space-y-6">
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Dados pessoais</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{[['Nome', selected.nome], ['CPF', maskCPF(selected.cpf)], ['Data de nascimento', selected.dataNascimento ? formatDateBr(selected.dataNascimento) : null], ['Sexo', selected.sexo], ['Estado civil', selected.estadoCivil], ['Contato', selected.contato], ['E-mail', selected.email]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Endereço</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{[['CEP', selected.endereco?.cep], ['Logradouro', selected.endereco?.logradouro], ['Número', selected.endereco?.numero], ['Complemento', selected.endereco?.complemento], ['Bairro', selected.endereco?.bairro], ['Cidade', selected.endereco?.cidade], ['UF', selected.endereco?.uf]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Dados da Casa</h4><div className="grid gap-3 text-sm sm:grid-cols-3">{[['Data de entrada', houseData.dataIngresso ? formatDateBr(houseData.dataIngresso) : null], ['Batizado na CAESF', houseData.batizadoCaesf === true ? 'Sim' : houseData.batizadoCaesf === false ? 'Não' : null], ['Data de batismo', houseData.dataBatismoCaesf ? formatDateBr(houseData.dataBatismoCaesf) : null]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      {canReviewSelfRegistration(selected) && <section className="space-y-4 border-t border-gray-100 pt-5"><h4 className="text-xs font-black uppercase text-indigo-600">Completar aprovação</h4><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-gray-600">Data de entrada<input type="date" value={houseData.dataIngresso || ''} onChange={event => updateHouseData('dataIngresso', event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm" /></label><fieldset><legend className="text-xs font-bold text-gray-600">Batizado na CAESF? *</legend><div className="mt-3 flex gap-4 text-sm font-bold"><label><input type="radio" checked={houseData.batizadoCaesf === true} onChange={() => updateHouseData('batizadoCaesf', true)} /> Sim</label><label><input type="radio" checked={houseData.batizadoCaesf === false} onChange={() => updateHouseData('batizadoCaesf', false)} /> Não</label></div></fieldset>{houseData.batizadoCaesf === true && <label className="text-xs font-bold text-gray-600 sm:col-span-2">Data de batismo *<input type="date" value={houseData.dataBatismoCaesf || ''} onChange={event => updateHouseData('dataBatismoCaesf', event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm" /></label>}</div><div><p className="mb-2 text-xs font-black uppercase text-gray-500">Funções na Casa *</p><div className="flex flex-wrap gap-3">{effectiveFunctions.map(item => <label key={item.id} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectedFunctions.includes(item.id)} onChange={() => toggleFunction(item.id)} />{item.nome}</label>)}</div>{effectiveFunctions.length === 0 && <p className="text-sm text-amber-700">Nenhuma função ativa configurada.</p>}</div></section>}
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Origem</h4><p className="text-sm"><span className="block text-xs font-bold text-gray-400">Data de envio</span>{timestampText(selected.enviadoEm)}</p><p className="mt-3 break-all text-sm"><span className="block text-xs font-bold text-gray-400">Convite relacionado</span>{selected.inviteId}</p></section>
      {selected.motivoRejeicao && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><strong>Motivo da rejeição:</strong> {selected.motivoRejeicao}</p>}
      {canReviewSelfRegistration(selected) && <div className="space-y-3 border-t border-gray-100 pt-5"><label className="block text-xs font-black uppercase text-gray-500">Motivo para rejeição<textarea value={reason} onChange={event => setReason(event.target.value)} disabled={busy} className="mt-2 min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium normal-case" placeholder="Obrigatório somente ao rejeitar" /></label><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => decide('approve')} disabled={busy}><CheckCircle2 size={18} /> {busy ? 'Processando...' : 'Aprovar cadastro'}</Button><Button variant="danger" onClick={() => decide('reject')} disabled={busy}><XCircle size={18} /> {busy ? 'Processando...' : 'Rejeitar cadastro'}</Button></div></div>}
    </div>}</Modal>
  </div>;
}
