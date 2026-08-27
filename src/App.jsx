import React, { useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, isFirebaseConfigured, getAppDoc, getDoc, setDoc, onSnapshot, Timestamp } from './services/firebase';
import { ROLES, ROLE_TABS } from './constants/roles';
import { ToastProvider } from './components/ui/Toast';
import { useToast } from './components/ui/useToast';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { HomeModule } from './modules/Home/HomeModule';
import { AgendasModule } from './modules/Agendas/AgendasModule';
import { FluxoModule } from './modules/Fluxo/FluxoModule';
import { PessoasModule } from './modules/Pessoas/PessoasModule';
import { ConfiguracoesModule } from './modules/Configuracoes/ConfiguracoesModule';
import { UsuariosModule } from './modules/Usuarios/UsuariosModule';
import { Clock3, LayoutDashboard, LogIn, ShieldOff } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState('home');
  const [usersFilter, setUsersFilter] = useState('todos');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const toast = useToast();
  const toastError = toast.error;

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) { setLoading(false); return undefined; }
    let unsubscribeProfile = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, async authenticatedUser => {
      unsubscribeProfile();
      setUser(authenticatedUser);
      setProfile(null);
      if (!authenticatedUser) { setLoading(false); return; }
      try {
        const ref = getAppDoc('usuarios', authenticatedUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const now = Timestamp.now();
          await setDoc(ref, { uid: authenticatedUser.uid, nome: authenticatedUser.displayName || '', email: authenticatedUser.email || '', role: ROLES.PENDENTE, ativo: true, criadoEm: now, atualizadoEm: now });
        }
        unsubscribeProfile = onSnapshot(ref, profileSnapshot => {
          setProfile(profileSnapshot.exists() ? { id: profileSnapshot.id, ...profileSnapshot.data() } : null);
          setLoading(false);
        }, error => { console.error(error); toastError('Não foi possível acompanhar seu perfil de acesso.'); setLoading(false); });
      } catch (error) { console.error(error); toastError('Não foi possível carregar seu perfil de acesso.'); setLoading(false); }
    });
    return () => { unsubscribeAuth(); unsubscribeProfile(); };
  }, [toastError]);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); toast.success('Login realizado com sucesso!'); }
    catch (error) { console.error(error); toast.error('Não foi possível autenticar com o Google.'); }
    finally { setIsLoggingIn(false); }
  };
  const handleSignOut = async () => {
    if (!auth) return;
    try { await signOut(auth); toast.info('Você saiu do sistema.'); }
    catch (error) { console.error(error); toast.error('Erro ao sair.'); }
  };
  const verifyAccess = async () => {
    if (!user) return;
    setIsCheckingAccess(true);
    try {
      const snap = await getDoc(getAppDoc('usuarios', user.uid));
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
      toast.info(snap.data()?.ativo !== false && snap.data()?.role !== ROLES.PENDENTE ? 'Acesso liberado.' : 'A liberação ainda está pendente.');
    } catch (error) { console.error(error); toast.error('Não foi possível verificar a liberação.'); }
    finally { setIsCheckingAccess(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>;
  if (!user) return <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4"><Card className="max-w-md w-full p-8 sm:p-10 text-center space-y-8 shadow-2xl !border-none"><div className="w-20 h-20 bg-indigo-600 rounded-[28px] mx-auto flex items-center justify-center text-white rotate-6 shadow-xl"><LayoutDashboard size={40} /></div><div><h1 className="text-3xl font-black text-gray-900 italic uppercase">Santa Fé</h1><p className="text-gray-400 font-bold text-[11px] uppercase mt-3">Sistema de Gestão Interna</p></div><Button onClick={handleGoogleLogin} disabled={isLoggingIn} className="w-full py-4 rounded-2xl"><LogIn size={20} /> {isLoggingIn ? 'Entrando...' : 'Entrar com Google'}</Button></Card></div>;
  if (profile?.ativo === false) return <AccessScreen icon={<ShieldOff size={44} />} iconClass="text-rose-600" title="Acesso desativado" description="Seu acesso ao Sistema Santa Fé está desabilitado. Procure um administrador." user={user} profile={profile} onSignOut={handleSignOut} />;
  if (!profile || profile.role === ROLES.PENDENTE) return <AccessScreen icon={<Clock3 size={44} />} iconClass="text-amber-500" title="Acesso aguardando liberação" description="Um administrador precisa definir seu perfil antes do primeiro acesso." user={user} profile={profile} onSignOut={handleSignOut} onVerify={verifyAccess} checking={isCheckingAccess} />;

  const allowedTabs = ROLE_TABS[profile.role] || [];
  const selectTab = nextTab => setTab(allowedTabs.includes(nextTab) ? nextTab : 'home');
  const openPendingUsers = () => { if (profile.role === ROLES.ADMIN) { setUsersFilter('pendentes'); setTab('usuarios'); } };
  const renderContent = () => {
    if (!allowedTabs.includes(tab)) return <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} onOpenPendingUsers={openPendingUsers} />;
    if (tab === 'agendas') return <AgendasModule user={user} />;
    if (tab === 'fluxo') return <FluxoModule user={user} />;
    if (tab === 'pessoas') return <PessoasModule user={user} readOnly={profile.role === ROLES.ATENDIMENTO} />;
    if (tab === 'usuarios') return profile.role === ROLES.ADMIN ? <UsuariosModule user={user} profile={profile} initialFilter={usersFilter} /> : <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} />;
    if (tab === 'config') return <ConfiguracoesModule user={user} />;
    return <HomeModule user={user} profile={profile} onSelectTab={selectTab} allowedTabs={allowedTabs} onOpenPendingUsers={openPendingUsers} />;
  };
  return <div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col"><Sidebar activeTab={tab} onSelectTab={selectTab} onSignOut={handleSignOut} allowedTabs={allowedTabs} profile={profile} /><main className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10">{renderContent()}</main><MobileNav activeTab={tab} onSelectTab={selectTab} allowedTabs={allowedTabs} /></div>;
}

const AccessScreen = ({ icon, iconClass, title, description, user, profile, onSignOut, onVerify, checking }) => <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4"><Card className="max-w-lg w-full p-8 text-center space-y-6 shadow-xl !border-none"><div className={iconClass}>{icon}</div><div><h1 className="text-xl font-black text-gray-900">{title}</h1><p className="text-gray-500 text-sm mt-2">{description}</p></div><div className="bg-gray-50 rounded-xl p-4 text-left text-sm break-all"><p><strong>Nome:</strong> {profile?.nome || user.displayName || 'Não informado'}</p><p><strong>E-mail:</strong> {profile?.email || user.email || 'Não informado'}</p><p><strong>UID:</strong> {user.uid}</p></div>{onVerify && <Button onClick={onVerify} disabled={checking} className="w-full">{checking ? 'Verificando...' : 'Verificar liberação'}</Button>}<Button onClick={onSignOut} variant="secondary" className="w-full">Sair</Button></Card></div>;

export default function App() { return <ToastProvider><AppContent /></ToastProvider>; }
