import React, { useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  BookOpenCheck, 
  Users, 
  Mail,
  ClipboardCheck,
  UsersRound,
  Settings,
  ContactRound
} from 'lucide-react';
import { canAccessModule } from '../../constants/permissions';

export const MobileNav = ({ activeTab, onSelectTab, profile }) => {
  const activeItemRef = useRef(null);
  const navItems = [
    { id: 'home', label: 'Início', icon: LayoutDashboard },
    { id: 'agendas', label: 'Agenda', icon: CalendarDays },
    { id: 'programacao', label: 'Programar', icon: Settings },
    { id: 'fluxo', label: 'Fluxo', icon: BookOpenCheck },
    { id: 'pessoas', label: 'Pessoas', icon: Users },
    { id: 'convites', label: 'Convites', icon: Mail },
    { id: 'autocadastros', label: 'Cadastros', icon: ClipboardCheck },
    { id: 'usuarios', label: 'Usuários', icon: UsersRound },
    { id: 'config', label: 'Ajustes', icon: Settings },
    { id: 'meu-cadastro', label: 'Cadastro', icon: ContactRound },
  ];

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeItemRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }, [activeTab]);

  return (
    <nav aria-label="Navegação principal" className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-2 py-3 flex justify-start items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth touch-pan-x lg:hidden z-[90] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe">
      {navItems.filter(item => canAccessModule(profile, item.id)).map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            type="button"
            ref={isActive ? activeItemRef : null}
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`Abrir ${item.label}${isActive ? ' — página atual' : ''}`}
            className={`flex min-h-12 min-w-[4.75rem] flex-none flex-col items-center justify-center gap-1 transition-all duration-300 rounded-lg outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
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
