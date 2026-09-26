import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

export const buildBookSignerIdentityHash = ({ projectId, signerPersonId, signerCpf }) =>
  sha256(['livro-mediunico-dirigente-v1', projectId, signerPersonId, signerCpf].join('|'));

export const buildBookSignatureEvidence = ({ projectId, volumeId, volumeNumber, competence, integrityHash, fileHash, signerIdentityHash, signerRole, signatureMethod, confirmedBy, signedAt }) => {
  const evidenceHash = sha256([
    'livro-mediunico-assinatura-v1', projectId, volumeId, Number(volumeNumber), competence || '',
    integrityHash, fileHash, signerIdentityHash, signerRole, signatureMethod, confirmedBy, signedAt,
  ].join('|'));
  return {
    tipo: 'assinatura_eletronica_institucional',
    versaoEvidencia: 1,
    evidenciaHash: evidenceHash,
    codigoEvidencia: evidenceHash.slice(0, 16).toUpperCase(),
  };
};
