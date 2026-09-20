import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Link2, Users } from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';
import { getAppCollection, onSnapshot, query, where } from '../../services/firebase';

const lazyNamed = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));
const PessoasModule = lazyNamed(() => import('./PessoasModule'), 'PessoasModule');
const AutocadastrosModule = lazyNamed(() => import('../Autocadastros/AutocadastrosModule'), 'AutocadastrosModule');
const LinksCadastroModule = lazyNamed(() => import('../LinksCadastro/LinksCadastroModule'), 'LinksCadastroModule');

const initialSection = () => {
  if (window.location.pathname === '/convites' || new URLSearchParams(window.location.search).get('secao') === 'links') return 'links';
  if (window.location.pathname === '/autocadastros') return 'solicitacoes';
  if (new URLSearchParams(window.location.search).get('secao') === 'solicitacoes') return 'solicitacoes';
  return 'pessoas';
};

const LoadingSection = () => <div role="status" className="py-16 text-center text-sm font-bold text-gray-500">Carregando seção...</div>;

export function PessoasCadastrosModule({ user, profile, focusPersonId = null, onFocusConsumed }) {
  const sections = useMemo(() => [
    { id: 'pessoas', label: 'Pessoas', description: 'Cadastros existentes', icon: Users, visible: hasPermission(profile, PERMISSIONS.PEOPLE_VIEW) },
    { id: 'links', label: 'Links', description: 'Cadastros reutilizáveis', icon: Link2, visible: hasPermission(profile, PERMISSIONS.MEMBER_INVITES_MANAGE) },
    { id: 'solicitacoes', label: 'Solicitações', description: 'Autocadastros recebidos', icon: ClipboardCheck, visible: hasPermission(profile, PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW) },
  ].filter(section => section.visible), [profile]);
  const [section, setSection] = useState(() => initialSection());
  const [localFocusedPersonId, setLocalFocusedPersonId] = useState(null);
  const [filteredLinkId, setFilteredLinkId] = useState(null);
  const [pendingRegistrations, setPendingRegistrations] = useState({ membro: 0, consulente: 0 });
  const activeSection = sections.some(item => item.id === section) ? section : sections[0]?.id;
  const openPerson = pessoaId => { setLocalFocusedPersonId(pessoaId); setSection('pessoas'); };
  const openLinkRequests = linkId => { setFilteredLinkId(linkId); setSection('solicitacoes'); };
  useEffect(() => { if (focusPersonId) setSection('pessoas'); }, [focusPersonId]);
  useEffect(() => {
    if (!hasPermission(profile, PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW)) return undefined;
    let inviteMembers = 0; let linkMembers = 0; let linkConsultees = 0;
    const sync = () => setPendingRegistrations({ membro: inviteMembers + linkMembers, consulente: linkConsultees });
    const pending = where('statusCadastro', '==', 'aguardando_validacao');
    const unsubInvites = onSnapshot(query(getAppCollection('autocadastros_membro'), pending), snapshot => { inviteMembers = snapshot.size; sync(); });
    const unsubLinks = onSnapshot(query(getAppCollection('solicitacoes_cadastro'), pending), snapshot => { linkMembers = snapshot.docs.filter(item => item.data().tipoCadastro !== 'consulente').length; linkConsultees = snapshot.docs.filter(item => item.data().tipoCadastro === 'consulente').length; sync(); });
    return () => { unsubInvites(); unsubLinks(); };
  }, [profile]);

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Pessoas e Cadastros</h1>
      <p className="mt-1 text-sm font-medium text-gray-500">Pessoas, links de cadastro e solicitações reunidos em um único fluxo.</p>
    </div>
    <nav aria-label="Seções de Pessoas e Cadastros" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map(item => {
        const Icon = item.icon;
        const active = activeSection === item.id;
        return <button key={item.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => setSection(item.id)} className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${active ? 'border-purple-500 bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'border-gray-100 bg-white text-gray-600 hover:border-purple-200'}`}>
          <Icon size={22} className="shrink-0" />
          <span><span className="block text-sm font-black">{item.label}{item.id === 'solicitacoes' && pendingRegistrations.membro + pendingRegistrations.consulente > 0 ? ` (${pendingRegistrations.membro + pendingRegistrations.consulente})` : ''}</span><span className={`mt-0.5 block text-[11px] font-medium ${active ? 'text-purple-100' : 'text-gray-400'}`}>{item.description}</span></span>
        </button>;
      })}
    </nav>
    <Suspense fallback={<LoadingSection />}>
      {activeSection === 'links' ? <LinksCadastroModule user={user} onOpenRequests={openLinkRequests} /> : activeSection === 'solicitacoes' ? <AutocadastrosModule user={user} onOpenPerson={openPerson} filterLinkId={filteredLinkId} onClearLinkFilter={() => setFilteredLinkId(null)} /> : <PessoasModule user={user} profile={profile} focusPersonId={focusPersonId || localFocusedPersonId} onFocusConsumed={() => { setLocalFocusedPersonId(null); onFocusConsumed?.(); }} />}
    </Suspense>
  </div>;
}
