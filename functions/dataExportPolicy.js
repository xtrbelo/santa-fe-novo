const modules = new Set(['pessoas', 'agendamentos', 'auditoria']);

export const validateDataExportRequest = data => {
  const module = String(data?.module || '').trim(); const rowCount = Number(data?.rowCount); const filters = String(data?.filters || '').trim().slice(0, 500);
  if (!modules.has(module) || !Number.isInteger(rowCount) || rowCount < 1 || rowCount > 100000) throw new Error('EXPORTACAO_INVALIDA');
  return { module, rowCount, filters };
};
