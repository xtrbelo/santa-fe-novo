import React from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  BookOpenCheck, 
  Users, 
  Mail,
  ClipboardCheck,
  UsersRound,
  Settings, 
  ContactRound,
  LogOut 
} from 'lucide-react';
import { ROLE_LABELS } from '../../constants/roles';
import { canAccessModule } from '../../constants/permissions';

export const Sidebar = ({ activeTab, onSelectTab, onSignOut, profile }) => {
  const navItems = [
    { id: 'home', label: 'Painel', icon: <LayoutDashboard size={22} /> },
    { id: 'agendas', label: 'Agendamentos', icon: <CalendarDays size={22} /> },
    { id: 'programacao', label: 'Programação', icon: <Settings size={22} /> },
    { id: 'fluxo', label: 'Fluxo do Dia', icon: <BookOpenCheck size={22} /> },
    { id: 'pessoas', label: 'Pessoas', icon: <Users size={22} /> },
    { id: 'convites', label: 'Convites', icon: <Mail size={22} /> },
    { id: 'autocadastros', label: 'Autocadastros', icon: <ClipboardCheck size={22} /> },
    { id: 'usuarios', label: 'Usuários', icon: <UsersRound size={22} /> },
    { id: 'config', label: 'Configurações', icon: <Settings size={22} /> },
    { id: 'meu-cadastro', label: 'Meu Cadastro', icon: <ContactRound size={22} /> },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-72 bg-white border-r border-gray-100 hidden lg:flex flex-col p-8 z-50">
      <div className="flex items-center gap-4 mb-14 px-2">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3">
          <LayoutDashboard size={28} />
        </div>
        <div>
          <span className="font-black text-2xl text-gray-900 italic uppercase tracking-tighter leading-none block">
            Santa Fé
          </span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mt-0.5">
            Gestão Interna
          </span>
        </div>
      </div>

      <nav className="flex-grow space-y-2.5">
        {navItems.filter(item => canAccessModule(profile, item.id)).map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl font-black text-sm transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-102'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 outline-none'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 pt-5 px-4 mb-2 min-w-0">
        <p className="font-black text-sm text-gray-800 truncate">{profile?.nome || profile?.email}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">{ROLE_LABELS[profile?.role] || profile?.role}</p>
      </div>
      <button
        onClick={onSignOut}
        className="flex items-center gap-4 text-gray-400 hover:text-rose-600 font-black uppercase text-[11px] tracking-widest p-4 transition-all cursor-pointer"
      >
        <LogOut size={18} />
        <span>Sair do Sistema</span>
      </button>
    </aside>
  );
};
