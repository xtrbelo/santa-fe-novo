export const getOrphanAccessIndexReason = ({ personExists, userExists, userPessoaBaseId, pessoaBaseId }) => {
  if (!personExists) return 'PESSOA_INEXISTENTE';
  if (!userExists) return 'USUARIO_INEXISTENTE';
  if (userPessoaBaseId !== pessoaBaseId) return 'VINCULO_DIVERGENTE';
  return null;
};
