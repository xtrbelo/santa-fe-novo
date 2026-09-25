import { createHash } from 'node:crypto';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {});
  return value;
};

export const buildBookVolumeHash = ({ numero, records }) => createHash('sha256').update(JSON.stringify(stable({
  numero,
  registros: [...records].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(record => ({
    id: record.id,
    agendaId: record.agendaId,
    dataAtendimento: record.dataAtendimento,
    dirigenteResponsavel: record.dirigenteResponsavel,
    trabalhadores: record.trabalhadores,
    quantidadeAtendimentos: record.quantidadeAtendimentos,
    atendimentos: record.atendimentos,
  })),
}))).digest('hex');

export const verifyBookVolumeHash = ({ numero, records, expectedHash }) => {
  const calculatedHash = buildBookVolumeHash({ numero, records });
  return { intact: Boolean(expectedHash) && calculatedHash === expectedHash, calculatedHash };
};
