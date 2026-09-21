const count = value => Array.isArray(value) ? value.length : Number(value || 0);

export const buildSystemHealthSummary = ({ access, memberEmail, cpf, vacancies }) => {
  const categories = [
    { id: 'health-access', label: 'Acessos e vínculos', detailAvailable: true, critical: count(access?.emailConflicts), warning: count(access?.issues) + count(access?.orphanIndexes), analyzed: Number(access?.analyzed || 0) },
    { id: 'health-member-email', label: 'E-mails de Membros', detailAvailable: true, critical: count(memberEmail?.conflicts) + count(memberEmail?.indexConflicts) + count(memberEmail?.invalid), warning: count(memberEmail?.missing) + count(memberEmail?.orphanIndexes), analyzed: Number(memberEmail?.analyzed || 0) },
    { id: 'health-cpf', label: 'Índices de CPF', detailAvailable: false, critical: count(cpf?.conflicts) + Number(cpf?.invalid || 0), warning: count(cpf?.missing), analyzed: Number(cpf?.analyzed || 0) },
    { id: 'health-vacancies', label: 'Contadores de vagas', detailAvailable: false, critical: 0, warning: count(vacancies?.divergences), analyzed: Number(vacancies?.analyzed || 0) },
  ];
  const critical = categories.reduce((total, item) => total + item.critical, 0);
  const warning = categories.reduce((total, item) => total + item.warning, 0);
  return { categories, critical, warning, healthy: critical === 0 && warning === 0 };
};
