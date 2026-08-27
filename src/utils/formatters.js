/**
 * Funções utilitárias de formatação, máscaras e regras de negócio
 */

export const calcularIdade = (dataNascStr) => {
  if (!dataNascStr) return null;
  const hoje = new Date();
  const nasc = new Date(dataNascStr);
  if (isNaN(nasc.getTime())) return null;
  
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
};

export const isMenor = (dataNascStr) => {
  const idade = calcularIdade(dataNascStr);
  return idade !== null && idade < 18;
};

export const maskCPF = (v) => {
  if (!v) return '';
  return v
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const maskPhone = (v) => {
  if (!v) return '';
  const clean = v.replace(/\D/g, '');
  return clean.length <= 10 
    ? clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
    : clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};

export const cleanDigits = (v) => (v ? v.replace(/\D/g, '') : '');

export const validateCPF = (cpf) => {
  const digits = cleanDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calculateDigit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
};

export const sortQueue = (a, b) => {
  const order = { 'Presente': 1, 'Agendado': 2, 'Aguardando': 2, 'Concluído': 3, 'Faltou': 4, 'Cancelado': 4 };
  if ((order[a.status] || 5) !== (order[b.status] || 5)) return (order[a.status] || 5) - (order[b.status] || 5);
  if (a.status === 'Presente') {
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    return (a.horaChegada?.toMillis() || 0) - (b.horaChegada?.toMillis() || 0);
  }
  return (a.criadoEm?.toMillis() || 0) - (b.criadoEm?.toMillis() || 0);
};

export const getStatusColor = (s) => {
  if (s === 'Agendado' || s === 'Aguardando') return 'bg-amber-100 text-amber-700';
  if (s === 'Presente') return 'bg-blue-100 text-blue-700';
  if (s === 'Concluído') return 'bg-emerald-100 text-emerald-700';
  if (s === 'Faltou') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};
