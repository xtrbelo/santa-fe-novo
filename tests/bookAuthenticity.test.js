import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicBookAuthenticity } from '../functions/bookAuthenticity.js';

test('retorna somente metadados públicos de autenticidade', () => {
  const result = buildPublicBookAuthenticity({ volume: { numero: 4, competencia: '2026-09', status: 'arquivado', codigoVerificacao: 'ABC123ABC123', assinadoEm: { toDate: () => new Date('2026-10-02T12:00:00Z') }, assinatura: { nome: 'Nome protegido', cpfFinal: '99' } }, integrityIntact: true });
  assert.equal(result.status, 'autentico_assinado');
  assert.equal(result.signed, true);
  assert.equal(result.signedAt, '2026-10-02T12:00:00.000Z');
  assert.equal('assinatura' in result, false);
  assert.equal(JSON.stringify(result).includes('Nome protegido'), false);
  assert.equal(buildPublicBookAuthenticity({ volume: { numero: 4, status: 'encerrado' }, integrityIntact: false }).status, 'divergente');
});
