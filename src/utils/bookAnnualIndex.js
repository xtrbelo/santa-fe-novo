export const buildBookAnnualIndex = ({ year, volumes = [], records = [] }) => {
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0'); const competence = `${year}-${month}`;
    const volume = volumes.find(item => String(item.competencia || '').slice(0, 7) === competence);
    const volumeRecords = volume ? records.filter(record => record.volumeId === volume.id) : [];
    return {
      month, competence, volume,
      status: !volume ? 'sem_movimento' : volume.status,
      days: volumeRecords.length || Number(volume?.quantidadeRegistros || 0),
      attendances: Number(volume?.quantidadeAtendimentos || 0),
      verificationCode: volume?.codigoVerificacao || '',
    };
  });
  const existing = months.filter(item => item.volume);
  return {
    year: String(year), months,
    totalDays: months.reduce((sum, item) => sum + item.days, 0),
    totalAttendances: months.reduce((sum, item) => sum + item.attendances, 0),
    definitiveReady: existing.length > 0 && existing.every(item => item.status === 'arquivado'),
    pendingCount: existing.filter(item => item.status !== 'arquivado').length,
  };
};
