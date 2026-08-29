import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot, 
  Timestamp, 
  createAgendamento,
  cancelAgendamento,
  setAgendamentoPrioridade,
  updateAtendimentoStatus,
  query,
  where
} from '../../services/firebase';
import { 
  maskCPF, 
  sortQueue, 
  getStatusColor 
} from '../../utils/formatters';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getNomeServicoAtendimento, getPessoaVinculo, getServicosAtivosAtendimento, isAtendimentoFluxoDia, servicoAtivoNaAgenda } from '../../utils/domain';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { PessoaFormModal } from '../../components/pessoas/PessoaFormModal';
import { 
  BookOpenCheck, 
  Plus, 
  UserCheck, 
  CheckCircle2,
  Star,
  XCircle,
  UserX
} from 'lucide-react';

export const AtendimentoDiaCard = ({ agenda, user, profile, servicosCatalogo }) => {
  const [fila, setFila] = useState([]);
  const [modalWiz, setModalWiz] = useState(false);
  const [selCons, setSelCons] = useState(null);
  const [newPersonName, setNewPersonName] = useState(null);
  const [selSrvs, setSelSrvs] = useState({});
  const [step, setStep] = useState('search');
  const [cancelTarget, setCancelTarget] = useState(null);

  const toast = useToast();
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

  const updateSt = async (id, st) => {
    try {
      await updateAtendimentoStatus({ agendaId: agenda.id, agendamentoId: id, status: st, userId: user.uid });
      toast.success(`Status alterado para ${st}`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status.');
    }
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
              Atendimentos de Hoje
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
          <Plus size={14} /> Marcação Rápida
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
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg shadow-sm ${getStatusColor(c.status)}`}>{c.status}</span>
              </div>

              {['Agendado', 'Presente'].includes(c.status) && <div className="flex flex-wrap gap-2 mt-3">
                <Button onClick={() => togglePriority(c)} variant="secondary" className={`px-3 h-10 ${c.prioridade ? 'text-amber-600 bg-amber-50' : ''}`} title="Alternar prioridade">
                  <Star size={16} fill={c.prioridade ? 'currentColor' : 'none'} /> Prioridade
                </Button>
                <Button onClick={() => setCancelTarget(c)} variant="danger" className="px-3 h-10"><XCircle size={16} /> Cancelar</Button>
                {c.status === 'Agendado' && <>
                  <Button onClick={() => updateSt(c.id, 'Faltou')} variant="secondary" className="px-3 h-10"><UserX size={16} /> Faltou</Button>
                  <Button onClick={() => updateSt(c.id, 'Presente')} className="flex-1 min-w-48 h-10 bg-blue-600 hover:bg-blue-700 text-white"><UserCheck size={16} /> Dar Entrada</Button>
                </>}
                {c.status === 'Presente' && <Button onClick={() => updateSt(c.id, 'Concluído')} variant="success" className="flex-1 min-w-48 h-10"><CheckCircle2 size={16} /> Finalizar Atendimento</Button>}
              </div>}
            </div>
          ))
        )}
      </div>

      <Modal 
        isOpen={modalWiz} 
        onClose={() => setModalWiz(false)} 
        title="Marcação Rápida de Atendimento"
      >
        {step === 'search' ? (
          <PessoaSearchSelector value={selCons} onChange={setSelCons} onContinue={() => setStep('services')} onCreateNew={setNewPersonName} accent="emerald" />
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
      <PessoaFormModal key={newPersonName || 'closed'} isOpen={newPersonName !== null} initialName={newPersonName || ''} user={user} allowedVinculos={profile?.role === 'atendimento' ? ['consulente'] : ['consulente', 'membro']} onClose={() => setNewPersonName(null)} onSaved={pessoa => { setSelCons(pessoa); setStep('services'); }} />

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
