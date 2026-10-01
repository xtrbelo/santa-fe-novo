const LOWERCASE_PARTICLES = new Set(['a', 'as', 'ao', 'aos', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos', 'para', 'por']);

const capitalizeWord = word => word.replace(/(^|[-'])\p{L}/gu, value => value.toUpperCase());

export const normalizeDisplayText = value => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.toLocaleLowerCase('pt-BR').split(' ').map((word, index) => {
    if (index > 0 && word.length > 1 && LOWERCASE_PARTICLES.has(word)) return word;
    return capitalizeWord(word);
  }).join(' ');
};

export const normalizeDisplayName = normalizeDisplayText;

export const normalizeEmailText = value => String(value ?? '').trim().toLowerCase();

export const normalizeAddressText = address => ({
  ...(address || {}),
  logradouro: normalizeDisplayText(address?.logradouro) || null,
  numero: String(address?.numero ?? '').trim() || null,
  complemento: normalizeDisplayText(address?.complemento) || null,
  bairro: normalizeDisplayText(address?.bairro) || null,
  cidade: normalizeDisplayText(address?.cidade) || null,
  uf: String(address?.uf ?? '').trim().toUpperCase() || null,
});
