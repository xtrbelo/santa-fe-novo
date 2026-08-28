import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot, 
  findPessoaByCpf,
  createAgendamento,
  cancelAgendamento,
  concluirAgenda,
  editarAgenda,
  cancelarServicoAgenda,
  cancelarAgenda,
  excluirAgendaVazia,
  corrigirStatusAtendimento,
  Timestamp,
  query,
  where
} from '../../services/firebase';
import { 
  maskCPF, 
  cleanDigits, 
  sortQueue, 
  getStatusColor 
} from '../../utils/formatters';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getPessoaVinculo, servicoAtivoNaAgenda, servicoControlaVagas } from '../../utils/domain';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { 
  CalendarDays, 
  ChevronRight, 
  Plus, 
  Search, 
  UserCheck, 
  CheckCircle2,
  XCircle,
  LockKeyhole
} from 'lucide-react';

export const AgendaAdminCard = ({ agenda, user, profile, servicosCatalogo, trabalhos }) => {
  const [expanded, setExpanded] = useState(false);
  const [fila, setFila] = useState([]);
  const [modalWiz, setModalWiz] = useState(false);
  const [step, setStep] = useState('search');
  const [buscaCpf, setBuscaCpf] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selCons, setSelCons] = useState(null);
  const [selSrvs, setSelSrvs] = useState({});
  const [cancelTarget, setCancelTarget] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancelAgenda, setConfirmCancelAgenda] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [serviceToCancel, setServiceToCancel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionStatus, setCorrectionStatus] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  const toast = useToast();
  const isClosed = ['Concluída', 'Cancelada'].includes(agenda.status);
  const agendaServices = servicosCatalogo.filter(service => agendaAceitaServico(agenda, service.id));
  const summary = fila.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
  const hasExecutedAppointment = fila.some(item => ['Presente', 'Concluído'].includes(item.status));

  useEffect(() => {
    if (!expanded || !user) return;
    return onSnapshot(query(getAppCollection('consulentes'), where('agendaId', '==', agenda.id)), (s) => {
      setFila(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort(sortQueue)
      );
    });
  }, [expanded, agenda.id, user]);

  const handleCancel = async () => {
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

  const handleClose = async () => {
    try {
      await concluirAgenda({ agendaId: agenda.id, userId: user.uid });
      toast.success('Agenda concluída. Novas alterações foram bloqueadas.');
      setConfirmClose(false);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível concluir a agenda.');
    }
  };

  const startEdit = () => {
    setEditDraft({
      data: agenda.data?.toDate().toISOString().slice(0, 10) || '', horario: agenda.horario || '12:00',
      tipoTrabalhoId: agenda.tipoTrabalhoId || '', publicosPermitidos: getAgendaPublicosPermitidos(agenda),
      servicosIds: agenda.servicosIds || agendaServices.map(item => item.id), vagasTotais: { ...(agenda.vagasTotais || {}) }
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    const work = trabalhos.find(item => item.id === editDraft.tipoTrabalhoId);
    const selected = servicosCatalogo.filter(item => editDraft.servicosIds.includes(item.id));
    try {
      await editarAgenda({ agendaId: agenda.id, userId: user.uid, changes: {
        data: Timestamp.fromDate(new Date(`${editDraft.data}T${editDraft.horario}:00`)), horario: editDraft.horario,
        tipoTrabalhoId: work?.id || agenda.tipoTrabalhoId, tipoTrabalhoNome: work?.nome || agenda.tipo, tipo: work?.nome || agenda.tipo,
        publicosPermitidos: editDraft.publicosPermitidos, servicosIds: editDraft.servicosIds,
        servicosNomes: Object.fromEntries(selected.map(item => [item.id, item.nome])),
        servicosStatus: Object.fromEntries(selected.map(item => [item.id, agenda.servicosStatus?.[item.id] || 'Ativo'])),
        vagasTotais: editDraft.vagasTotais
      }});
      toast.success('Agenda atualizada.'); setEditing(false);
    } catch (error) { console.error(error); toast.error(error.message === 'LIMITE_MENOR_QUE_OCUPACAO' ? 'O limite não pode ser menor que a ocupação.' : error.message === 'SERVICO_COM_ATENDIMENTOS' ? 'Serviço com atendimentos não pode ser removido.' : 'Não foi possível editar.'); }
  };
  const handleCancelService = async () => { try { const count = await cancelarServicoAgenda({ agendaId: agenda.id, servicoId: serviceToCancel.id, userId: user.uid }); toast.info(`Serviço cancelado. ${count} pessoa(s) afetada(s).`); setServiceToCancel(null); } catch (error) { console.error(error); toast.error('Não foi possível cancelar o serviço.'); } };
  const handleCancelAgenda = async () => {
    try {
      await cancelarAgenda({ agendaId: agenda.id, userId: user.uid });
      toast.success('Agenda cancelada e preservada no histórico.');
      setConfirmCancelAgenda(false);
    } catch (error) {
      console.error(error);
      if (error.message === 'AGENDA_INDISPONIVEL') toast.error('Esta agenda já está concluída ou cancelada.');
      else if (error.message === 'AGENDA_POSSUI_ATENDIMENTO_EXECUTADO') toast.error('Esta agenda já possui atendimento iniciado ou concluído e não pode ser cancelada. Utilize Concluir Agenda.');
      else if (error.message === 'AGENDA_NAO_ENCONTRADA') toast.error('Agenda não encontrada.');
      else if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied') toast.error('Sua sessão não possui permissão para realizar esta operação.');
      else toast.error('Não foi possível cancelar a agenda.');
    }
  };
  const handleDelete = async () => {
    try {
      await excluirAgendaVazia({ agendaId: agenda.id, userId: user.uid });
      toast.success('Agenda vazia excluída definitivamente.');
      setConfirmDelete(false);
    } catch (error) {
      console.error(error);
      if (error.message === 'AGENDA_POSSUI_HISTORICO') toast.error('Esta agenda possui atendimentos e não pode ser excluída. Utilize Cancelar Agenda.');
      else if (error.message === 'AGENDA_NAO_ENCONTRADA') toast.error('Agenda não encontrada.');
      else if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied') toast.error('Apenas um administrador pode excluir uma agenda.');
      else toast.error('Não foi possível excluir.');
    }
  };
  const correctionOptions = status => ({ 'Concluído': ['Presente', 'Agendado'], Presente: ['Agendado'], Faltou: ['Agendado'] }[status] || []);
  const openCorrection = appointment => {
    const options = correctionOptions(appointment.status);
    setCorrectionTarget(appointment);
    setCorrectionStatus(options[0] || '');
    setCorrectionReason('');
  };
  const handleCorrection = async () => {
    if (!correctionReason.trim()) { toast.error('Informe o motivo da correção.'); return; }
    try {
      await corrigirStatusAtendimento({ agendaId: agenda.id, agendamentoId: correctionTarget.id, status: correctionStatus, motivo: correctionReason, userId: user.uid });
      toast.success(`Status corrigido para ${correctionStatus}.`);
      setCorrectionTarget(null);
    } catch (error) {
      console.error(error);
      if (error.message === 'MOTIVO_OBRIGATORIO') toast.error('Informe o motivo da correção.');
      else if (error.message === 'CORRECAO_STATUS_INVALIDA') toast.error('Esta correção de status não é permitida.');
      else if (error.message === 'AGENDA_INDISPONIVEL') toast.error('Não é possível corrigir atendimentos de uma agenda cancelada.');
      else if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied') toast.error('Apenas um administrador pode corrigir o status.');
      else toast.error('Não foi possível corrigir o status.');
    }
  };

  const confirmAgendamento = async () => {
    const srvs = agendaServices.filter(s => selSrvs[s.id] && servicoAtivoNaAgenda(agenda, s.id));
    if (!srvs.length) {
      toast.error('Selecione pelo menos um serviço para agendar.');
      return;
    }

    const permittedTypes = getAgendaPublicosPermitidos(agenda);
    if (permittedTypes.length && !permittedTypes.includes(getPessoaVinculo(selCons))) {
      toast.error('O vínculo desta pessoa não é permitido nesta agenda.');
      return;
    }

    try {
      await createAgendamento({ agenda, pessoa: selCons, servicos: srvs, userId: user.uid, status: 'Agendado' });
      toast.success(`Agendamento de ${selCons.nome} confirmado com sucesso!`);
      setModalWiz(false);
      setStep('search');
      setSelCons(null);
      setSelSrvs({});
      setBuscaCpf('');
    } catch (err) {
      console.error(err);
      if (err.message === 'AGENDAMENTO_DUPLICADO') toast.error('Esta pessoa já possui agendamento ativo nesta agenda.');
      else if (err.message.startsWith('SEM_VAGA:')) toast.error(`Não há vagas disponíveis para ${err.message.split(':')[1]}.`);
      else if (err.message === 'AGENDA_INDISPONIVEL') toast.error('Esta agenda está concluída ou cancelada.');
      else toast.error('Erro ao realizar o agendamento.');
    }
  };

  const buscarPessoa = async (e) => {
    e.preventDefault();
    const clean = cleanDigits(buscaCpf);
    if (!clean) {
      toast.error('Informe o CPF para busca.');
      return;
    }

    setIsSearching(true);
    try {
      const pessoa = await findPessoaByCpf(clean);
      if (pessoa) {
        setSelCons(pessoa);
        setStep('services');
      } else {
        toast.error('Pessoa não encontrada no sistema. Cadastre-a no módulo de Pessoas primeiro.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao pesquisar pessoa.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className={`transition-all ${expanded ? 'ring-2 ring-amber-500 !bg-amber-50/20' : ''}`}>
      <div 
        className="flex items-center justify-between cursor-pointer" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            expanded ? 'bg-amber-500 text-white shadow-md' : 'bg-gray-100 text-amber-600'
          }`}>
            <CalendarDays size={22} />
          </div>
          <div className="min-w-0 pr-2">
            <h4 className="font-black text-gray-900 text-sm sm:text-base uppercase italic leading-tight truncate">
              {agenda.data?.toDate().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">
              {agenda.tipo}
            </p>
          </div>
        </div>
        <ChevronRight className={`text-gray-300 transition-transform shrink-0 ${expanded ? 'rotate-90 text-amber-500' : ''}`} />
      </div>

      {expanded && (
        <div className="mt-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] font-black uppercase text-gray-400 tracking-widest">
              {fila.length} Inscritos
            </span>
            {!isClosed && <Button
              onClick={() => {
                setModalWiz(true);
                setStep('search');
                setBuscaCpf('');
                setSelCons(null);
                setSelSrvs({});
              }} 
              variant="secondary" 
              className="py-1.5 px-3 text-xs h-auto rounded-lg"
            >
              <Plus size={14} /> Novo
            </Button>}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {['Agendado', 'Presente', 'Concluído', 'Faltou', 'Cancelado'].map(status => <div key={status} className="bg-white border border-gray-100 rounded-xl p-2 text-center">
              <strong className="block text-sm text-gray-900">{summary[status] || 0}</strong>
              <span className="text-[8px] font-black uppercase text-gray-400">{status}</span>
            </div>)}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-3 text-xs space-y-2">
            <p><strong>Tipo de Trabalho:</strong> {agenda.tipoTrabalhoNome || agenda.tipo}</p>
            <p><strong>Público:</strong> {getAgendaPublicosPermitidos(agenda).map(x => x === 'membro' ? 'Membros' : 'Consulentes').join(' + ') || 'Sem restrição'}</p>
            <div><strong>Serviços:</strong>{agendaServices.map(service => <div key={service.id} className="flex justify-between mt-1"><span>{service.nome} {servicoControlaVagas(service) ? `· ${agenda.vagasOcupadas?.[service.id] || 0} / ${agenda.vagasTotais?.[service.id] || 0} vagas` : ''} · {agenda.servicosStatus?.[service.id] || 'Ativo'}</span>{!isClosed && servicoAtivoNaAgenda(agenda, service.id) && <button onClick={() => setServiceToCancel(service)} className="text-rose-600 font-bold">Cancelar nesta data</button>}</div>)}</div>
          </div>

          <div className="space-y-2">
            {fila.length === 0 ? (
              <p className="text-center text-gray-400 py-3 text-xs italic">Nenhum inscrito nesta data ainda.</p>
            ) : (
              fila.map(c => (
                <div key={c.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{c.nome}</p>
                    <p className="text-[10px] text-amber-600 font-bold uppercase truncate">
                      {c.servicosNomes?.join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${getStatusColor(c.status)}`}>{c.status}</span>
                    {['Agendado', 'Presente'].includes(c.status) && !isClosed && <button onClick={() => setCancelTarget(c)} className="text-rose-500 hover:text-rose-700" title="Cancelar agendamento"><XCircle size={18} /></button>}
                    {profile?.role === 'admin' && agenda.status !== 'Cancelada' && correctionOptions(c.status).length > 0 && <button onClick={() => openCorrection(c)} className="text-xs font-bold text-amber-700 hover:text-amber-900" title="Correção administrativa auditada">Corrigir Status</button>}
                  </div>
                </div>
              ))
            )}
          </div>

          {!isClosed ? <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={startEdit}>Editar</Button><Button variant="secondary" onClick={() => setConfirmClose(true)}><LockKeyhole size={16}/> Concluir</Button><Button variant="danger" disabled={hasExecutedAppointment} onClick={() => setConfirmCancelAgenda(true)} title={hasExecutedAppointment ? 'Esta agenda possui atendimento iniciado ou concluído e não pode mais ser cancelada.' : 'Cancelar agenda'}>Cancelar Agenda</Button>{profile?.role === 'admin' && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Excluir Agenda</Button>}{hasExecutedAppointment && <p className="col-span-2 text-xs text-amber-700 font-bold text-center">Esta agenda possui atendimento iniciado ou concluído e não pode mais ser cancelada.</p>}</div> : <div className="text-center text-xs font-black uppercase text-emerald-700 bg-emerald-50 rounded-xl py-3"><LockKeyhole size={14} className="inline mr-1" /> Agenda {agenda.status.toLowerCase()} e protegida</div>}
        </div>
      )}

      <Modal 
        isOpen={modalWiz} 
        onClose={() => setModalWiz(false)} 
        title="Assistente de Marcação"
      >
        {step === 'search' ? (
          <form onSubmit={buscarPessoa} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                CPF do Consulente
              </label>
              <input 
                value={buscaCpf} 
                onChange={e => setBuscaCpf(maskCPF(e.target.value))} 
                placeholder="000.000.000-00" 
                maxLength={14}
                required
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm outline-none focus:border-amber-500 focus:bg-white transition-all" 
              />
            </div>
            <Button 
              type="submit" 
              variant="warning" 
              disabled={isSearching}
              className="w-full py-4"
            >
              <Search size={18} /> {isSearching ? 'Procurando...' : 'Procurar Pessoa'}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-3">
              <UserCheck className="text-amber-600 shrink-0" size={22} />
              <div>
                <p className="font-bold text-amber-950 text-sm">{selCons?.nome}</p>
                <p className="text-[10px] text-amber-700 font-medium">CPF: {maskCPF(selCons?.cpf)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-1">
                Selecione os Serviços
              </p>
              {agendaServices.filter(s => servicoAtivoNaAgenda(agenda, s.id)).map(s => (
                <label 
                  key={s.id} 
                  className={`flex items-center gap-3 p-3 bg-white border rounded-xl cursor-pointer transition-colors ${
                    selSrvs[s.id] ? 'border-amber-400 bg-amber-50/50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    checked={selSrvs[s.id] || false} 
                    onChange={() => setSelSrvs({ ...selSrvs, [s.id]: !selSrvs[s.id] })} 
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500" 
                  />
                  <span className="text-sm font-bold text-gray-700">{s.nome}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('search')}>
                Voltar
              </Button>
              <Button onClick={confirmAgendamento} variant="warning">
                <CheckCircle2 size={18} /> Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={editing} onClose={() => setEditing(false)} title="Editar Agenda">
        {editDraft && <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><input type="date" value={editDraft.data} onChange={e => setEditDraft({ ...editDraft, data: e.target.value })} className="bg-gray-50 p-3 rounded-xl"/><input type="time" value={editDraft.horario} onChange={e => setEditDraft({ ...editDraft, horario: e.target.value })} className="bg-gray-50 p-3 rounded-xl"/></div><select value={editDraft.tipoTrabalhoId} onChange={e => setEditDraft({ ...editDraft, tipoTrabalhoId: e.target.value })} className="w-full bg-gray-50 p-3 rounded-xl"><option value="">Legado: {agenda.tipo}</option>{trabalhos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select><div>{['consulente', 'membro'].map(id => <label key={id} className="mr-4 text-sm font-bold"><input type="checkbox" checked={editDraft.publicosPermitidos.includes(id)} onChange={() => setEditDraft({ ...editDraft, publicosPermitidos: editDraft.publicosPermitidos.includes(id) ? editDraft.publicosPermitidos.filter(x => x !== id) : [...editDraft.publicosPermitidos, id] })}/> {id}</label>)}</div>{servicosCatalogo.filter(s => !editDraft.tipoTrabalhoId || !s.tipoTrabalhoIds?.length || s.tipoTrabalhoIds.includes(editDraft.tipoTrabalhoId)).map(s => <div key={s.id} className="bg-gray-50 p-3 rounded-xl"><label className="text-sm font-bold"><input type="checkbox" checked={editDraft.servicosIds.includes(s.id)} onChange={() => setEditDraft({ ...editDraft, servicosIds: editDraft.servicosIds.includes(s.id) ? editDraft.servicosIds.filter(x => x !== s.id) : [...editDraft.servicosIds, s.id] })}/> {s.nome}</label>{editDraft.servicosIds.includes(s.id) && servicoControlaVagas(s) && <input type="number" min={agenda.vagasOcupadas?.[s.id] || 0} value={editDraft.vagasTotais[s.id] || ''} onChange={e => setEditDraft({ ...editDraft, vagasTotais: { ...editDraft.vagasTotais, [s.id]: Number(e.target.value) } })} className="w-full bg-white p-2 mt-2 rounded-lg"/>}</div>)}<Button onClick={saveEdit} variant="warning" className="w-full">Salvar Alterações</Button></div>}
      </Modal>

      <ConfirmDialog isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} title="Cancelar Agendamento" message={`Cancelar o agendamento de "${cancelTarget?.nome}"? A vaga será devolvida automaticamente.`} confirmText="Sim, Cancelar" />
      <ConfirmDialog isOpen={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={handleClose} title="Concluir Agenda" message={`Concluir esta agenda? Existem ${(summary.Agendado || 0) + (summary.Presente || 0)} atendimentos ainda abertos. Após concluir, nenhuma alteração será permitida.`} confirmText="Sim, Concluir" />
      <ConfirmDialog isOpen={!!serviceToCancel} onClose={() => setServiceToCancel(null)} onConfirm={handleCancelService} title="Cancelar Serviço" message={`Cancelar "${serviceToCancel?.nome}" nesta data? Atendimentos serão preservados para futura realocação.`} confirmText="Cancelar Serviço" />
      <ConfirmDialog isOpen={confirmCancelAgenda} onClose={() => setConfirmCancelAgenda(false)} onConfirm={handleCancelAgenda} title="Cancelar Agenda" message="A agenda ficará no histórico e não aceitará novas operações." confirmText="Cancelar Agenda" />
      <ConfirmDialog isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={handleDelete} title="Excluir Agenda" message="Esta agenda somente será excluída definitivamente se não possuir nenhum atendimento vinculado." confirmText="Excluir Definitivamente" />
      <Modal isOpen={!!correctionTarget} onClose={() => setCorrectionTarget(null)} title="Corrigir Status">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">Esta é uma correção administrativa e ficará registrada na auditoria.</div>
          <p className="text-sm"><strong>Pessoa:</strong> {correctionTarget?.nome}</p>
          <p className="text-sm"><strong>Status atual:</strong> {correctionTarget?.status}</p>
          <label className="block text-sm font-bold">Novo status<select value={correctionStatus} onChange={event => setCorrectionStatus(event.target.value)} className="mt-1 w-full bg-gray-50 p-3 rounded-xl">{correctionOptions(correctionTarget?.status).map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="block text-sm font-bold">Motivo<textarea value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} placeholder="Ex.: Marcado como concluído por engano." className="mt-1 w-full bg-gray-50 p-3 rounded-xl min-h-24" /></label>
          <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setCorrectionTarget(null)}>Cancelar</Button><Button variant="warning" onClick={handleCorrection}>Confirmar Correção</Button></div>
        </div>
      </Modal>
    </Card>
  );
};
