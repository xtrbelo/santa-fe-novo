export const buildPublicBookAuthenticity = ({ volume, integrityIntact }) => ({
  found: true,
  volumeNumber: Number(volume.numero),
  competence: String(volume.competencia || ''),
  status: integrityIntact ? (volume.status === 'arquivado' ? 'autentico_assinado' : 'autentico_nao_assinado') : 'divergente',
  integrityIntact: Boolean(integrityIntact),
  signed: volume.status === 'arquivado',
  verificationCode: String(volume.codigoVerificacao || ''),
  signedAt: volume.assinadoEm?.toDate?.()?.toISOString?.() || null,
});
