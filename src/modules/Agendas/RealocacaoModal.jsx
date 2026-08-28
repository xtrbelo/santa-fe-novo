import React, { useEffect, useMemo, useState } from 'react';
import { getAppDoc, getDoc, realocarAtendimento } from '../../services/firebase';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getPessoaVinculo, getServicosAtivosAtendimento, servicoAtivoNaAgenda, servicoControlaVagas } from '../../utils/domain';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';

const formatAgenda = agenda => `${agenda?.data?.toDate?.().toLocaleDateString('pt-BR') || 'Data indisponível'} · ${agenda?.horario || '--:--'}`;

const errorMessages = {
  STATUS_NAO_REALOCAVEL: 'Somente atendimentos ainda agendados podem ser realocados.',
  MOTIVO_OBRIGATORIO: 'Informe o motivo da realocação.',
  DESTINO_POSSUI_ATENDIMENTO: 'Esta pessoa já possui um atendimento na agenda de destino.',
  AGENDA_DESTINO_INDISPONIVEL: 'A agenda de destino não está disponível.',
  PUBLICO_NAO_PERMITIDO: 'O vínculo desta pessoa não é permitido na agenda de destino.',
  SERVICO_NAO_DISPONIVEL: 'A agenda de destino não oferece todos os serviços selecionados.',
  SERVICO_CANCELADO: 'Um dos serviços está cancelado na agenda de destino.',
  SERVICO_JA_REALOCADO: 'Um dos serviços selecionados já foi realocado.',
  PERMISSAO_NEGADA: 'Somente administradores e gestores podem realocar atendimentos.'
};

export const RealocacaoModal = ({ atendimento, origemAgenda, agendas, servicosCatalogo, user, profile, initialServiceId, onClose }) => {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(initialServiceId ? 'parcial' : 'completa');
  const [selectedIds, setSelectedIds] = useState(initialServiceId ? [initialServiceId] : []);
  const [destinationId, setDestinationId] = useState('');
  const [reason, setReason] = useState('');
  const [person, setPerson] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const activeIds = useMemo(() => getServicosAtivosAtendimento(atendimento), [atendimento]);

  useEffect(() => {
    if (!atendimento) return;
    let active = true;
    setStep(1); setMode(initialServiceId ? 'parcial' : 'completa');
    setSelectedIds(initialServiceId ? [initialServiceId] : activeIds); setDestinationId(''); setReason('');
    getDoc(getAppDoc('pessoas', atendimento.pessoaBaseId)).then(snapshot => {
      if (active) setPerson(snapshot.exists() ? snapshot.data() : atendimento);
    });
    return () => { active = false; };
  }, [atendimento, initialServiceId, activeIds]);

  if (!atendimento) return null;

  const handleClose = () => {
    setStep(1);
    setMode(initialServiceId ? 'parcial' : 'completa');
    setSelectedIds([]);
    setDestinationId('');
    setReason('');
    setPerson(null);
    setSaving(false);
    onClose();
  };

  const services = activeIds.map(id => servicosCatalogo.find(item => item.id === id) || { id, nome: atendimento?.servicosNomes?.[(atendimento?.servicosIds || []).indexOf(id)] || id });
  const selected = mode === 'completa' ? activeIds : selectedIds;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const options = (agendas || []).filter(agenda => {
    if (agenda.id === origemAgenda?.id || ['Concluída', 'Cancelada'].includes(agenda.status) || agenda.data?.toDate?.() < today) return false;
    if (selected.some(id => !agendaAceitaServico(agenda, id))) return false;
    const publics = getAgendaPublicosPermitidos(agenda);
    return !publics.length || publics.includes(getPessoaVinculo(person));
  }).map(agenda => ({
    ...agenda,
    unavailable: selected.some(id => !servicoAtivoNaAgenda(agenda, id)
      || (servicoControlaVagas(servicosCatalogo.find(item => item.id === id)) && Number(agenda.vagasOcupadas?.[id] || 0) >= Number(agenda.vagasTotais?.[id] || 0)))
  }));
  const destination = options.find(item => item.id === destinationId);

  const next = () => {
    if (step === 1 && !selected.length) { toast.error('Selecione ao menos um serviço.'); return; }
    if (step === 2 && (!destination || destination.unavailable)) { toast.error('Selecione uma agenda de destino disponível.'); return; }
    if (step === 3 && !reason.trim()) { toast.error('Informe o motivo da realocação.'); return; }
    setStep(current => current + 1);
  };
  const confirm = async () => {
    setSaving(true);
    try {
      await realocarAtendimento({
        origemAgendaId: origemAgenda.id, origemAgendamentoId: atendimento.id,
        destinoAgendaId: destinationId, servicosIds: selected, motivo: reason,
        userId: user.uid, role: profile.role
      });
      toast.success(mode === 'completa' ? 'Atendimento reagendado com sucesso.' : 'Serviço(s) realocado(s) com sucesso.');
      handleClose();
    } catch (error) {
      console.error(error);
      const key = error.message?.split(':')[0];
      if (key === 'PESSOA_SEM_NOME') toast.error('Não foi possível identificar o nome da pessoa para o novo atendimento.');
      else toast.error(errorMessages[key] || (key === 'SEM_VAGA' ? 'Não há vagas disponíveis no destino.' : 'Não foi possível concluir a realocação.'));
    } finally { setSaving(false); }
  };

  return <Modal isOpen onClose={handleClose} title={`Reagendar / Realocar Atendimento · ${step}/4`}>
    <div className="space-y-4">
      {step === 1 && <>
        <p className="text-sm font-bold">O que deseja fazer?</p>
        <label className="block bg-gray-50 p-3 rounded-xl"><input type="radio" checked={mode === 'completa'} onChange={() => { setMode('completa'); setSelectedIds(activeIds); }} /> Reagendar atendimento completo</label>
        <label className="block bg-gray-50 p-3 rounded-xl"><input type="radio" checked={mode === 'parcial'} onChange={() => setMode('parcial')} /> Realocar apenas serviço(s)</label>
        <div className="space-y-2">{services.map(service => <label key={service.id} className="block border rounded-xl p-3 text-sm font-bold"><input type="checkbox" disabled={mode === 'completa' || initialServiceId === service.id} checked={selected.includes(service.id)} onChange={() => setSelectedIds(current => current.includes(service.id) ? current.filter(id => id !== service.id) : [...current, service.id])} /> {service.nome}</label>)}</div>
      </>}
      {step === 2 && <div className="space-y-2"><p className="text-sm font-bold">Selecione a nova agenda</p>{options.length === 0 && <p className="text-sm text-gray-500">Nenhuma agenda compatível encontrada.</p>}{options.map(option => <button type="button" key={option.id} disabled={option.unavailable} onClick={() => setDestinationId(option.id)} className={`w-full text-left border rounded-xl p-3 ${destinationId === option.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} ${option.unavailable ? 'opacity-50' : ''}`}><strong className="block">{formatAgenda(option)}</strong><span className="text-xs text-gray-500">{option.tipoTrabalhoNome || option.tipo} · {option.unavailable ? 'Sem vagas ou serviço cancelado' : 'Disponível'}</span></button>)}</div>}
      {step === 3 && <label className="block text-sm font-bold">Motivo da realocação<textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full min-h-28 bg-gray-50 rounded-xl p-3" placeholder="Descreva por que o atendimento será realocado." /></label>}
      {step === 4 && <div className="space-y-2 text-sm"><p><strong>Pessoa:</strong> {atendimento.nome}</p><p><strong>Origem:</strong> {formatAgenda(origemAgenda)}</p><p><strong>Destino:</strong> {formatAgenda(destination)}</p><p><strong>Serviços:</strong> {services.filter(item => selected.includes(item.id)).map(item => item.nome).join(', ')}</p><p><strong>Tipo:</strong> {mode === 'completa' ? 'Reagendamento completo' : 'Realocação parcial'}</p><p><strong>Motivo:</strong> {reason}</p><p className="bg-amber-50 text-amber-900 p-3 rounded-xl">Esta operação preservará o registro original e criará um novo agendamento no destino.</p></div>}
      <div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => step === 1 ? handleClose() : setStep(current => current - 1)}>Voltar</Button>{step < 4 ? <Button onClick={next}>Continuar</Button> : <Button onClick={confirm} disabled={saving}>{saving ? 'Realocando...' : 'Confirmar Realocação'}</Button>}</div>
    </div>
  </Modal>;
};
