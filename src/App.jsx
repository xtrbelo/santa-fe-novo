import React, { useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider, isFirebaseConfigured, getAppDoc, getDoc, setDoc, Timestamp } from './services/firebase';
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
import { Clock3, LayoutDashboard, LogIn } from 'lucide-react';

const ROLE_TABS = { admin: ['home', 'agendas', 'fluxo', 'pessoas', 'config'], gestor: ['home', 'agendas', 'fluxo', 'pessoas'], atendimento: ['home', 'fluxo', 'pessoas'] };

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState('home');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) { setLoading(false); return undefined; }
    return onAuthStateChanged(auth, async (authenticatedUser) => {
      setUser(authenticatedUser); setProfile(null);
      if (!authenticatedUser) { setLoading(false); return; }
      try {
        const ref = getAppDoc('usuarios', authenticatedUser.uid);
        let snap = await getDoc(ref);
        if (!snap.exists()) {
          const now = Timestamp.now();
          await setDoc(ref, { uid: authenticatedUser.uid, nome: authenticatedUser.displayName || '', email: authenticatedUser.email || '', role: 'pendente', ativo: true, criadoEm: now, atualizadoEm: now });
          snap = await getDoc(ref);
        }
        setProfile({ id: snap.id, ...snap.data() });
      } catch (error) { console.error(error); toast.error('Não foi possível carregar seu perfil de acesso.'); }
      finally { setLoading(false); }
    });
  }, [toast]);

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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="font-bold text-gray-500">Carregando Sistema Santa Fé...</p></div>;
  if (!user) return <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4"><Card className="max-w-md w-full p-8 sm:p-10 text-center space-y-8 shadow-2xl !border-none"><div className="w-20 h-20 bg-indigo-600 rounded-[28px] mx-auto flex items-center justify-center text-white rotate-6 shadow-xl"><LayoutDashboard size={40} /></div><div><h1 className="text-3xl font-black text-gray-900 italic uppercase">Santa Fé</h1><p className="text-gray-400 font-bold text-[11px] uppercase mt-3">Sistema de Gestão Interna</p></div><Button onClick={handleGoogleLogin} disabled={isLoggingIn} className="w-full py-4 rounded-2xl bg-blue-600 text-white"><LogIn size={20} /> {isLoggingIn ? 'Entrando...' : 'Entrar com Google'}</Button></Card></div>;
  if (!profile || !profile.ativo || profile.role === 'pendente') return <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4"><Card className="max-w-lg w-full p-8 text-center space-y-6 shadow-xl !border-none"><Clock3 size={42} className="mx-auto text-amber-500" /><div><h1 className="text-xl font-black text-gray-900">Acesso pendente de liberação pelo administrador</h1>{!profile?.ativo && <p className="text-rose-600 font-bold mt-2">Este usuário está desativado.</p>}</div><div className="bg-gray-50 rounded-xl p-4 text-left text-sm break-all"><p><strong>UID:</strong> {user.uid}</p><p><strong>E-mail:</strong> {user.email || 'Não informado'}</p></div><Button onClick={handleSignOut} variant="secondary" className="w-full">Sair</Button></Card></div>;

  const allowedTabs = ROLE_TABS[profile.role] || [];
  const selectTab = (nextTab) => setTab(allowedTabs.includes(nextTab) ? nextTab : 'home');
  const renderContent = () => {
    if (!allowedTabs.includes(tab)) return <HomeModule user={user} onSelectTab={selectTab} allowedTabs={allowedTabs} />;
    if (tab === 'agendas') return <AgendasModule user={user} />;
    if (tab === 'fluxo') return <FluxoModule user={user} />;
    if (tab === 'pessoas') return <PessoasModule user={user} readOnly={profile.role === 'atendimento'} />;
    if (tab === 'config') return <ConfiguracoesModule user={user} />;
    return <HomeModule user={user} onSelectTab={selectTab} allowedTabs={allowedTabs} />;
  };
  return <div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col"><Sidebar activeTab={tab} onSelectTab={selectTab} onSignOut={handleSignOut} allowedTabs={allowedTabs} /><main className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10">{renderContent()}</main><MobileNav activeTab={tab} onSelectTab={selectTab} allowedTabs={allowedTabs} /></div>;
}

export default function App() { return <ToastProvider><AppContent /></ToastProvider>; }
