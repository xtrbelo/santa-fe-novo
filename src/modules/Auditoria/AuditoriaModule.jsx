import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Download, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { getAppCollection, getDocs, limit, onSnapshot, orderBy, query, startAfter } from '../../services/firebase';
import { Card } from '../../components/ui/Card';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { buildAuditCsv, describeAuditEvent, filterAuditEvents, getAuditChanges, getAuditFieldDetails, getAuditOrigin, getAuditReferences, paginateAuditEvents } from '../../utils/auditCenter';
import { Button } from '../../components/ui/Button';
import { ROLE_LABELS } from '../../constants/roles';
import { archiveAuditHistoryOnServer } from '../../services/firebaseFunctions';
import { useToast } from '../../components/ui/useToast';

const categoryLabels = { todos: 'Todas as categorias', cadastro: 'Cadastros', acesso: 'Acessos', agenda: 'Agendas', atendimento: 'Atendimentos', outros: 'Outros' };
const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || 0;
const auditBatchSize = 100;

export const AuditoriaModule = ({ onOpenPerson }) => {
  const [auditInitial, setAuditInitial] = useState({ criadoEm: [], executadoEm: [] }); const [auditOlder, setAuditOlder] = useState({ criadoEm: [], executadoEm: [] }); const [auditCursors, setAuditCursors] = useState({ criadoEm: null, executadoEm: null }); const [hasOlder, setHasOlder] = useState({ criadoEm: false, executadoEm: false }); const [loadingOlder, setLoadingOlder] = useState(false);
  const [archivedAudits, setArchivedAudits] = useState([]); const [archiveMode, setArchiveMode] = useState('active'); const [eligibleCount, setEligibleCount] = useState(null); const [archiving, setArchiving] = useState(false); const toast = useToast();
  const [users, setUsers] = useState({}); const [people, setPeople] = useState({}); const [appointments, setAppointments] = useState({}); const [agendas, setAgendas] = useState({}); const [services, setServices] = useState({});
  const [category, setCategory] = useState('todos'); const [type, setType] = useState('todos'); const [period, setPeriod] = useState('30'); const [responsible, setResponsible] = useState('todos'); const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10); const [page, setPage] = useState(1);
  const [ready, setReady] = useState(new Set()); const [error, setError] = useState(false);
  useEffect(() => {
    const failed = loadError => { console.error(loadError); setError(true); };
    const loaded = key => setReady(current => new Set([...current, key]));
    const subscriptions = [
      ...['criadoEm', 'executadoEm'].map(field => onSnapshot(query(getAppCollection('auditoria'), orderBy(field, 'desc'), limit(auditBatchSize)), snapshot => { setAuditInitial(current => ({ ...current, [field]: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) })); setAuditCursors(current => ({ ...current, [field]: snapshot.docs.at(-1) || null })); setHasOlder(current => ({ ...current, [field]: snapshot.size === auditBatchSize })); loaded(`audits-${field}`); }, failed)),
      onSnapshot(query(getAppCollection('auditoria_arquivada'), orderBy('arquivadoEm', 'desc'), limit(auditBatchSize)), snapshot => { setArchivedAudits(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); loaded('archived-audits'); }, failed),
      onSnapshot(getAppCollection('usuarios'), snapshot => { setUsers(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))); loaded('users'); }, failed),
      onSnapshot(getAppCollection('pessoas'), snapshot => { setPeople(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))); loaded('people'); }, failed),
      onSnapshot(getAppCollection('consulentes'), snapshot => { setAppointments(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))); loaded('appointments'); }, failed),
      onSnapshot(getAppCollection('agendas'), snapshot => { setAgendas(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))); loaded('agendas'); }, failed),
      onSnapshot(getAppCollection('config_servicos'), snapshot => { setServices(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))); loaded('services'); }, failed),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, []);
  const audits = useMemo(() => archiveMode === 'archived' ? archivedAudits : [...new Map([...auditInitial.criadoEm, ...auditInitial.executadoEm, ...auditOlder.criadoEm, ...auditOlder.executadoEm].map(item => [item.id, item])).values()], [archiveMode, archivedAudits, auditInitial, auditOlder]);
  const loadOlderAudits = async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      await Promise.all(['criadoEm', 'executadoEm'].map(async field => {
        if (!hasOlder[field] || !auditCursors[field]) return;
        const snapshot = await getDocs(query(getAppCollection('auditoria'), orderBy(field, 'desc'), startAfter(auditCursors[field]), limit(auditBatchSize)));
        const next = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        setAuditOlder(current => ({ ...current, [field]: [...current[field], ...next] }));
        setAuditCursors(current => ({ ...current, [field]: snapshot.docs.at(-1) || current[field] }));
        setHasOlder(current => ({ ...current, [field]: snapshot.size === auditBatchSize }));
      }));
    } catch (loadError) { console.error(loadError); setError(true); }
    finally { setLoadingOlder(false); }
  };
  const enriched = useMemo(() => audits.map(event => {
    const description = describeAuditEvent(event); const appointment = appointments[event.agendamentoId || event.alvoId]; const agenda = agendas[event.agendaId || appointment?.agendaId || event.alvoId]; const personId = event.pessoaBaseId || event.pessoaId || appointment?.pessoaBaseId; const person = people[personId]; const targetUser = users[event.alvoUid]; const actor = users[event.executadoPor];
    const responsibleName = event.responsavelNome || actor?.nome || actor?.email || event.executadoPor || 'Sistema';
    const timestamp = toMillis(event.criadoEm || event.executadoEm);
    const agendaText = agenda?.data?.toDate ? `${agenda.data.toDate().toLocaleDateString('pt-BR')} às ${agenda.horario || '--:--'}` : null;
    const subject = person?.nome || appointment?.nome || targetUser?.nome || targetUser?.email || (agendaText ? `Agenda de ${agendaText}` : null) || event.pessoaBaseId || event.pessoaId || event.alvoUid || event.agendamentoId || event.agendaId || 'Registro do sistema';
    const roleChange = event.tipo === 'USUARIO_ROLE_ALTERADO';
    const serviceNames = ids => (ids || []).map(id => services[id]?.nome || `Serviço não localizado (${id})`);
    const friendlyDetail = event.servicosAnteriores || event.servicosNovos ? `Serviços: ${serviceNames(event.servicosAnteriores).join(', ') || 'nenhum'} → ${serviceNames(event.servicosNovos).join(', ') || 'nenhum'}` : description.detail;
    return { ...event, ...description, detail: friendlyDetail, origin: getAuditOrigin(event.tipo), personId, agendaText, valorAnteriorLabel: roleChange ? ROLE_LABELS[event.valorAnterior] || event.valorAnterior : event.valorAnteriorLabel, valorNovoLabel: roleChange ? ROLE_LABELS[event.valorNovo] || event.valorNovo : event.valorNovoLabel, changeLabel: roleChange ? 'Perfil' : event.changeLabel, servicosAnterioresNomes: event.servicosAnteriores ? serviceNames(event.servicosAnteriores) : undefined, servicosNovosNomes: event.servicosNovos ? serviceNames(event.servicosNovos) : undefined, subject, responsible: responsibleName, responsibleId: event.executadoPor || 'sistema', timestamp, dateText: timestamp ? new Date(timestamp).toLocaleString('pt-BR') : 'Data indisponível', categoryLabel: categoryLabels[description.category] || description.category, searchText: `${description.title} ${description.detail || ''} ${subject} ${responsibleName} ${agendaText || ''} ${event.tipo || ''}`.toLowerCase() };
  }), [audits, users, people, appointments, agendas, services]);
  const types = useMemo(() => [...new Set(enriched.map(item => item.tipo).filter(Boolean))].sort(), [enriched]);
  const responsibles = useMemo(() => [...new Map(enriched.map(item => [item.responsibleId, item.responsible])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [enriched]);
  const filtered = useMemo(() => filterAuditEvents(enriched, { category, type, period, responsible, startDate, endDate, search }), [enriched, category, type, period, responsible, startDate, endDate, search]);
  const pagination = useMemo(() => paginateAuditEvents(filtered, page, pageSize), [filtered, page, pageSize]);
  useEffect(() => setPage(1), [category, type, period, responsible, startDate, endDate, search, pageSize]);
  const exportCsv = () => {
    const blob = new Blob([buildAuditCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const changeArchiveMode = mode => { setArchiveMode(mode); setPeriod(mode === 'archived' ? 'todos' : '30'); setEligibleCount(null); };
  const inspectArchive = async () => { setArchiving(true); try { const result = await archiveAuditHistoryOnServer('preview'); setEligibleCount(result.eligible); if (!result.eligible) toast.success('Nenhum registro ultrapassou o prazo de 24 meses.'); } catch (archiveError) { console.error(archiveError); toast.error('Não foi possível verificar o histórico elegível.'); } finally { setArchiving(false); } };
  const archiveEligible = async () => {
    if (!eligibleCount || !window.confirm(`Arquivar ${eligibleCount} registro(s) com mais de 24 meses? Eles continuarão disponíveis na aba Arquivados.`)) return;
    setArchiving(true); try { const result = await archiveAuditHistoryOnServer('archive'); toast.success(`${result.archived} registro(s) arquivado(s) com segurança.`); setEligibleCount(null); } catch (archiveError) { console.error(archiveError); toast.error('Não foi possível arquivar o histórico.'); } finally { setArchiving(false); }
  };
  if (error || ready.size < 8) return <DataLoadState loading={!error} error={error} subject="a auditoria" onRetry={() => window.location.reload()}/>;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="text-indigo-600"/><h2 className="text-3xl font-black uppercase italic">Auditoria</h2></div><p className="mt-1 text-sm text-gray-500">Histórico centralizado das alterações do sistema</p></div><Button variant="secondary" disabled={!filtered.length} onClick={exportCsv}><Download size={17}/> Exportar CSV</Button></header>
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-indigo-950">Política de retenção: 24 meses</p><p className="mt-1 text-xs text-indigo-800">O arquivamento é manual, preserva o conteúdo original e não realiza exclusão definitiva.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={archiving} onClick={inspectArchive}><Archive size={16}/>{archiving ? 'Verificando...' : 'Verificar elegíveis'}</Button>{eligibleCount > 0 && <Button type="button" disabled={archiving} onClick={archiveEligible}>Arquivar {eligibleCount} registro(s)</Button>}</div></div></section>
    <div className="flex gap-2"><button type="button" onClick={() => changeArchiveMode('active')} className={`rounded-xl px-4 py-2 text-xs font-black ${archiveMode === 'active' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}>Histórico ativo</button><button type="button" onClick={() => changeArchiveMode('archived')} className={`rounded-xl px-4 py-2 text-xs font-black ${archiveMode === 'archived' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}>Arquivados ({archivedAudits.length})</button></div>
    <div className="grid gap-2 rounded-2xl bg-white p-3 shadow-sm lg:grid-cols-3">
      <label className="relative lg:col-span-2"><Search size={17} className="absolute left-3 top-3.5 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pessoa, responsável ou alteração" className="w-full rounded-xl bg-gray-50 py-3 pl-10 pr-3 text-sm outline-none"/></label>
      <select value={responsible} onChange={event => setResponsible(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold"><option value="todos">Todos os responsáveis</option>{responsibles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select value={category} onChange={event => setCategory(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={type} onChange={event => setType(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold"><option value="todos">Todos os tipos</option>{types.map(value => <option key={value} value={value}>{describeAuditEvent({ tipo: value }).title}</option>)}</select>
      <select value={period} onChange={event => setPeriod(event.target.value)} className="rounded-xl bg-gray-50 px-3 text-sm font-bold"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="todos">Todo o período</option><option value="personalizado">Período personalizado</option></select>
      {period === 'personalizado' && <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3"><label className="text-xs font-bold text-gray-600">Data inicial<input type="date" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded-xl bg-gray-50 p-3"/></label><label className="text-xs font-bold text-gray-600">Data final<input type="date" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-xl bg-gray-50 p-3"/></label></div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-gray-500">Mostrando <strong className="text-gray-900">{pagination.start}–{pagination.end}</strong> de <strong className="text-gray-900">{pagination.total}</strong> evento(s)</p><label className="text-xs font-bold text-gray-600">Registros por página <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))} className="ml-2 rounded-lg bg-white px-2 py-2">{[10, 20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="space-y-3">{pagination.items.map(item => { const changes = getAuditChanges(item); const fields = getAuditFieldDetails(item); const references = getAuditReferences(item); return <Card key={item.id} className="!p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-black text-gray-900">{item.title}</p><p className="mt-1 text-sm font-bold text-indigo-700">{item.subject}</p></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-black uppercase text-gray-600">{item.categoryLabel}</span><span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase text-indigo-700">{item.origin}</span></div></div>{item.detail && <p className="mt-2 text-sm text-gray-600">{item.detail}</p>}{item.agendaText && <p className="mt-2 text-xs font-bold text-amber-700">Agenda: {item.agendaText}</p>}{item.personId && <Button type="button" variant="ghost" className="mt-2 h-9 px-3 text-xs" onClick={() => onOpenPerson?.(item.personId)}><ExternalLink size={15}/> Abrir cadastro</Button>}{changes.map(change => <div key={change.label} className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-2"><p><span className="block font-black uppercase text-gray-400">Antes</span><span className="break-words text-gray-700">{change.before}</span></p><p><span className="block font-black uppercase text-gray-400">Depois</span><span className="break-words text-gray-700">{change.after}</span></p></div>)}{(fields.length > 0 || references.length > 0) && <details className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3"><summary className="cursor-pointer text-xs font-black text-indigo-700">Ver detalhes do registro</summary><div className="mt-3 space-y-3">{fields.length > 0 && <div><p className="text-[10px] font-black uppercase text-gray-400">Campos alterados</p>{fields.map(field => <div key={field.field} className="mt-1 text-xs text-gray-700"><strong>{field.label}</strong>{field.hasValues ? <span>: {String(field.before ?? 'Não informado')} → {String(field.after ?? 'Não informado')}</span> : <span className="text-gray-500"> — os valores anterior e posterior não foram registrados neste evento.</span>}</div>)}</div>}{references.length > 0 && <div><p className="text-[10px] font-black uppercase text-gray-400">Registros relacionados</p>{references.map(reference => <p key={`${reference.label}-${reference.value}`} className="break-all text-xs text-gray-600"><strong>{reference.label}:</strong> {reference.value}</p>)}</div>}</div></details>}<p className="mt-3 text-xs text-gray-400">{item.dateText} · {item.responsible}</p></Card>; })}{filtered.length === 0 && <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum evento encontrado.</Card>}</div>
    {pagination.total > 0 && <div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={pagination.currentPage === 1} onClick={() => setPage(value => value - 1)}>Anterior</Button><span className="text-xs font-black text-gray-600">Página {pagination.currentPage} de {pagination.totalPages}</span><Button variant="secondary" disabled={pagination.currentPage === pagination.totalPages} onClick={() => setPage(value => value + 1)}>Próxima</Button></div>}
    {archiveMode === 'active' && (hasOlder.criadoEm || hasOlder.executadoEm) && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center"><p className="mb-3 text-xs font-bold text-indigo-800">O histórico é carregado em blocos para economizar leituras e acelerar a tela. Filtros e exportação consideram os registros já carregados.</p><Button type="button" variant="secondary" disabled={loadingOlder} onClick={loadOlderAudits}>{loadingOlder ? 'Carregando histórico...' : 'Carregar histórico mais antigo'}</Button></div>}
  </div>;
};
