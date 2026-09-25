import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot, 
  Timestamp, 
  createAgendamento,
  cancelAgendamento,
  setAgendamentoPrioridade,
  updateAtendimentoStatus,
  updateAtendimentoServicos,
  corrigirStatusAtendimento,
  query,
  where
} from '../../services/firebase';
import { 
  maskCPF, 
  sortQueue, 
  getStatusColor 
} from '../../utils/formatters';
import { agendaAceitaServico, agendaExigeCpf, getAgendaPublicosPermitidos, getNomeServicoAtendimento, getPessoaVinculo, getServicosAtivosAtendimento, isAtendimentoCasa, isAtendimentoFluxoDia, isEventoServicos, isTipoTrabalhoAtendimento, servicoAtivoNaAgenda } from '../../utils/domain';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { PessoaFormModal } from '../../components/pessoas/PessoaFormModal';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';
import { closeDayWithWorkersOnServer } from '../../services/firebaseFunctions';
import { 
  BookOpenCheck, 
  Plus, 
  UserCheck, 
  CheckCircle2,
  Star,
  XCircle,
  UserX
  ,Pencil, RotateCcw
} from 'lucide-react';

const correctionOptions = status => ({ 'Concluído': ['Presente', 'Agendado'], Presente: ['Agendado'], Faltou: ['Agendado'] }[status] || []);

export const AtendimentoDiaCard = ({ agenda, user, profile, servicosCatalogo, workerGroups, substituteWorkerGroups, eventTeam = [], bookResponsibles = [], onScheduleReturn }) => {
  const [fila, setFila] = useState([]);
  const [modalWiz, setModalWiz] = useState(false);
  const [selCons, setSelCons] = useState(null);
  const [newPersonName, setNewPersonName] = useState(null);
  const [selSrvs, setSelSrvs] = useState({});
  const [step, setStep] = useState('search');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [serviceTarget, setServiceTarget] = useState(null);
  const [editSrvs, setEditSrvs] = useState({});
  const [savingServices, setSavingServices] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionStatus, setCorrectionStatus] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctingStatus, setCorrectingStatus] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null);
  const [dayClosingOpen, setDayClosingOpen] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState({ medium: {}, cambone: {} });
  const [selectedSubstitutes, setSelectedSubstitutes] = useState({ medium: {}, cambone: {} });
  const [showSubstitutes, setShowSubstitutes] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const [savingFinal, setSavingFinal] = useState(false);
  const [eventClosingOpen, setEventClosingOpen] = useState(false);
  const [selectedEventTeam, setSelectedEventTeam] = useState({});
  const [bookResponsibleId, setBookResponsibleId] = useState('');

  const toast = useToast();
  const isAttendanceWork = isTipoTrabalhoAtendimento(agenda);
  const requiresWorkers = isAtendimentoCasa(agenda);
  const isServiceEvent = isEventoServicos(agenda);
  const agendaServices = servicosCatalogo.filter(service => agendaAceitaServico(agenda, service.id) && servicoAtivoNaAgenda(agenda, service.id));

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(getAppCollection('consulentes'), where('agendaId', '==', agenda.id)), (s) => {
      setFila(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(isAtendimentoFluxoDia)
          .sort(sortQueue)
      );
    });
  }, [agenda.id, user]);


  const updateSt = async (appointment, st) => {
    try {
      await updateAtendimentoStatus({ agendaId: agenda.id, agendamentoId: appointment.id, status: st, userId: user.uid });
      toast.success(`Status alterado para ${st}`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status.');
      return false;
    }
  };

  const startDayClosing = () => { setDayClosingOpen(true); setSelectedWorkers({ medium: {}, cambone: {} }); setSelectedSubstitutes({ medium: {}, cambone: {} }); setBookResponsibleId(''); setShowSubstitutes(false); setWorkerSearch(''); };
  const toggleWorker = (role, id) => setSelectedWorkers(current => { const other = role === 'medium' ? 'cambone' : 'medium'; return { ...current, [role]: { ...current[role], [id]: !current[role][id] }, [other]: { ...current[other], [id]: false } }; });
  const toggleSubstitute = (role, id) => setSelectedSubstitutes(current => { const other = role === 'medium' ? 'cambone' : 'medium'; return { ...current, [role]: { ...current[role], [id]: !current[role][id] }, [other]: { ...current[other], [id]: false } }; });
  const confirmCompletion = async () => {
    const mediunsIds = Object.keys(selectedWorkers.medium).filter(id => selectedWorkers.medium[id]);
    const cambonesIds = Object.keys(selectedWorkers.cambone).filter(id => selectedWorkers.cambone[id]);
    const substituteMediunsIds = Object.keys(selectedSubstitutes.medium).filter(id => selectedSubstitutes.medium[id]);
    const substituteCambonesIds = Object.keys(selectedSubstitutes.cambone).filter(id => selectedSubstitutes.cambone[id]);
    if (requiresWorkers && !mediunsIds.length && !cambonesIds.length && !substituteMediunsIds.length && !substituteCambonesIds.length) { toast.error('Informe pelo menos um trabalhador participante.'); return; }
    if (requiresWorkers && !bookResponsibleId) { toast.error('Informe a dirigente responsável pelo atendimento.'); return; }
    setSavingFinal(true);
    try {
      const eventTeamIds = Object.keys(selectedEventTeam).filter(id => selectedEventTeam[id]);
      if (isServiceEvent && !eventTeamIds.length) { toast.error('Informe pelo menos um profissional ou voluntário do evento.'); setSavingFinal(false); return; }
      await closeDayWithWorkersOnServer({ agendaId: agenda.id, mediunsIds, cambonesIds, substituteMediunsIds, substituteCambonesIds, eventTeamIds, dirigenteResponsavelId: requiresWorkers ? bookResponsibleId : '' });
      setDayClosingOpen(false); setEventClosingOpen(false); toast.success(requiresWorkers ? 'Atendimento do dia fechado com a equipe registrada.' : isServiceEvent ? 'Evento encerrado com a equipe registrada.' : 'Lista de presença fechada.');
    } catch (error) { console.error(error); toast.error(error?.message?.includes('ATENDIMENTOS_PENDENTES') ? 'Ainda existem atendimentos pendentes.' : 'Não foi possível fechar o atendimento do dia.'); }
    finally { setSavingFinal(false); }
  };

  const togglePriority = async (appointment) => {
    try {
      await setAgendamentoPrioridade({ agendaId: agenda.id, agendamentoId: appointment.id, prioridade: !appointment.prioridade, userId: user.uid });
      toast.success(appointment.prioridade ? 'Prioridade removida.' : 'Atendimento marcado como prioritário.');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível alterar a prioridade.');
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelAgendamento({ agendaId: agenda.id, agendamentoId: cancelTarget.id, userId: user.uid });
      toast.success('Agendamento cancelado e vaga devolvida.');
      setCancelTarget(null);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível cancelar o agendamento.');
    }
  };

  const confirmAgendamento = async () => {
    const srvs = agendaServices.filter(s => selSrvs[s.id]);
    if (!srvs.length) {
      toast.error('Selecione pelo menos um serviço.');
      return;
    }

    const permittedTypes = getAgendaPublicosPermitidos(agenda);
    if (permittedTypes.length && !permittedTypes.includes(getPessoaVinculo(selCons))) {
      toast.error('O vínculo desta pessoa não é permitido nesta agenda.');
      return;
    }
    if (agendaExigeCpf(agenda) && !selCons?.cpf) { toast.error('Esta programação exige CPF do participante.'); return; }

    try {
      await createAgendamento({ agenda, pessoa: selCons, servicos: srvs, userId: user.uid, status: 'Presente', horaChegada: Timestamp.now() });
      toast.success(`Presença confirmada para ${selCons.nome}!`);
      setModalWiz(false);
      setStep('search');
      setSelCons(null);
      setSelSrvs({});
    } catch (err) {
      console.error(err);
      if (err.message === 'AGENDAMENTO_DUPLICADO') toast.error('Esta pessoa já possui um atendimento nesta agenda.');
      else if (err.message.startsWith('SEM_VAGA:')) toast.error(`Não há vagas disponíveis para ${err.message.split(':')[1]}.`);
      else if (err.code === 'permission-denied' || err.code === 'firestore/permission-denied') toast.error('A operação foi bloqueada pelas regras de segurança.');
      else toast.error('Erro ao marcar presença.');
    }
  };

  const registerMemberPresence = async pessoa => {
    try {
      await createAgendamento({ agenda, pessoa, servicos: [], userId: user.uid, status: 'Presente', horaChegada: Timestamp.now() });
      toast.success(`Presença registrada para ${pessoa.nome}.`);
      setModalWiz(false); setSelCons(null);
    } catch (error) {
      console.error(error);
      if (error.message === 'AGENDAMENTO_DUPLICADO') toast.error('Esta pessoa já está registrada nesta atividade.');
      else toast.error('Não foi possível registrar a presença.');
    }
  };

  const startServiceEdit = appointment => {
    setServiceTarget(appointment);
    setEditSrvs(Object.fromEntries(getServicosAtivosAtendimento(appointment).map(id => [id, true])));
  };

  const confirmServiceEdit = async () => {
    const selected = agendaServices.filter(service => editSrvs[service.id]);
    if (!selected.length) { toast.error('O atendimento deve manter pelo menos um serviço.'); return; }
    setSavingServices(true);
    try {
      await updateAtendimentoServicos({ agendaId: agenda.id, agendamentoId: serviceTarget.id, servicos: selected, userId: user.uid, responsavelNome: profile?.nome || user.displayName || user.email });
      toast.success('Serviços do atendimento atualizados.');
      setServiceTarget(null);
    } catch (error) {
      console.error(error);
      if (error.message.startsWith('SEM_VAGA:')) toast.error(`Não há vagas disponíveis para ${error.message.split(':')[1]}.`);
      else if (error.message === 'SERVICOS_SEM_ALTERACAO') toast.info('Nenhuma alteração foi feita nos serviços.');
      else toast.error('Não foi possível alterar os serviços do atendimento.');
    } finally { setSavingServices(false); }
  };

  const startStatusCorrection = appointment => {
    const options = correctionOptions(appointment.status);
    setCorrectionTarget(appointment);
    setCorrectionStatus(options[0] || '');
    setCorrectionReason('');
  };

  const confirmStatusCorrection = async () => {
    if (!correctionReason.trim()) { toast.error('Informe o motivo da correção.'); return; }
    setCorrectingStatus(true);
    try {
      await corrigirStatusAtendimento({ agendaId: agenda.id, agendamentoId: correctionTarget.id, status: correctionStatus, motivo: correctionReason, userId: user.uid });
      toast.success(`Status corrigido para ${correctionStatus}.`);
      setCorrectionTarget(null);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível corrigir o status do atendimento.');
    } finally { setCorrectingStatus(false); }
  };

  return (
    <Card className="!border-none shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BookOpenCheck size={22} />
          </div>
          <div>
            <h4 className="font-black text-gray-900 uppercase italic leading-tight text-sm sm:text-base">
              {agenda.tipo}
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {isAttendanceWork ? 'Atendimentos de Hoje' : 'Presenças de Hoje'}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => {
            setModalWiz(true);
            setStep('search');
            setSelCons(null);
            setSelSrvs({});
          }} 
          variant="secondary" 
          className="px-3.5 py-2 text-xs h-auto rounded-xl"
        >
          <Plus size={14} /> {isAttendanceWork ? 'Marcação Rápida' : 'Registrar presença'}
        </Button>
      </div>

      <div className="space-y-3">
        {fila.length === 0 ? (
          <p className="text-center py-8 text-xs text-gray-400 font-bold uppercase tracking-widest italic">
            Nenhum consulente na fila de hoje
          </p>
        ) : (
          fila.map((c, i) => (
            <div 
              key={c.id} 
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                c.status === 'Concluído' 
                  ? 'opacity-60 bg-gray-50/80 border-gray-100' 
                  : 'bg-white border-gray-100 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex gap-3 min-w-0">
                  <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black shrink-0 ${
                    c.status === 'Presente' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 text-sm sm:text-base leading-tight truncate">
                      {c.nome}
                    </p>
                    <p className="text-[10px] sm:text-xs font-bold text-emerald-600 uppercase mt-0.5 truncate">
                      {getServicosAtivosAtendimento(c).map(id => servicosCatalogo.find(service => service.id === id)?.nome || getNomeServicoAtendimento(c, id)).join(' • ')}
                    </p>
                    {c.observacao && <p className="mt-1 text-xs text-gray-600"><strong>Observação:</strong> {c.observacao}</p>}
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg shadow-sm ${getStatusColor(c.status)}`}>{c.status}</span>
              </div>

              {isAttendanceWork && ['Agendado', 'Presente'].includes(c.status) && <div className="flex flex-wrap gap-2 mt-3">
                <Button onClick={() => startServiceEdit(c)} variant="secondary" className="px-3 h-10"><Pencil size={16}/> Alterar serviços</Button>
                <Button onClick={() => togglePriority(c)} variant="secondary" className={`px-3 h-10 ${c.prioridade ? 'text-amber-600 bg-amber-50' : ''}`} title="Alternar prioridade">
                  <Star size={16} fill={c.prioridade ? 'currentColor' : 'none'} /> Prioridade
                </Button>
                <Button onClick={() => setCancelTarget(c)} variant="danger" className="px-3 h-10"><XCircle size={16} /> Cancelar</Button>
                {c.status === 'Agendado' && <>
                  <Button onClick={() => updateSt(c, 'Faltou')} variant="secondary" className="px-3 h-10"><UserX size={16} /> Faltou</Button>
                  <Button onClick={() => updateSt(c, 'Presente')} className="flex-1 min-w-48 h-10 bg-blue-600 hover:bg-blue-700 text-white"><UserCheck size={16} /> Dar Entrada</Button>
                </>}
                {c.status === 'Presente' && <Button onClick={async () => { if (await updateSt(c, 'Concluído')) setReturnTarget(c); }} variant="success" className="flex-1 min-w-48 h-10"><CheckCircle2 size={16} /> Finalizar Atendimento</Button>}
              </div>}
              {!isAttendanceWork && c.status === 'Agendado' && <Button onClick={() => updateSt(c, 'Presente')} className="mt-3 w-full h-10 bg-blue-600 hover:bg-blue-700 text-white"><UserCheck size={16}/> Registrar presença</Button>}
              {isAttendanceWork && hasPermission(profile, PERMISSIONS.ATTENDANCE_STATUS_CORRECT) && correctionOptions(c.status).length > 0 && <Button onClick={() => startStatusCorrection(c)} variant="ghost" className="mt-2 h-9 px-3 text-xs text-amber-700"><RotateCcw size={15}/> Corrigir status</Button>}
            </div>
          ))
        )}
      </div>

      {fila.length > 0 && fila.every(item => !(isAttendanceWork ? ['Agendado', 'Presente'] : ['Agendado']).includes(item.status)) && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-black text-emerald-950">{isAttendanceWork ? 'Todos os atendimentos foram encerrados.' : 'As presenças do trabalho foram registradas.'}</p>{requiresWorkers ? workerGroups?.groups?.length ? <><p className="mb-3 text-xs text-emerald-700">Turma(s): {workerGroups.groups.map(group => group.nome).join(', ')}. Informe quem realmente trabalhou hoje.</p><Button variant="success" className="w-full" onClick={startDayClosing}><CheckCircle2 size={18}/> Fechar atendimento do dia</Button></> : <p className="mt-1 text-xs font-bold text-rose-700">Nenhuma turma está configurada para este dia. Cadastre a turma em Configurações para realizar o fechamento.</p> : <><p className="mb-3 text-xs text-emerald-700">{isServiceEvent ? 'Este evento não utiliza turma de médiuns e cambones.' : 'Este trabalho interno não utiliza turma de atendimento.'}</p><Button variant="success" className="w-full" onClick={isServiceEvent ? () => { setSelectedEventTeam({}); setEventClosingOpen(true); } : confirmCompletion} disabled={savingFinal}><CheckCircle2 size={18}/> {savingFinal ? 'Fechando...' : isServiceEvent ? 'Fechar evento' : 'Fechar lista de presença'}</Button></>}</div>}

      <Modal 
        isOpen={modalWiz} 
        onClose={() => setModalWiz(false)} 
        title={isAttendanceWork ? 'Marcação Rápida de Atendimento' : 'Registrar presença'}
      >
        {step === 'search' ? (
          <PessoaSearchSelector value={selCons} onChange={isAttendanceWork ? setSelCons : registerMemberPresence} onContinue={isAttendanceWork ? () => setStep('services') : null} onCreateNew={isAttendanceWork ? setNewPersonName : null} allowedVinculos={isAttendanceWork ? null : ['membro']} accent="emerald" />
        ) : (
          <div className="space-y-6">
            <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
              <UserCheck className="text-emerald-600 shrink-0" size={22} />
              <div>
                <p className="font-bold text-emerald-950 text-sm">{selCons?.nome}</p>
                <p className="text-[10px] text-emerald-700 font-medium">CPF: {maskCPF(selCons?.cpf)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-1">
                Selecione os Serviços
              </p>
              {agendaServices.map(s => (
                <label 
                  key={s.id} 
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    selSrvs[s.id] ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selSrvs[s.id] || false} 
                    onChange={() => setSelSrvs({ ...selSrvs, [s.id]: !selSrvs[s.id] })} 
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" 
                  />
                  <span className="text-sm font-bold text-gray-700">{s.nome}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('search')}>
                Voltar
              </Button>
              <Button onClick={confirmAgendamento} variant="success">
                <CheckCircle2 size={18} /> Confirmar & Dar Entrada
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal isOpen={!!serviceTarget} onClose={() => !savingServices && setServiceTarget(null)} title="Alterar serviços do atendimento">
        <div className="space-y-5"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-black text-emerald-950">{serviceTarget?.nome}</p><p className="mt-1 text-xs text-emerald-700">O atendimento continuará único para esta pessoa.</p></div><div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Serviços deste atendimento</p>{agendaServices.map(service => <label key={service.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${editSrvs[service.id] ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white'}`}><input type="checkbox" checked={editSrvs[service.id] || false} onChange={() => setEditSrvs(current => ({ ...current, [service.id]: !current[service.id] }))} className="h-4 w-4 rounded text-emerald-600"/><span className="text-sm font-bold text-gray-700">{service.nome}</span></label>)}</div><div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={savingServices} onClick={() => setServiceTarget(null)}>Cancelar</Button><Button variant="success" disabled={savingServices} onClick={confirmServiceEdit}>{savingServices ? 'Salvando...' : 'Salvar serviços'}</Button></div></div>
      </Modal>
      <Modal isOpen={eventClosingOpen} onClose={() => !savingFinal && setEventClosingOpen(false)} title="Fechar evento">
        <div className="space-y-4"><div className="rounded-xl bg-cyan-50 p-3"><p className="text-sm font-black text-cyan-950">Equipe que trabalhou no evento</p><p className="text-xs text-cyan-800">Marque todos os profissionais e voluntários participantes.</p></div><div className="max-h-80 space-y-2 overflow-y-auto">{eventTeam.map(member => <label key={member.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedEventTeam[member.id] ? 'border-cyan-300 bg-cyan-50' : 'border-gray-100'}`}><input type="checkbox" checked={selectedEventTeam[member.id] || false} onChange={() => setSelectedEventTeam(current => ({ ...current, [member.id]: !current[member.id] }))} className="h-4 w-4 rounded text-cyan-700"/><span><strong className="block text-sm">{member.nome}</strong><span className="text-xs text-cyan-800">{member.funcao}</span></span></label>)}{!eventTeam.length && <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">Cadastre a equipe em Configurações antes de fechar o evento.</p>}</div><div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={savingFinal} onClick={() => setEventClosingOpen(false)}>Cancelar</Button><Button variant="success" disabled={savingFinal || !eventTeam.length} onClick={confirmCompletion}>{savingFinal ? 'Fechando...' : 'Confirmar fechamento'}</Button></div></div>
      </Modal>

      <Modal isOpen={dayClosingOpen} onClose={() => !savingFinal && setDayClosingOpen(false)} title="Fechar atendimento do dia">
        <div className="space-y-4"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-sm font-black text-emerald-950">Equipe do dia</p><p className="text-xs text-emerald-700">Turma(s): {workerGroups?.groups?.map(group => group.nome).join(', ')}</p></div><input value={workerSearch} onChange={event => setWorkerSearch(event.target.value)} placeholder="Buscar trabalhador pelo nome" className="w-full rounded-xl bg-gray-50 p-3 text-sm"/>{[['medium', 'Médiuns', workerGroups?.mediuns || []], ['cambone', 'Cambones', workerGroups?.cambones || []]].map(([role, label, workers]) => { const visibleWorkers = workers.filter(item => String(item.nome || '').toLowerCase().includes(workerSearch.trim().toLowerCase())); return <section key={role}><p className="mb-2 text-xs font-black uppercase text-gray-500">{label} da turma</p><div className="max-h-44 space-y-2 overflow-y-auto">{visibleWorkers.map(worker => <label key={worker.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedWorkers[role][worker.id] ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100'}`}><input type="checkbox" checked={selectedWorkers[role][worker.id] || false} onChange={() => toggleWorker(role, worker.id)} className="h-4 w-4 rounded text-emerald-600"/><span className="text-sm font-bold">{worker.nome}</span></label>)}{!visibleWorkers.length && <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">Nenhum trabalhador disponível nesta função.</p>}</div></section>; })}<button className="text-sm font-bold text-indigo-700" onClick={() => setShowSubstitutes(value => !value)}>{showSubstitutes ? 'Ocultar substitutos' : '+ Adicionar substituto'}</button>{showSubstitutes && [['medium', 'Médiuns substitutos', substituteWorkerGroups?.mediuns || []], ['cambone', 'Cambones substitutos', substituteWorkerGroups?.cambones || []]].map(([role, label, workers]) => { const regularIds = new Set([...(workerGroups?.mediuns || []), ...(workerGroups?.cambones || [])].map(item => item.id)); const visible = workers.filter(item => !regularIds.has(item.id) && String(item.nome || '').toLowerCase().includes(workerSearch.trim().toLowerCase())); return <section key={`sub-${role}`}><p className="mb-2 text-xs font-black uppercase text-indigo-600">{label}</p><div className="max-h-36 space-y-2 overflow-y-auto">{visible.map(worker => <label key={worker.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedSubstitutes[role][worker.id] ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100'}`}><input type="checkbox" checked={selectedSubstitutes[role][worker.id] || false} onChange={() => toggleSubstitute(role, worker.id)} className="h-4 w-4 rounded text-indigo-600"/><span className="text-sm font-bold">{worker.nome}</span></label>)}{!visible.length && <p className="text-xs text-gray-500">Nenhum substituto disponível.</p>}</div></section>; })}<p className="text-xs text-gray-500">É obrigatório informar pelo menos um participante. Substitutos serão identificados no histórico.</p><label className="block text-xs font-black uppercase text-gray-500">Dirigente responsável pelo trabalho *<select value={bookResponsibleId} onChange={event => setBookResponsibleId(event.target.value)} className="mt-1 w-full rounded-xl bg-violet-50 p-3 text-sm"><option value="">Selecione</option>{bookResponsibles.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.papel === 'titular' ? 'Dirigente titular' : 'Responsável substituta'}</option>)}</select></label>{!bookResponsibles.length && <p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">Configure as responsáveis pelo Livro Mediúnico antes do fechamento.</p>}<div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={savingFinal} onClick={() => setDayClosingOpen(false)}>Cancelar</Button><Button variant="success" disabled={savingFinal} onClick={confirmCompletion}>{savingFinal ? 'Fechando...' : 'Fechar o dia'}</Button></div></div>
      </Modal>
      <Modal isOpen={!!correctionTarget} onClose={() => !correctingStatus && setCorrectionTarget(null)} title="Corrigir status do atendimento">
        <div className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Use esta opção somente para desfazer uma marcação incorreta. A correção ficará registrada na auditoria.</div><p className="text-sm"><strong>Pessoa:</strong> {correctionTarget?.nome}</p><p className="text-sm"><strong>Status atual:</strong> {correctionTarget?.status}</p><label className="block text-sm font-bold">Novo status<select value={correctionStatus} onChange={event => setCorrectionStatus(event.target.value)} className="mt-1 w-full rounded-xl bg-gray-50 p-3">{correctionOptions(correctionTarget?.status).map(status => <option key={status}>{status}</option>)}</select></label><label className="block text-sm font-bold">Motivo<textarea value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} placeholder="Ex.: Finalizado por engano; a pessoa ainda aguarda atendimento." className="mt-1 min-h-24 w-full rounded-xl bg-gray-50 p-3"/></label><div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={correctingStatus} onClick={() => setCorrectionTarget(null)}>Cancelar</Button><Button variant="warning" disabled={correctingStatus || !correctionReason.trim()} onClick={confirmStatusCorrection}>{correctingStatus ? 'Corrigindo...' : 'Confirmar correção'}</Button></div></div>
      </Modal>
      <PessoaFormModal key={newPersonName || 'closed'} isOpen={newPersonName !== null} initialName={newPersonName || ''} user={user} allowedVinculos={profile?.role === 'atendimento' || isServiceEvent ? ['consulente'] : ['consulente', 'membro']} cpfRequired={agendaExigeCpf(agenda)} onClose={() => setNewPersonName(null)} onSaved={pessoa => { setSelCons(pessoa); setStep('services'); }} />

      <ConfirmDialog
        isOpen={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        onConfirm={() => { const target = returnTarget; setReturnTarget(null); onScheduleReturn?.({ ...target, servicosIds: getServicosAtivosAtendimento(target) }); }}
        title="Agendar retorno"
        message={`O atendimento de "${returnTarget?.nome || ''}" foi concluído. Deseja marcar um retorno em uma data futura?`}
        confirmText="Sim, Agendar Retorno"
        cancelText="Não, Finalizar"
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title="Cancelar Agendamento"
        message={`Cancelar o agendamento de "${cancelTarget?.nome}"? A vaga será devolvida automaticamente.`}
        confirmText="Sim, Cancelar"
      />
    </Card>
  );
};
