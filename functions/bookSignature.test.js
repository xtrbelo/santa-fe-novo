import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookSignatureEvidence, buildBookSignerIdentityHash } from './bookSignature.js';

const input = {
  projectId: 'santa-fe-v2-hml', volumeId: 'volume-1', volumeNumber: 1, competence: '2026-09',
  integrityHash: 'a'.repeat(64), fileHash: 'b'.repeat(64), signerRole: 'titular',
  signatureMethod: 'gov_br_manual',
  confirmedBy: 'admin-1', signedAt: '2026-10-01T12:00:00.000Z',
};

test('vincula a evidência ao conteúdo, arquivo, dirigente e momento da assinatura', () => {
  const signerIdentityHash = buildBookSignerIdentityHash({ projectId: input.projectId, signerPersonId: 'pessoa-1', signerCpf: '52998224725' });
  const result = buildBookSignatureEvidence({ ...input, signerIdentityHash });
  assert.equal(result.tipo, 'assinatura_eletronica_institucional');
  assert.equal(result.codigoEvidencia.length, 16);
  assert.equal(result.evidenciaHash.length, 64);
  assert.equal(JSON.stringify(result).includes('52998224725'), false);
  assert.notEqual(buildBookSignatureEvidence({ ...input, signerIdentityHash, fileHash: 'c'.repeat(64) }).evidenciaHash, result.evidenciaHash);
  assert.notEqual(buildBookSignatureEvidence({ ...input, signerIdentityHash, signedAt: '2026-10-01T12:00:01.000Z' }).evidenciaHash, result.evidenciaHash);
});
