const csvCell = value => {
  const text = value === undefined || value === null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

const dateText = value => value?.toDate?.().toLocaleString('pt-BR') || '';

export const buildCsv = (columns, rows) => `\uFEFF${[
  columns.map(column => column.label),
  ...rows.map(row => columns.map(column => column.value(row))),
].map(row => row.map(csvCell).join(';')).join('\r\n')}`;

export const downloadCsv = (filename, content) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportFilteredCsv = ({ filename, columns, rows }) => {
  if (!rows.length) return false;
  downloadCsv(filename, buildCsv(columns, rows));
  return true;
};

export const PEOPLE_EXPORT_COLUMNS = [
  { label: 'Nome', value: item => item.nome },
  { label: 'CPF', value: item => item.cpf },
  { label: 'E-mail', value: item => item.email },
  { label: 'Contato', value: item => item.contato },
  { label: 'Vínculo', value: item => item.vinculo || item.tipoPessoa },
  { label: 'Funções na Casa', value: item => (item.funcoesCasa || []).join(', ') },
  { label: 'Situação', value: item => item.ativo === false ? 'Inativo' : 'Ativo' },
];

export const APPOINTMENT_EXPORT_COLUMNS = [
  { label: 'Pessoa', value: item => item.nome || item.pessoaNome },
  { label: 'Data', value: item => item.exportAgenda?.data?.toDate?.().toLocaleDateString('pt-BR') || '' },
  { label: 'Horário', value: item => item.exportAgenda?.horario },
  { label: 'Trabalho', value: item => item.exportAgenda?.tipoTrabalhoNome || item.exportAgenda?.tipo },
  { label: 'Serviços', value: item => item.exportServices },
  { label: 'Situação', value: item => item.status },
  { label: 'Observação', value: item => item.observacao },
];

export const REGISTRATION_EXPORT_COLUMNS = [
  { label: 'Nome', value: item => item.nome },
  { label: 'Tipo', value: item => item.tipoCadastro === 'consulente' ? 'Consulente' : 'Membro' },
  { label: 'CPF', value: item => item.cpf },
  { label: 'E-mail', value: item => item.email },
  { label: 'Contato', value: item => item.contato },
  { label: 'Situação', value: item => item.statusCadastro },
  { label: 'Data de envio', value: item => dateText(item.enviadoEm) },
];

export const COMMUNICATION_EXPORT_COLUMNS = [
  { label: 'Pessoa', value: item => item.exportPerson?.nome || item.nome },
  { label: 'Destinatário', value: item => item.destinatario },
  { label: 'Tipo', value: item => item.exportTypeLabel },
  { label: 'Situação', value: item => item.exportStatusLabel },
  { label: 'Data', value: item => dateText(item.criadoEm) },
];
