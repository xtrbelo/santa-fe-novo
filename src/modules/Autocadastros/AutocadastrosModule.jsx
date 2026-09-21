import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, CheckCircle2, Mail, MessageCircle, Search, Users, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { Modal } from '../../components/ui/Modal';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { exportFilteredCsv, REGISTRATION_EXPORT_COLUMNS } from '../../utils/dataExport';
import { useToast } from '../../components/ui/useToast';
import { approveMemberSelfRegistration, approveReusableRegistration, getAppCollection, getAppDoc, getDoc, onSnapshot, rejectMemberSelfRegistration, rejectReusableRegistration } from '../../services/firebase';
import { maskCPF } from '../../utils/formatters';
import { canReviewSelfRegistration, normalizeRejectionReason } from '../../utils/memberSelfRegistrationReview';
import { formatDateBr } from '../../utils/pessoaDetails';
import { getEffectiveMemberFunctions } from '../../utils/pessoaForm';
import { normalizeSearchDigits, normalizeSearchText } from '../../utils/pessoaSearch';
import { compareRegistrationRequestsByPriority, getRegistrationRequestWaitingInfo } from '../../utils/registrationRequestAge';
import { getRegistrationNotification } from '../../utils/registrationNotification';
import { getRegistrationRequestIssues, summarizeRegistrationQueue } from '../../utils/registrationQueueHealth';

const statusLabels = { aguardando_validacao: 'Aguardando análise', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
const filters = [['aguardando_validacao', 'Pendentes'], ['aprovado', 'Aprovados'], ['rejeitado', 'Rejeitados'], ['todos', 'Todos']];
const typeFilters = [['todos', 'Todos'], ['membro', 'Membros'], ['consulente', 'Consulentes']];
const timestampText = value => value?.toDate ? `${formatDateBr(value.toDate().toISOString().slice(0, 10))} ${value.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não informado';
const maskContact = value => value ? `${String(value).slice(0, 2)}*****${String(value).slice(-4)}` : 'Não informado';
const show = value => value || 'Não informado';
const emailStatus = {
  enviando: { label: 'E-mail em processamento', className: 'bg-amber-50 text-amber-800' },
  enviado: { label: 'E-mail enviado automaticamente', className: 'bg-emerald-50 text-emerald-800' },
  erro: { label: 'Falha no envio automático do e-mail', className: 'bg-rose-50 text-rose-800' },
};
const errorMessage = error => {
  const message = String(error?.message || '');
  if (message.includes('CPF_DUPLICADO')) return 'Não é possível aprovar: já existe uma Pessoa cadastrada com este CPF.';
  if (message.includes('EMAIL_MEMBRO_DUPLICADO')) {
    const existingName = message.split('EMAIL_MEMBRO_DUPLICADO:')[1]?.trim();
    return existingName ? `Não é possível aprovar: este e-mail já pertence ao Membro ${existingName}.` : 'Não é possível aprovar: este e-mail já pertence a outro Membro ativo.';
  }
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

export function AutocadastrosModule({ user, onOpenPerson, filterLinkId = null, onClearLinkFilter }) {
  const [items, setItems] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [filter, setFilter] = useState('aguardando_validacao');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState('todos');
  const [cpfIndexIds, setCpfIndexIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [selectedFunctions, setSelectedFunctions] = useState([]);
  const [reason, setReason] = useState('');
  const [duplicatePersonId, setDuplicatePersonId] = useState(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const toast = useToast();
  useEffect(() => {
    setLoadingData(true); setLoadError(false);
    const pending = new Set(['registrations', 'reusable', 'functions', 'cpfIndexes']);
    const loaded = key => { pending.delete(key); if (!pending.size) setLoadingData(false); };
    const failed = error => { console.error(error); setLoadError(true); setLoadingData(false); };
    let inviteItems = []; let reusableItems = [];
    const syncItems = () => setItems([...inviteItems, ...reusableItems]);
    const unsubscribeRegistrations = onSnapshot(getAppCollection('autocadastros_membro'), snapshot => { inviteItems = snapshot.docs.map(item => ({ id: item.id, fluxoOrigem: 'convite', ...item.data() })); syncItems(); loaded('registrations'); }, failed);
    const unsubscribeReusable = onSnapshot(getAppCollection('solicitacoes_cadastro'), snapshot => { reusableItems = snapshot.docs.map(item => ({ id: item.id, fluxoOrigem: 'link', ...item.data() })); syncItems(); loaded('reusable'); }, failed);
    const unsubscribeFunctions = onSnapshot(getAppCollection('config_funcoes_membro'), snapshot => { setFunctions(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); loaded('functions'); }, failed);
    const unsubscribeCpfIndexes = onSnapshot(getAppCollection('cpf_index'), snapshot => { setCpfIndexIds(new Set(snapshot.docs.map(item => item.id))); loaded('cpfIndexes'); }, failed);
    return () => { unsubscribeRegistrations(); unsubscribeReusable(); unsubscribeFunctions(); unsubscribeCpfIndexes(); };
  }, [reloadVersion]);
  const effectiveFunctions = useMemo(() => getEffectiveMemberFunctions(functions), [functions]);
  const matchesSearch = useCallback(item => {
    const textTerm = normalizeSearchText(searchTerm); const digitTerm = normalizeSearchDigits(searchTerm);
    return !textTerm || normalizeSearchText(item.nome).includes(textTerm) || (digitTerm && [item.cpf, item.contato].some(value => normalizeSearchDigits(value).includes(digitTerm)));
  }, [searchTerm]);
  const filtered = useMemo(() => items.filter(item => {
    const issues = getRegistrationRequestIssues(item, cpfIndexIds);
    const attentionMatches = attentionFilter === 'todos' || (attentionFilter === 'incompletos' && issues.missing.length > 0) || (attentionFilter === 'duplicados' && issues.duplicateCpf);
    return (!filterLinkId || item.linkId === filterLinkId) && matchesSearch(item) && (filter === 'todos' || item.statusCadastro === filter) && (typeFilter === 'todos' || item.tipoCadastro === typeFilter) && (!overdueOnly || getRegistrationRequestWaitingInfo(item)?.overdue) && attentionMatches;
  }).sort(compareRegistrationRequestsByPriority), [attentionFilter, cpfIndexIds, filter, filterLinkId, items, matchesSearch, overdueOnly, typeFilter]);
  const pagination = usePagination(filtered, [attentionFilter, filter, filterLinkId, overdueOnly, searchTerm, typeFilter]);
  const typeCounts = useMemo(() => items.filter(item => (!filterLinkId || item.linkId === filterLinkId) && matchesSearch(item) && (filter === 'todos' || item.statusCadastro === filter)).reduce((counts, item) => ({ ...counts, [item.tipoCadastro === 'consulente' ? 'consulente' : 'membro']: counts[item.tipoCadastro === 'consulente' ? 'consulente' : 'membro'] + 1 }), { membro: 0, consulente: 0 }), [filter, filterLinkId, items, matchesSearch]);
  const statusCounts = useMemo(() => items.filter(item => (!filterLinkId || item.linkId === filterLinkId) && matchesSearch(item) && (typeFilter === 'todos' || item.tipoCadastro === typeFilter)).reduce((counts, item) => ({ ...counts, [item.statusCadastro]: (counts[item.statusCadastro] || 0) + 1 }), {}), [filterLinkId, items, matchesSearch, typeFilter]);
  const overdueCount = useMemo(() => items.filter(item => (!filterLinkId || item.linkId === filterLinkId) && matchesSearch(item) && (typeFilter === 'todos' || item.tipoCadastro === typeFilter) && getRegistrationRequestWaitingInfo(item)?.overdue).length, [filterLinkId, items, matchesSearch, typeFilter]);
  const queueSummary = useMemo(() => summarizeRegistrationQueue(items.filter(item => !filterLinkId || item.linkId === filterLinkId), cpfIndexIds), [cpfIndexIds, filterLinkId, items]);
  useEffect(() => { if (filterLinkId) setFilter('todos'); }, [filterLinkId]);
  const open = item => {
    setSelected(item); setReason(''); setSelectedFunctions([]); setDuplicatePersonId(null); setCheckingDuplicate(false);
    if (item.statusCadastro !== 'aguardando_validacao' || !item.cpf) return;
    setCheckingDuplicate(true);
    getDoc(getAppDoc('cpf_index', item.cpf)).then(async snapshot => {
      if (!snapshot.exists()) { setDuplicatePersonId(null); return; }
      const personId = snapshot.data().pessoaId;
      const personSnapshot = personId ? await getDoc(getAppDoc('pessoas', personId)) : null;
      setDuplicatePersonId(personSnapshot?.exists() ? personId : null);
    }).catch(error => console.error(error)).finally(() => setCheckingDuplicate(false));
  };
  const toggleFunction = id => setSelectedFunctions(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const decide = async action => {
    if (busy || !selected) return;
    const memberRequest = selected.tipoCadastro !== 'consulente';
    if (action === 'approve' && duplicatePersonId) { toast.error('Este CPF já pertence a uma Pessoa cadastrada. Abra o cadastro existente ou rejeite a solicitação.'); return; }
    if (action === 'approve' && checkingDuplicate) { toast.info('Aguarde a verificação do CPF.'); return; }
    if (action === 'approve' && memberRequest && selectedFunctions.length === 0) { toast.error('Selecione pelo menos uma função na Casa.'); return; }
    if (action === 'approve' && !window.confirm('Confirmar a aprovação deste cadastro?')) return;
    const normalizedReason = normalizeRejectionReason(reason);
    if (action === 'reject' && !normalizedReason) { toast.error('Informe o motivo da rejeição.'); return; }
    if (action === 'reject' && !window.confirm('Confirmar a rejeição definitiva deste cadastro?')) return;
    setBusy(true);
    try {
      if (selected.fluxoOrigem === 'link') {
        if (action === 'approve') await approveReusableRegistration({ requestId: selected.id, userId: user.uid, funcoesCasa: selectedFunctions, dadosCasa: selected.dadosCasa });
        else await rejectReusableRegistration({ requestId: selected.id, userId: user.uid, reason: normalizedReason });
      } else if (action === 'approve') await approveMemberSelfRegistration({ inviteId: selected.id, userId: user.uid, funcoesCasa: selectedFunctions, dadosCasa: selected.dadosCasa });
      else await rejectMemberSelfRegistration({ inviteId: selected.id, userId: user.uid, reason: normalizedReason });
      toast.success(action === 'approve' ? `${memberRequest ? 'Membro' : 'Consulente'} aprovado e criado em Pessoas.` : 'Solicitação rejeitada com sucesso.'); setSelected(current => ({ ...current, statusCadastro: action === 'approve' ? 'aprovado' : 'rejeitado', ...(action === 'reject' ? { motivoRejeicao: normalizedReason } : {}) })); setReason('');
    } catch (error) { console.error(error); toast.error(errorMessage(error)); } finally { setBusy(false); }
  };
  const selectedCanReview = selected?.tipoCadastro !== 'consulente' && canReviewSelfRegistration(selected);
  const selectedCanReviewConsultee = selected?.tipoCadastro === 'consulente' && canReviewSelfRegistration(selected);
  const notification = getRegistrationNotification(selected);
  if (loadingData || loadError) return <DataLoadState loading={loadingData} error={loadError} subject="as solicitações de cadastro" onRetry={() => setReloadVersion(value => value + 1)} />;
  return <div className="space-y-6 pb-10">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Solicitações</h2><p className="mt-1 text-sm font-medium text-gray-500">Análise dos cadastros enviados por convite ou link reutilizável</p></div><Button type="button" variant="secondary" disabled={!filtered.length} onClick={() => exportFilteredCsv({ filename: 'solicitacoes-filtradas.csv', columns: REGISTRATION_EXPORT_COLUMNS, rows: filtered })}>Exportar CSV</Button></header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[['Pendentes', queueSummary.pending, 'text-indigo-700'], ['Atrasadas', overdueCount, 'text-amber-700'], ['Incompletas', queueSummary.incomplete, 'text-amber-700'], ['Possíveis duplicidades', queueSummary.duplicate, 'text-rose-700'], ['Analisadas', queueSummary.approved + queueSummary.rejected, 'text-emerald-700']].map(([label, value, color]) => <Card key={label} className="!p-3"><p className={`text-2xl font-black ${color}`}>{value}</p><p className="text-[10px] font-black uppercase text-gray-500">{label}</p></Card>)}
    </div>
    {filterLinkId && <div className="flex items-center justify-between gap-3 rounded-2xl bg-purple-50 p-4 text-sm font-bold text-purple-800"><span>Exibindo solicitações do Link selecionado.</span><button type="button" onClick={onClearLinkFilter} className="rounded-xl bg-white px-3 py-2 text-xs font-black uppercase text-purple-700">Limpar filtro</button></div>}
    <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"><Search size={19} className="shrink-0 text-purple-500"/><span className="sr-only">Buscar solicitações</span><input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar por nome, CPF ou contato" className="w-full bg-transparent text-sm font-medium outline-none"/></label>
    <div className="flex flex-wrap gap-2">{filters.map(([value, label]) => { const count = value === 'todos' ? Object.values(statusCounts).reduce((total, current) => total + current, 0) : statusCounts[value] || 0; return <button key={value} onClick={() => { setFilter(value); setOverdueOnly(false); }} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${filter === value && !overdueOnly ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>{label} ({count})</button>; })}<button type="button" onClick={() => { setOverdueOnly(current => !current); setFilter('aguardando_validacao'); }} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${overdueOnly ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800'}`}>Atrasadas ({overdueCount})</button></div>
    <div className="flex flex-wrap gap-2">{typeFilters.map(([value, label]) => { const count = value === 'todos' ? typeCounts.membro + typeCounts.consulente : typeCounts[value]; return <button key={value} onClick={() => setTypeFilter(value)} className={`rounded-xl border px-3 py-2 text-xs font-black ${typeFilter === value ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{label} <span className="ml-1 opacity-75">({count})</span></button>; })}</div>
    <div className="flex flex-wrap gap-2">{[['todos', 'Todas'], ['incompletos', 'Dados incompletos'], ['duplicados', 'Possível CPF duplicado']].map(([value, label]) => <button key={value} type="button" onClick={() => { setAttentionFilter(value); if (value !== 'todos') setFilter('aguardando_validacao'); }} className={`rounded-xl px-3 py-2 text-xs font-black ${attentionFilter === value ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}`}>{label}</button>)}</div>
    <div className="grid gap-3">{filtered.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">{searchTerm ? 'Nenhuma solicitação encontrada para esta busca.' : 'Nenhuma solicitação neste filtro.'}</Card> : pagination.items.map(item => { const consultee = item.tipoCadastro === 'consulente'; const waiting = getRegistrationRequestWaitingInfo(item); const issues = getRegistrationRequestIssues(item, cpfIndexIds); return <button key={item.id} onClick={() => open(item)} className="text-left"><Card className={`!border-none shadow-md ${waiting?.overdue ? 'ring-2 ring-amber-300' : issues.needsAttention ? 'ring-2 ring-rose-200' : ''}`}><div className="flex gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${issues.needsAttention ? 'bg-rose-100 text-rose-700' : waiting?.overdue ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-600'}`}>{issues.needsAttention ? <AlertTriangle size={22}/> : <ClipboardCheck size={22} />}</div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-900">{item.nome}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${consultee ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>{consultee ? 'Consulente' : 'Membro'}</span><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-700">{statusLabels[item.statusCadastro] || item.statusCadastro}</span>{waiting?.overdue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Análise atrasada</span>}{issues.missing.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase text-rose-800">Dados incompletos</span>}{issues.duplicateCpf && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase text-rose-800">Verificar CPF</span>}</div><p className="mt-1 text-xs font-bold text-gray-500">CPF: {maskCPF(item.cpf)} · Contato: {maskContact(item.contato)}</p><p className="mt-1 text-xs text-gray-500">{show(item.email)}</p>{issues.missing.length > 0 && <p className="mt-1 text-xs font-bold text-rose-700">Faltam: {issues.missing.join(', ')}</p>}<p className="mt-1 text-xs text-gray-400">Enviado em: {timestampText(item.enviadoEm)}</p>{waiting && <p className={`mt-1 text-xs font-black ${waiting.overdue ? 'text-amber-700' : 'text-indigo-600'}`}>{waiting.label}</p>}</div></div></Card></button>; })}</div>
    <Pagination pagination={pagination} label="solicitação(ões)" />
    <Modal isOpen={!!selected} onClose={() => !busy && setSelected(null)} title="Analisar solicitação de cadastro" maxWidth="max-w-2xl">{selected && <div className="space-y-6">
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Dados pessoais</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{(selected.tipoCadastro === 'consulente' ? [['Nome', selected.nome], ['CPF', maskCPF(selected.cpf)], ['Contato', selected.contato], ['E-mail', selected.email]] : [['Nome', selected.nome], ['CPF', maskCPF(selected.cpf)], ['Data de nascimento', selected.dataNascimento ? formatDateBr(selected.dataNascimento) : null], ['Sexo', selected.sexo], ['Estado civil', selected.estadoCivil], ['Contato', selected.contato], ['E-mail', selected.email]]).map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>
      {selected.tipoCadastro !== 'consulente' && <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Endereço</h4><div className="grid gap-3 text-sm sm:grid-cols-2">{[['CEP', selected.endereco?.cep], ['Logradouro', selected.endereco?.logradouro], ['Número', selected.endereco?.numero], ['Complemento', selected.endereco?.complemento], ['Bairro', selected.endereco?.bairro], ['Cidade', selected.endereco?.cidade], ['UF', selected.endereco?.uf]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>}
      {selected.tipoCadastro !== 'consulente' && <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Dados da Casa</h4><div className="grid gap-3 text-sm sm:grid-cols-3">{[['Data de entrada', selected.dadosCasa?.dataIngresso ? formatDateBr(selected.dadosCasa.dataIngresso) : null], ['Batizado na CAESF', selected.dadosCasa?.batizadoCaesf === true ? 'Sim' : selected.dadosCasa?.batizadoCaesf === false ? 'Não' : null], ['Data de batismo', selected.dadosCasa?.dataBatismoCaesf ? formatDateBr(selected.dadosCasa.dataBatismoCaesf) : null]].map(([label, value]) => <p key={label}><span className="block text-xs font-bold text-gray-400">{label}</span>{show(value)}</p>)}</div></section>}
      {selectedCanReview && <section className="space-y-4 border-t border-gray-100 pt-5"><h4 className="text-xs font-black uppercase text-indigo-600">Definir função na Casa</h4><div><p className="mb-2 text-xs font-black uppercase text-gray-500">Funções na Casa *</p><div className="flex flex-wrap gap-3">{effectiveFunctions.map(item => <label key={item.id} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectedFunctions.includes(item.id)} onChange={() => toggleFunction(item.id)} />{item.nome}</label>)}</div>{effectiveFunctions.length === 0 && <p className="text-sm text-amber-700">Nenhuma função ativa configurada.</p>}</div></section>}
      <section><h4 className="mb-3 text-xs font-black uppercase text-indigo-600">Origem</h4><p className="text-sm"><span className="block text-xs font-bold text-gray-400">Data de envio</span>{timestampText(selected.enviadoEm)}</p><p className="mt-3 text-sm"><span className="block text-xs font-bold text-gray-400">Forma de cadastro</span>{selected.fluxoOrigem === 'link' ? `Link público de ${selected.tipoCadastro === 'consulente' ? 'Consulente' : 'Membro'}` : 'Convite individual antigo'}</p></section>
      {selected.aceite && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="text-xs font-black uppercase text-emerald-800">Registro de aceite</h4><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><p><span className="block text-xs font-bold text-emerald-700">Termos</span>{selected.aceite.versao}</p><p><span className="block text-xs font-bold text-emerald-700">Data e hora</span>{timestampText(selected.aceite.aceitoEm)}</p><p><span className="block text-xs font-bold text-emerald-700">E-mail confirmado</span>{selected.aceite.emailConfirmado ? 'Sim' : 'Não se aplica'}</p><p><span className="block text-xs font-bold text-emerald-700">Protocolo</span><span className="break-all font-mono text-xs">{selected.aceite.protocolo}</span></p>{selected.aceite.resumoConteudo && <p className="sm:col-span-2"><span className="block text-xs font-bold text-emerald-700">Resumo criptográfico</span><span className="break-all font-mono text-[10px]">{selected.aceite.resumoConteudo}</span></p>}</div></section>}
      {selected.motivoRejeicao && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><strong>Motivo da rejeição:</strong> {selected.motivoRejeicao}</p>}
      {selected.statusCadastro === 'aguardando_validacao' && duplicatePersonId && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm font-black text-amber-900">CPF já cadastrado</p><p className="mt-1 text-xs text-amber-800">Esta solicitação não pode criar outra Pessoa com o mesmo CPF. Você pode consultar o cadastro existente ou rejeitar a solicitação.</p><Button variant="secondary" className="mt-3" onClick={() => { setSelected(null); onOpenPerson?.(duplicatePersonId); }}><Users size={18} /> Abrir Pessoa existente</Button></section>}
      {selected.statusCadastro === 'aguardando_validacao' && checkingDuplicate && <p className="rounded-xl bg-gray-50 p-3 text-sm font-bold text-gray-500">Verificando CPF...</p>}
      {selected.statusCadastro === 'aprovado' && selected.pessoaId && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-black text-emerald-800">Pessoa criada</p><p className="mt-1 text-xs text-emerald-700">Esta solicitação foi aprovada e está vinculada ao cadastro correspondente.</p><Button className="mt-3" onClick={() => { setSelected(null); onOpenPerson?.(selected.pessoaId); }}><Users size={18} /> Abrir em Pessoas</Button></section>}
      {selected.statusCadastro === 'aprovado' && selected.tipoCadastro !== 'consulente' && selected.notificacaoEmail?.status && emailStatus[selected.notificacaoEmail.status] && <p className={`rounded-xl p-3 text-sm font-bold ${emailStatus[selected.notificacaoEmail.status].className}`}>{emailStatus[selected.notificacaoEmail.status].label}</p>}
      {notification && <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div><p className="text-sm font-black text-indigo-900">Comunicar resultado</p><p className="mt-1 text-xs text-indigo-700">Confira a mensagem no WhatsApp ou e-mail antes de enviar.</p></div><p className="rounded-xl bg-white p-3 text-sm text-gray-700">{notification.message}</p><div className="grid gap-2 sm:grid-cols-2"><Button variant="success" disabled={!notification.whatsappUrl} onClick={() => window.open(notification.whatsappUrl, '_blank', 'noopener,noreferrer')}><MessageCircle size={17}/> Abrir WhatsApp</Button><Button variant="secondary" disabled={!notification.emailUrl} onClick={() => { window.location.href = notification.emailUrl; }}><Mail size={17}/> Abrir e-mail</Button></div></section>}
      {selectedCanReviewConsultee && <div className="space-y-3 border-t border-gray-100 pt-5"><p className="rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800">Ao aprovar, um Consulente será criado em Pessoas com os dados simplificados informados.</p><label className="block text-xs font-black uppercase text-gray-500">Motivo para rejeição<textarea value={reason} onChange={event => setReason(event.target.value)} disabled={busy} className="mt-2 min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium normal-case" placeholder="Obrigatório somente ao rejeitar" /></label><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => decide('approve')} disabled={busy || checkingDuplicate || !!duplicatePersonId}><CheckCircle2 size={18}/> {busy ? 'Processando...' : 'Aprovar Consulente'}</Button><Button variant="danger" onClick={() => decide('reject')} disabled={busy}><XCircle size={18}/> {busy ? 'Processando...' : 'Rejeitar solicitação'}</Button></div></div>}
      {selectedCanReview && <div className="space-y-3 border-t border-gray-100 pt-5"><label className="block text-xs font-black uppercase text-gray-500">Motivo para rejeição<textarea value={reason} onChange={event => setReason(event.target.value)} disabled={busy} className="mt-2 min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium normal-case" placeholder="Obrigatório somente ao rejeitar" /></label><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => decide('approve')} disabled={busy || checkingDuplicate || !!duplicatePersonId}><CheckCircle2 size={18} /> {busy ? 'Processando...' : 'Aprovar cadastro'}</Button><Button variant="danger" onClick={() => decide('reject')} disabled={busy}><XCircle size={18} /> {busy ? 'Processando...' : 'Rejeitar cadastro'}</Button></div></div>}
    </div>}</Modal>
  </div>;
}
