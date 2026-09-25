import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  getAppDoc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from '../../services/firebase';
import { AtendimentoDiaCard } from './AtendimentoDiaCard';
import { AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { buildAttendanceWorkerGroups } from '../../utils/attendanceWorkers';
import { getScheduledWorkerGroups } from '../../utils/workGroups';

export const FluxoModule = ({ user, profile, onScheduleReturn }) => {
  const [agendasHoje, setAgendasHoje] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [funcoesMembro, setFuncoesMembro] = useState([]);
  const [gruposTrabalho, setGruposTrabalho] = useState([]);
  const [equipeEventos, setEquipeEventos] = useState([]);
  const [responsaveisLivro, setResponsaveisLivro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    let agendasReady = false;
    let servicesReady = false;
    let peopleReady = false;
    let functionsReady = false; let groupsReady = false; let eventTeamReady = false; let bookReady = false;
    const markReady = () => { if (agendasReady && servicesReady && peopleReady && functionsReady && groupsReady && eventTeamReady && bookReady) setLoading(false); };
    const handleLoadError = error => {
      console.error(error);
      setLoadError('Não foi possível acompanhar o fluxo em tempo real.');
      setLoading(false);
    };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const todayQuery = query(
      getAppCollection('agendas'),
      where('data', '>=', Timestamp.fromDate(startOfToday)),
      where('data', '<', Timestamp.fromDate(startOfTomorrow))
    );
    const unsubA = onSnapshot(todayQuery, (s) => {
      setAgendasHoje(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => !['Concluída', 'Cancelada'].includes(a.status))
      );
      agendasReady = true;
      markReady();
    }, handleLoadError);

    const unsubS = onSnapshot(getAppCollection('config_servicos'), (s) => {
      setServicos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false));
      servicesReady = true;
      markReady();
    }, handleLoadError);
    const unsubP = onSnapshot(getAppCollection('pessoas'), snapshot => { setPessoas(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); peopleReady = true; markReady(); }, handleLoadError);
    const unsubF = onSnapshot(getAppCollection('config_funcoes_membro'), snapshot => { setFuncoesMembro(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); functionsReady = true; markReady(); }, handleLoadError);
    const unsubG = onSnapshot(getAppCollection('config_grupos_trabalho'), snapshot => { setGruposTrabalho(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); groupsReady = true; markReady(); }, handleLoadError);
    const unsubE = onSnapshot(getAppCollection('config_equipe_eventos'), snapshot => { setEquipeEventos(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.ativo !== false)); eventTeamReady = true; markReady(); }, handleLoadError);
    const unsubB = onSnapshot(getAppDoc('config_livro_mediunico', 'responsaveis'), snapshot => { setResponsaveisLivro(snapshot.exists() ? snapshot.data() : null); bookReady = true; markReady(); }, handleLoadError);

    return () => {
      unsubA();
      unsubS();
      unsubP();
      unsubF();
      unsubG();
      unsubE();
      unsubB();
    };
  }, [user, reloadVersion]);

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
        {loadError ? (
          <div role="alert" className="text-center py-16 bg-white rounded-3xl border border-rose-100">
            <AlertCircle className="mx-auto text-rose-500 mb-3" size={42} />
            <p className="text-rose-700 font-black text-sm">{loadError}</p>
            <Button variant="secondary" className="mx-auto mt-4" onClick={() => setReloadVersion(value => value + 1)}>Tentar novamente</Button>
          </div>
        ) : loading ? (
          <div className="text-center py-16 bg-white rounded-3xl text-sm font-bold text-gray-400" role="status">Carregando fluxo do dia...</div>
        ) : agendasHoje.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <AlertCircle className="mx-auto text-amber-400 mb-3" size={42} />
            <p className="text-gray-500 font-black uppercase text-sm tracking-wider">
              Nenhuma agenda programada para hoje
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Verifique a disponibilidade no módulo de Programação.
            </p>
          </div>
        ) : (
          agendasHoje.map(a => {
            const allWorkers = buildAttendanceWorkerGroups(pessoas, funcoesMembro);
            const scheduledWorkers = getScheduledWorkerGroups({ agendaDate: a.data, groups: gruposTrabalho, workers: allWorkers });
            return (
            <AtendimentoDiaCard 
              key={a.id} 
              agenda={a} 
              user={user} 
              profile={profile}
              servicosCatalogo={servicos} 
              workerGroups={scheduledWorkers}
              substituteWorkerGroups={allWorkers}
              eventTeam={equipeEventos}
              bookResponsibles={responsaveisLivro ? [
                { ...pessoas.find(item => item.id === responsaveisLivro.titularPessoaId), id: responsaveisLivro.titularPessoaId, papel: 'titular' },
                { ...pessoas.find(item => item.id === responsaveisLivro.substitutaPessoaId), id: responsaveisLivro.substitutaPessoaId, papel: 'substituta' },
              ].filter(item => item.nome && item.ativo !== false) : []}
              onScheduleReturn={onScheduleReturn}
            />
          );})
        )}
      </div>
    </div>
  );
};
