export const getAppointmentServiceChanges = (event, services = []) => {
  const names = Object.fromEntries(services.map(service => [service.id, service.nome]));
  const previous = event?.servicosAnteriores || [];
  const next = event?.servicosNovos || [];
  return {
    added: next.filter(id => !previous.includes(id)).map(id => names[id] || id),
    removed: previous.filter(id => !next.includes(id)).map(id => names[id] || id),
  };
};

export const sortAppointmentServiceHistory = events => [...events].sort((a, b) => (b.criadoEm?.toMillis?.() || Number(b.criadoEm || 0)) - (a.criadoEm?.toMillis?.() || Number(a.criadoEm || 0)));
