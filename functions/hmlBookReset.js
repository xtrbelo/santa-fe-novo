export const canResetArchivedBookInHml = ({ projectId, status, isAdmin }) =>
  projectId === 'santa-fe-v2-hml' && status === 'arquivado' && isAdmin === true;
