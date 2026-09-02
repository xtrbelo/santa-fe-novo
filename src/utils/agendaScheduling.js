import { agendaAceitaServico, getAgendaPublicosPermitidos, getPessoaVinculo, servicoAtivoNaAgenda, servicoControlaVagas } from './domain.js';

const agendaDate = agenda => agenda?.data?.toDate?.() || (agenda?.data instanceof Date ? agenda.data : new Date(agenda?.data));
const normalizeStatus = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isoDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
};
const toIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const generateWeeklyRecurrence = ({ weekday, startDate, endDate, today = new Date() }) => {
  const start = isoDate(startDate); const end = isoDate(endDate); const selectedWeekday = Number(weekday);
  if (!start || !end || !Number.isInteger(selectedWeekday) || selectedWeekday < 0 || selectedWeekday > 6) throw new Error('RECORRENCIA_INVALIDA');
  if (end < start) throw new Error('DATA_FINAL_ANTERIOR');
  const first = new Date(start); first.setDate(first.getDate() + ((selectedWeekday - first.getDay() + 7) % 7));
  if (first > end) throw new Error('RECORRENCIA_SEM_OCORRENCIA');
  const dates = []; for (const current = new Date(first); current <= end; current.setDate(current.getDate() + 7)) dates.push(toIsoDate(current));
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  if (dates.some(date => isoDate(date) < todayStart)) throw new Error('PROGRAMACAO_DATA_PASSADA');
  return dates;
};

export const isAgendaFuture = (agenda, now = new Date()) => {
  const date = agendaDate(agenda);
  return !Number.isNaN(date?.getTime?.()) && date.getTime() >= now.getTime();
};

export const isAgendaAvailableForService = (agenda, service, now = new Date()) => {
  if (!agenda || !service || service.ativo === false || agenda.ativo === false) return false;
  if (['concluida', 'cancelada'].includes(normalizeStatus(agenda.status))) return false;
  if (!isAgendaFuture(agenda, now) || !agendaAceitaServico(agenda, service.id) || !servicoAtivoNaAgenda(agenda, service.id)) return false;
  if (!servicoControlaVagas(service)) return true;
  return Number(agenda.vagasOcupadas?.[service.id] || 0) < Number(agenda.vagasTotais?.[service.id] || 0);
};

export const getAvailableAgendas = ({ agendas, service, pessoa = null, now = new Date() }) => (agendas || [])
  .filter(agenda => isAgendaAvailableForService(agenda, service, now))
  .filter(agenda => {
    if (!pessoa || pessoa.ativo === false) return !pessoa;
    const allowed = getAgendaPublicosPermitidos(agenda);
    return !allowed.length || allowed.includes(getPessoaVinculo(pessoa));
  })
  .sort((a, b) => agendaDate(a) - agendaDate(b));

export const getRemainingVacancies = (agenda, service) => servicoControlaVagas(service)
  ? Math.max(0, Number(agenda.vagasTotais?.[service.id] || 0) - Number(agenda.vagasOcupadas?.[service.id] || 0))
  : null;

export const selectQuickRegisteredPerson = (wizard, pessoa) => ({ ...wizard, pessoa, agenda: null });

export const getAgendaSchedulingKey = ({ tipoTrabalhoId, date, horario, servicosIds, publicosPermitidos }) => [
  tipoTrabalhoId,
  date,
  horario,
  [...servicosIds].sort().join('-'),
  [...publicosPermitidos].sort().join('-'),
].map(value => String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '-')).join('__');

export const filterAppointments = (appointments, agendasById, filter, now = new Date()) => {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return (appointments || []).filter(item => {
    const status = normalizeStatus(item.status);
    const date = agendaDate(agendasById[item.agendaId]);
    if (filter === 'todos') return true;
    if (filter === 'cancelados') return status === 'cancelado';
    if (filter === 'realizados') return ['concluido', 'faltou'].includes(status);
    if (!date || Number.isNaN(date.getTime())) return false;
    if (filter === 'hoje') return date >= start && date < end;
    return date >= now && !['cancelado', 'concluido', 'faltou', 'reagendado'].includes(status);
  });
};
