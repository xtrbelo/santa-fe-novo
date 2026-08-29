import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot 
} from '../../services/firebase';
import { AtendimentoDiaCard } from './AtendimentoDiaCard';
import { AlertCircle } from 'lucide-react';

export const FluxoModule = ({ user, profile }) => {
  const [agendasHoje, setAgendasHoje] = useState([]);
  const [servicos, setServicos] = useState([]);

  useEffect(() => {
    if (!user) return;

    const isToday = (ts) => {
      if (!ts) return false;
      const d = ts.toDate();
      const now = new Date();
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    };

    const unsubA = onSnapshot(getAppCollection('agendas'), (s) => {
      setAgendasHoje(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => isToday(a.data) && !['Concluída', 'Cancelada'].includes(a.status))
      );
    });

    const unsubS = onSnapshot(getAppCollection('config_servicos'), (s) => {
      setServicos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false));
    });

    return () => {
      unsubA();
      unsubS();
    };
  }, [user]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <header className="px-1">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">
          Fluxo do Dia
        </h2>
        <p className="text-gray-500 font-medium text-xs sm:text-sm mt-1">
          Controle de presenças e atendimentos em tempo real
        </p>
      </header>

      <div className="space-y-6">
        {agendasHoje.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <AlertCircle className="mx-auto text-amber-400 mb-3" size={42} />
            <p className="text-gray-500 font-black uppercase text-sm tracking-wider">
              Nenhuma agenda programada para hoje
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Verifique ou crie uma nova data no módulo de Agendas.
            </p>
          </div>
        ) : (
          agendasHoje.map(a => (
            <AtendimentoDiaCard 
              key={a.id} 
              agenda={a} 
              user={user} 
              profile={profile}
              servicosCatalogo={servicos} 
            />
          ))
        )}
      </div>
    </div>
  );
};
