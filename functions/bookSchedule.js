export const getBookCompetence = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(value);
  return `${parts.find(item => item.type === 'year')?.value}-${parts.find(item => item.type === 'month')?.value}`;
};

export const isPreviousOpenBookVolume = (volume, currentCompetence) => volume?.status === 'aberto'
  && /^\d{4}-\d{2}$/.test(String(volume.competencia || ''))
  && volume.competencia < currentCompetence;
