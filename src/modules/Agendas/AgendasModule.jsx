import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { createAgendamento, createConsulenteQuick, getAppCollection, onSnapshot, orderBy, query, where } from '../../services/firebase';
import { filterAppointments, getAvailableAgendas, getRemainingVacancies, selectQuickRegisteredPerson } from '../../utils/agendaScheduling';
import { getNomeServicoAtendimento, servicoControlaVagas } from '../../utils/domain';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { PessoaFormModal } from '../../components/pessoas/PessoaFormModal';
import { useToast } from '../../components/ui/useToast';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';

const filters = [{ id: 'proximos', label: 'Próximos' }, { id: 'hoje', label: 'Hoje' }, { id: 'realizados', label: 'Realizados/Concluídos' }, { id: 'cancelados', label: 'Cancelados' }, { id: 'todos', label: 'Todos' }];
const historicalFilters = new Set(['realizados', 'cancelados', 'todos']);
const appointmentQueryChunkSize = 30;

export const AgendasModule = ({ user, profile }) => {
  const [agendas, setAgendas] = useState([]); const [appointments, setAppointments] = useState([]); const [services, setServices] = useState([]);
  const [loadingData, setLoadingData] = useState(true); const [loadError, setLoadError] = useState(false); const [reloadVersion, setReloadVersion] = useState(0);
  const [filter, setFilter] = useState('proximos'); const [open, setOpen] = useState(false); const [step, setStep] = useState(1);
  const [service, setService] = useState(null); const [pessoa, setPessoa] = useState(null); const [agenda, setAgenda] = useState(null); const [saving, setSaving] = useState(false); const [quickRegisterOpen, setQuickRegisterOpen] = useState(false); const toast = useToast();
  useEffect(() => {
    setLoadingData(true); setLoadError(false);
    const pending = new Set(['agendas', 'appointments', 'services']); let appointmentUnsubs = []; let appointmentScope = null;
    const loaded = key => { pending.delete(key); if (!pending.size) setLoadingData(false); };
    const failed = error => { console.error(error); setLoadError(true); setLoadingData(false); };
    const clearAppointmentListeners = () => { appointmentUnsubs.forEach(unsub => unsub()); appointmentUnsubs = []; };
    const subscribeOperationalAppointments = agendaDocs => {
      const agendaIds = agendaDocs.map(doc => doc.id).sort(); const nextScope = agendaIds.join('|');
      if (nextScope === appointmentScope) return;
      appointmentScope = nextScope; clearAppointmentListeners(); pending.add('appointments'); setLoadingData(true);
      if (!agendaIds.length) { setAppointments([]); loaded('appointments'); return; }
      const chunks = Array.from({ length: Math.ceil(agendaIds.length / appointmentQueryChunkSize) }, (_, index) => agendaIds.slice(index * appointmentQueryChunkSize, (index + 1) * appointmentQueryChunkSize));
      const chunkResults = new Map();
      chunks.forEach((ids, index) => {
        const source = query(getAppCollection('consulentes'), where('agendaId', 'in', ids));
        appointmentUnsubs.push(onSnapshot(source, snapshot => {
          chunkResults.set(index, snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setAppointments([...chunkResults.values()].flat());
          if (chunkResults.size === chunks.length) loaded('appointments');
        }, failed));
      });
    };
    const historical = historicalFilters.has(filter);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const agendaSource = historical ? getAppCollection('agendas') : query(getAppCollection('agendas'), where('data', '>=', today), orderBy('data', 'asc'));
    if (historical) {
      const appointmentsCollection = getAppCollection('consulentes');
      const appointmentSource = filter === 'cancelados'
        ? query(appointmentsCollection, where('status', '==', 'Cancelado'))
        : filter === 'realizados'
          ? query(appointmentsCollection, where('status', 'in', ['Concluído', 'Faltou']))
          : appointmentsCollection;
      appointmentUnsubs.push(onSnapshot(appointmentSource, snap => { setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); loaded('appointments'); }, failed));
    }
    const agendaUnsub = onSnapshot(agendaSource, snap => {
      setAgendas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); loaded('agendas');
      if (!historical) subscribeOperationalAppointments(snap.docs);
    }, failed);
    const servicesUnsub = onSnapshot(getAppCollection('config_servicos'), snap => { setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.ativo !== false)); loaded('services'); }, failed);
    return () => { agendaUnsub(); servicesUnsub(); clearAppointmentListeners(); };
  }, [filter, reloadVersion]);
  const agendasById = useMemo(() => Object.fromEntries(agendas.map(item => [item.id, item])), [agendas]);
  const visible = useMemo(() => filterAppointments(appointments, agendasById, filter).sort((a, b) => (agendasById[a.agendaId]?.data?.toMillis?.() || 0) - (agendasById[b.agendaId]?.data?.toMillis?.() || 0)), [appointments, agendasById, filter]);
  const serviceDates = service ? getAvailableAgendas({ agendas, service }) : [];
  const personDates = service && pessoa ? getAvailableAgendas({ agendas, service, pessoa }) : [];
  const canQuickRegister = hasPermission(profile, PERMISSIONS.CONSULENTES_MANAGE);
  const quickRegistered = (savedPessoa, options = {}) => { const next = selectQuickRegisteredPerson({ service, pessoa, agenda }, savedPessoa); setService(next.service); setPessoa(next.pessoa); setAgenda(next.agenda); setQuickRegisterOpen(false); toast.success(options.existing ? 'Pessoa já cadastrada e selecionada.' : 'Consulente cadastrado e selecionado.'); };
  const reset = () => { setStep(1); setService(null); setPessoa(null); setAgenda(null); }; const close = () => { setOpen(false); reset(); };
  const confirm = async () => { setSaving(true); try { await createAgendamento({ agenda, pessoa, servicos: [service], userId: user.uid, status: 'Agendado', requireFuture: true, requireActivePessoa: true }); toast.success('Agendamento confirmado com sucesso.'); close(); } catch (error) { console.error(error); const code = error.message.split(':')[0]; const messages = { AGENDAMENTO_DUPLICADO: 'Esta pessoa já possui agendamento nesta data.', SEM_VAGA: 'A última vaga não está mais disponível.', AGENDA_INDISPONIVEL: 'Esta data não está mais disponível.', PUBLICO_NAO_PERMITIDO: 'O público desta pessoa não é permitido.', PESSOA_INATIVA: 'Esta pessoa não está mais ativa.' }; toast.error(messages[code] || 'Não foi possível confirmar o agendamento.'); } finally { setSaving(false); } };
  return <div className="space-y-6 pb-10">
    <header className="flex justify-between items-end gap-3"><div><h2 className="text-3xl font-black uppercase italic">Agendamentos</h2><p className="text-sm text-gray-500">Marcações de pessoas nos serviços da Casa</p></div><Button variant="warning" onClick={() => setOpen(true)}><Plus size={18}/> Novo Agendamento</Button></header>
    <div className="flex flex-wrap gap-2">{filters.map(item => <button key={item.id} onClick={() => setFilter(item.id)} className={`px-3 py-2 rounded-xl text-xs font-black ${filter === item.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}>{item.label}</button>)}</div>
    {loadingData && <div role="status" className="rounded-3xl bg-white py-16 text-center text-sm font-bold text-gray-500">Carregando agendamentos...</div>}
    {loadError && <div role="alert" className="space-y-3 rounded-3xl border border-rose-100 bg-rose-50 p-6 text-center"><p className="text-sm font-bold text-rose-700">Não foi possível carregar os agendamentos. Verifique a conexão e tente novamente.</p><Button type="button" variant="secondary" onClick={() => setReloadVersion(value => value + 1)}>Tentar novamente</Button></div>}
    {!loadingData && !loadError && <div className="space-y-3">{visible.map(item => { const itemAgenda = agendasById[item.agendaId]; return <Card key={item.id} className="flex justify-between gap-4"><div><strong>{item.nome || item.pessoaNome || 'Pessoa não identificada'}</strong><p className="text-xs text-gray-500">{(item.servicosIds || []).map(id => getNomeServicoAtendimento(item, id)).join(', ') || 'Serviço não informado'}</p><p className="text-xs font-bold text-indigo-700 mt-1">{itemAgenda?.data?.toDate?.().toLocaleDateString('pt-BR') || 'Data histórica indisponível'} · {itemAgenda?.horario || '--:--'} · {itemAgenda?.tipoTrabalhoNome || itemAgenda?.tipo || 'Trabalho não informado'}</p></div><span className="text-xs font-black">{item.status}</span></Card>; })}{!visible.length && <div className="text-center py-16 bg-white rounded-3xl"><CalendarDays className="mx-auto text-gray-300"/><p className="text-xs text-gray-400 mt-3">Nenhum agendamento neste filtro</p></div>}</div>}
    <Modal isOpen={open} onClose={close} title={`Novo Agendamento · Etapa ${step}/4`}><div className="space-y-4">
      {step === 1 && <><p className="text-xs font-black uppercase">Serviço</p>{services.map(item => { const count = getAvailableAgendas({ agendas, service: item }).length; return <button key={item.id} onClick={() => { setService(item); setPessoa(null); setAgenda(null); }} className={`block w-full text-left p-3 rounded-xl border ${service?.id === item.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100'}`}><strong>{item.nome}</strong><span className="block text-xs text-gray-500">{count} data(s) disponível(is)</span></button>; })}{service && !serviceDates.length && <p className="text-sm text-amber-700">Nenhuma data disponível para este serviço no momento.</p>}</>}
      {step === 2 && <><PessoaSearchSelector value={pessoa} onChange={selected => { setPessoa(selected?.ativo === false ? null : selected); setAgenda(null); }}/>{canQuickRegister && !pessoa && <><div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px bg-gray-200 flex-1"/>ou<span className="h-px bg-gray-200 flex-1"/></div><Button type="button" variant="secondary" className="w-full" onClick={() => setQuickRegisterOpen(true)}><Plus size={17}/> Cadastrar novo consulente</Button></>}{pessoa && !personDates.length && <p className="text-sm text-amber-700">Não existem datas disponíveis para este serviço e esta pessoa.</p>}</>}
      {step === 3 && <>{personDates.map(item => { const remaining = getRemainingVacancies(item, service); return <button key={item.id} onClick={() => setAgenda(item)} className={`block w-full text-left p-3 rounded-xl border ${agenda?.id === item.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100'}`}><strong>{item.data.toDate().toLocaleDateString('pt-BR')} · {item.horario}</strong><span className="block text-xs text-gray-600">{item.tipoTrabalhoNome || item.tipo}{servicoControlaVagas(service) ? ` · ${remaining} vaga(s) restante(s)` : ''}</span></button>; })}</>}
      {step === 4 && <div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2"><p><strong>Pessoa:</strong> {pessoa?.nome}</p><p><strong>Serviço:</strong> {service?.nome}</p><p><strong>Data:</strong> {agenda?.data?.toDate?.().toLocaleDateString('pt-BR')}</p><p><strong>Horário:</strong> {agenda?.horario}</p><p><strong>Tipo de Trabalho:</strong> {agenda?.tipoTrabalhoNome || agenda?.tipo}</p></div>}
      <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => step === 1 ? close() : setStep(step - 1)}>Voltar</Button>{step < 4 ? <Button className="flex-1" disabled={(step === 1 && (!service || !serviceDates.length)) || (step === 2 && (!pessoa || !personDates.length)) || (step === 3 && !agenda)} onClick={() => setStep(step + 1)}>Continuar</Button> : <Button variant="warning" className="flex-1" disabled={saving} onClick={confirm}>{saving ? 'Confirmando...' : 'Confirmar'}</Button>}</div>
    </div></Modal><PessoaFormModal isOpen={quickRegisterOpen} onClose={() => setQuickRegisterOpen(false)} onSaved={quickRegistered} user={user} allowedVinculos={['consulente']} createOperation={createConsulenteQuick}/>
  </div>;
};
