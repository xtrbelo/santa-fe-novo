import React, { useState, useEffect } from 'react';
import { 
  auth, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInAnonymously, 
  signOut, 
  GoogleAuthProvider, 
  isFirebaseConfigured 
} from './services/firebase';
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
import { LayoutDashboard, LogIn, User } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [tab, setTab] = useState('home');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      setLoading(false); 
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success('Login realizado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível autenticar com o Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAnonymousLogin = async () => {
    if (!auth) return;
    setIsLoggingIn(true);
    try {
      await signInAnonymously(auth);
      toast.info('Acesso rápido concedido.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao iniciar acesso rápido.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      toast.info('Você saiu do sistema.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao sair.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400 font-bold uppercase text-xs tracking-widest mt-4">
          Carregando Sistema Santa Fé...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100/70 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 sm:p-10 text-center space-y-8 shadow-2xl !border-none">
          <div className="w-20 h-20 bg-indigo-600 rounded-[28px] mx-auto flex items-center justify-center text-white rotate-6 shadow-xl shadow-indigo-500/30">
            <LayoutDashboard size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tighter italic uppercase leading-none">
              Santa Fé
            </h1>
            <p className="text-gray-400 font-bold text-[11px] tracking-widest uppercase mt-3">
              Sistema de Gestão Interna
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <Button 
              onClick={handleGoogleLogin} 
              disabled={isLoggingIn}
              className="w-full py-4 rounded-2xl shadow-xl text-base bg-blue-600 hover:bg-blue-700 text-white"
            >
              <LogIn size={20} /> {isLoggingIn ? 'Entrando...' : 'Entrar com Google'}
            </Button>
            <Button 
              onClick={handleAnonymousLogin} 
              disabled={isLoggingIn}
              variant="secondary" 
              className="w-full py-4 rounded-2xl text-base"
            >
              <User size={18} /> Acesso Rápido
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const renderContent = () => {
    switch (tab) {
      case 'home':
        return <HomeModule user={user} onSelectTab={setTab} />;
      case 'agendas':
        return <AgendasModule user={user} />;
      case 'fluxo':
        return <FluxoModule user={user} />;
      case 'pessoas':
        return <PessoasModule user={user} />;
      case 'config':
        return <ConfiguracoesModule user={user} />;
      default:
        return (
          <div className="p-10 text-center">
            <Button onClick={() => setTab('home')}>Voltar ao Início</Button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 lg:pl-72 flex flex-col">
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={tab} 
        onSelectTab={setTab} 
        onSignOut={handleSignOut} 
      />

      {/* Main Content Area */}
      <main className="flex-grow max-w-4xl mx-auto w-full p-4 pt-6 sm:p-10 pb-32 lg:pb-10">
        {renderContent()}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav 
        activeTab={tab} 
        onSelectTab={setTab} 
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}