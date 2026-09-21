import React, { useEffect, useMemo, useState } from 'react';
import { Download, Mail, MessageCircle, RotateCcw, Search } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/useToast';
import { getAppCollection, onSnapshot } from '../../services/firebase';
import { resendEmailCommunicationOnServer } from '../../services/firebaseFunctions';
import { buildCommunicationWhatsappUrl, COMMUNICATION_STATUS_LABELS, COMMUNICATION_TYPE_LABELS, getCommunicationDiagnostic, summarizeCommunications } from '../../utils/communicationCenter';
import { normalizeSearchText } from '../../utils/pessoaSearch';
import { COMMUNICATION_EXPORT_COLUMNS, exportFilteredCsv } from '../../utils/dataExport';

const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || 0;
const statusClass = { enviado: 'bg-emerald-100 text-emerald-800', enviando: 'bg-amber-100 text-amber-800', erro: 'bg-rose-100 text-rose-800' };

export const ComunicacoesModule = () => {
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState({});
  const [statusFilter, setStatusFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [resending, setResending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let communicationsReady = false; let peopleReady = false;
    const ready = () => { if (communicationsReady && peopleReady) setLoading(false); };
    const failed = loadError => { console.error(loadError); setError(true); setLoading(false); };
    const unsubCommunications = onSnapshot(getAppCollection('comunicacoes_email'), snapshot => { setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); communicationsReady = true; ready(); }, failed);
    const unsubPeople = onSnapshot(getAppCollection('pessoas'), snapshot => { setPeople(Object.fromEntries(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]))); peopleReady = true; ready(); }, failed);
    return () => { unsubCommunications(); unsubPeople(); };
  }, []);

  const summary = useMemo(() => summarizeCommunications(items), [items]);
  const filtered = useMemo(() => {
    const term = normalizeSearchText(search);
    return items.filter(item => {
      const person = people[item.pessoaBaseId];
      const matchesText = !term || [item.nome, item.destinatario, person?.nome, person?.contato].some(value => normalizeSearchText(value).includes(term));
      return matchesText && (statusFilter === 'todos' || item.status === statusFilter) && (typeFilter === 'todos' || item.tipo === typeFilter);
    }).sort((a, b) => toMillis(b.criadoEm) - toMillis(a.criadoEm));
  }, [items, people, search, statusFilter, typeFilter]);
  const pagination = usePagination(filtered, [search, statusFilter, typeFilter]);

  const resend = async item => {
    setResending(item.id);
    try { await resendEmailCommunicationOnServer(item.id); toast.success('Reenvio solicitado com sucesso.'); }
    catch (sendError) { console.error(sendError); toast.error('Não foi possível reenviar esta comunicação.'); }
    finally { setResending(null); }
  };

  if (loading || error) return <DataLoadState loading={loading} error={error} subject="as comunicações" onRetry={() => window.location.reload()} />;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900">Comunicações</h2><p className="mt-1 text-sm text-gray-500">Acompanhamento de mensagens automáticas e contatos manuais</p></div><Button type="button" variant="secondary" disabled={!filtered.length} onClick={() => exportFilteredCsv({ filename: 'comunicacoes-filtradas.csv', columns: COMMUNICATION_EXPORT_COLUMNS, rows: filtered.map(item => ({ ...item, exportPerson: people[item.pessoaBaseId], exportTypeLabel: COMMUNICATION_TYPE_LABELS[item.tipo] || item.tipo, exportStatusLabel: COMMUNICATION_STATUS_LABELS[item.status] || item.status })) })}><Download size={15}/> Exportar CSV</Button></header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Total', items.length, 'text-indigo-700'], ['Enviados', summary.enviado, 'text-emerald-700'], ['Processando', summary.enviando, 'text-amber-700'], ['Falhas', summary.erro, 'text-rose-700']].map(([label, value, color]) => <Card key={label} className="!p-3"><p className={`text-2xl font-black ${color}`}>{value}</p><p className="text-[10px] font-black uppercase text-gray-500">{label}</p></Card>)}</div>
    <div className="grid gap-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-[1fr_180px_200px]"><label className="relative"><Search size={17} className="absolute left-3 top-3.5 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pessoa, e-mail ou contato" className="w-full rounded-xl bg-gray-50 py-3 pl-10 pr-3 text-sm outline-none"/></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold"><option value="todos">Todas as situações</option>{Object.entries(COMMUNICATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold"><option value="todos">Todos os tipos</option>{Object.entries(COMMUNICATION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <p className="px-1 text-xs text-gray-500"><strong className="text-gray-900">{filtered.length}</strong> comunicação(ões) encontrada(s)</p>
    <div className="space-y-3">{filtered.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhuma comunicação encontrada.</Card> : pagination.items.map(item => { const person = people[item.pessoaBaseId]; const whatsappUrl = buildCommunicationWhatsappUrl(person); const diagnostic = getCommunicationDiagnostic(item, person); return <Card key={item.id} className={`space-y-3 ${item.status === 'erro' ? '!border-rose-200' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 font-black text-gray-900"><Mail size={16}/>{COMMUNICATION_TYPE_LABELS[item.tipo] || 'Comunicação'}</p><p className="mt-1 text-sm font-bold text-gray-700">{person?.nome || item.nome || 'Pessoa não identificada'}</p><p className="break-all text-xs text-gray-500">{item.destinatario}</p><p className="mt-1 text-xs text-gray-400">{item.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível'}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${statusClass[item.status] || 'bg-gray-100 text-gray-700'}`}>{COMMUNICATION_STATUS_LABELS[item.status] || item.status}</span></div>{diagnostic && <div className={`rounded-2xl p-3 ${diagnostic.canResend ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-900'}`}><p className="text-sm font-black">{diagnostic.title}</p><p className="mt-1 text-xs font-medium">{diagnostic.message}</p>{diagnostic.destinationChanged && <p className="mt-2 text-xs font-bold">O cadastro agora usa {diagnostic.currentEmail}. O reenvio será feito para esse endereço atualizado.</p>}<p className="mt-2 text-[10px] font-bold uppercase opacity-70">Diagnóstico: {diagnostic.code}</p></div>}<div className="grid gap-2 sm:grid-cols-2">{item.status === 'erro' && <Button variant="secondary" disabled={resending === item.id || !diagnostic?.canResend} onClick={() => resend(item)}><RotateCcw size={16}/>{resending === item.id ? 'Reenviando...' : 'Reenviar e-mail'}</Button>}<Button variant="success" disabled={!whatsappUrl} onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}><MessageCircle size={16}/> Abrir WhatsApp</Button></div>{!whatsappUrl && <p className="text-xs font-bold text-amber-700">Contato de WhatsApp não disponível no cadastro.</p>}</Card>; })}</div>
    <Pagination pagination={pagination} label="comunicação(ões)" />
  </div>;
};
