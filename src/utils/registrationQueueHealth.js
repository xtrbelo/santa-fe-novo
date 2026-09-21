const present = value => String(value ?? '').trim().length > 0;

export const getRegistrationRequestIssues = (request, cpfIndexIds = new Set()) => {
  if (request?.statusCadastro !== 'aguardando_validacao') return { missing: [], duplicateCpf: false, needsAttention: false };
  const missing = [];
  if (!present(request.nome)) missing.push('Nome');
  if (!present(request.cpf)) missing.push('CPF');
  if (!present(request.contato)) missing.push('Contato');
  if (request.tipoCadastro !== 'consulente') {
    if (!present(request.email)) missing.push('E-mail');
    if (!present(request.dataNascimento)) missing.push('Data de nascimento');
    if (!present(request.endereco?.cidade)) missing.push('Cidade');
    if (!present(request.endereco?.uf)) missing.push('UF');
  }
  const normalizedCpf = String(request.cpf || '').replace(/\D/g, '');
  const duplicateCpf = Boolean(normalizedCpf && cpfIndexIds.has(normalizedCpf));
  return { missing, duplicateCpf, needsAttention: missing.length > 0 || duplicateCpf };
};

export const summarizeRegistrationQueue = (requests, cpfIndexIds = new Set()) => requests.reduce((summary, request) => {
  if (request.statusCadastro === 'aprovado') summary.approved += 1;
  if (request.statusCadastro === 'rejeitado') summary.rejected += 1;
  if (request.statusCadastro === 'aguardando_validacao') {
    summary.pending += 1;
    const issues = getRegistrationRequestIssues(request, cpfIndexIds);
    if (issues.missing.length) summary.incomplete += 1;
    if (issues.duplicateCpf) summary.duplicate += 1;
  }
  return summary;
}, { pending: 0, incomplete: 0, duplicate: 0, approved: 0, rejected: 0 });
