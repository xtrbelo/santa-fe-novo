import React from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  BookOpenCheck, 
  Users, 
  UsersRound,
  Settings 
} from 'lucide-react';

export const MobileNav = ({ activeTab, onSelectTab, allowedTabs }) => {
  const navItems = [
    { id: 'home', label: 'Início', icon: LayoutDashboard },
    { id: 'agendas', label: 'Agendas', icon: CalendarDays },
    { id: 'fluxo', label: 'Fluxo', icon: BookOpenCheck },
    { id: 'pessoas', label: 'Pessoas', icon: Users },
    { id: 'usuarios', label: 'Usuários', icon: UsersRound },
    { id: 'config', label: 'Ajustes', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-2 py-3 flex justify-around items-center lg:hidden z-[90] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
      {navItems.filter(item => allowedTabs.includes(item.id)).map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 flex-1 outline-none cursor-pointer ${
              isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className={`transition-transform duration-300 ${isActive ? 'scale-110 mb-0.5' : ''}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isActive ? 'opacity-100 font-extrabold' : 'opacity-70'}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
