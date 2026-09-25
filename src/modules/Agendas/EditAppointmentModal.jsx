import React, { useEffect, useMemo, useState } from 'react';
import { getAppDoc, getDoc } from '../../services/firebase';
import { updateAppointmentOnServer } from '../../services/firebaseFunctions';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getPessoaVinculo, servicoAtivoNaAgenda } from '../../utils/domain';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';

const agendaLabel = agenda => `${agenda.data?.toDate?.().toLocaleDateString('pt-BR') || 'Data indisponível'} · ${agenda.horario || '--:--'} · ${agenda.tipoTrabalhoNome || agenda.tipo}`;

export const EditAppointmentModal = ({ appointment, originAgenda, agendas, services, onClose }) => {
  const [person, setPerson] = useState(null); const [agendaId, setAgendaId] = useState(''); const [serviceIds, setServiceIds] = useState([]);
  const [observation, setObservation] = useState(''); const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const toast = useToast();
  useEffect(() => {
    if (!appointment) return undefined;
    let active = true; setAgendaId(originAgenda.id); setServiceIds(appointment.servicosIds || []); setObservation(appointment.observacao || ''); setReason('');
    getDoc(getAppDoc('pessoas', appointment.pessoaBaseId)).then(snapshot => { if (active) setPerson(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : { id: appointment.pessoaBaseId, nome: appointment.nome, cpf: appointment.cpf, vinculo: 'consulente' }); });
    return () => { active = false; };
  }, [appointment, originAgenda]);
  const options = useMemo(() => (agendas || []).filter(item => item.ativo !== false && !['Concluída', 'Cancelada'].includes(item.status) && item.data?.toDate?.().getTime() >= new Date().setHours(0, 0, 0, 0)), [agendas]);
  const selectedAgenda = options.find(item => item.id === agendaId) || originAgenda;
  const availableServices = services.filter(item => item.ativo !== false && agendaAceitaServico(selectedAgenda, item.id) && servicoAtivoNaAgenda(selectedAgenda, item.id));
  const selectAgenda = value => { setAgendaId(value); const target = options.find(item => item.id === value); setServiceIds(current => current.filter(id => agendaAceitaServico(target, id) && servicoAtivoNaAgenda(target, id))); };
  const save = async () => {
    if (!person || !agendaId || !serviceIds.length || reason.trim().length < 3) { toast.error('Informe pessoa, agenda, serviços e motivo da alteração.'); return; }
    const allowed = getAgendaPublicosPermitidos(selectedAgenda);
    if (allowed.length && !allowed.includes(getPessoaVinculo(person))) { toast.error('O vínculo da pessoa não é permitido na agenda escolhida.'); return; }
    setSaving(true);
    try { await updateAppointmentOnServer({ appointmentId: appointment.id, destinationAgendaId: agendaId, personId: person.id, serviceIds, observation, reason }); toast.success('Agendamento atualizado e registrado na Auditoria.'); onClose(); }
    catch (error) { console.error(error); const message = error?.message || ''; if (message.includes('AGENDAMENTO_JA_INICIADO')) toast.error('O atendimento já começou e não pode ser editado.'); else if (message.includes('DESTINO_POSSUI_ATENDIMENTO')) toast.error('A pessoa já possui atendimento na agenda escolhida.'); else if (message.includes('CPF_OBRIGATORIO_EVENTO')) toast.error('A agenda escolhida exige CPF.'); else if (message.includes('SEM_VAGA')) toast.error('Um dos serviços escolhidos está sem vaga.'); else toast.error('Não foi possível atualizar o agendamento.'); }
    finally { setSaving(false); }
  };
  if (!appointment) return null;
  return <Modal isOpen onClose={() => !saving && onClose()} title="Editar agendamento"><div className="space-y-4"><div><p className="mb-2 text-xs font-black uppercase text-gray-500">Pessoa</p><PessoaSearchSelector value={person} onChange={setPerson} allowedVinculos={getAgendaPublicosPermitidos(selectedAgenda)} accent="indigo"/></div><label className="block text-xs font-black uppercase text-gray-500">Agenda<select value={agendaId} onChange={event => selectAgenda(event.target.value)} className="mt-1 w-full rounded-xl bg-gray-50 p-3 text-sm">{options.map(item => <option key={item.id} value={item.id}>{agendaLabel(item)}</option>)}</select></label><div><p className="mb-2 text-xs font-black uppercase text-gray-500">Serviços</p><div className="space-y-2">{availableServices.map(service => <label key={service.id} className="block rounded-xl border border-gray-100 p-3 text-sm font-bold"><input type="checkbox" checked={serviceIds.includes(service.id)} onChange={() => setServiceIds(current => current.includes(service.id) ? current.filter(id => id !== service.id) : [...current, service.id])}/> {service.nome}</label>)}</div></div><label className="block text-xs font-black uppercase text-gray-500">Observação — até 500 caracteres<textarea value={observation} maxLength={500} onChange={event => setObservation(event.target.value)} className="mt-1 min-h-24 w-full rounded-xl bg-gray-50 p-3 text-sm"/><span className="block text-right text-[10px] text-gray-400">{observation.length}/500</span></label><label className="block text-xs font-black uppercase text-gray-500">Motivo da alteração *<textarea value={reason} maxLength={500} onChange={event => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl bg-amber-50 p-3 text-sm"/></label><div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="warning" disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar alterações'}</Button></div></div></Modal>;
};
