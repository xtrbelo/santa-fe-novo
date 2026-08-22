import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  getAppDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  Timestamp 
} from '../../services/firebase';
import { 
  calcularIdade, 
  isMenor, 
  maskCPF, 
  maskPhone, 
  cleanDigits 
} from '../../utils/formatters';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { 
  UserPlus, 
  Search, 
  Filter, 
  UserSquare2, 
  Edit, 
  Trash2, 
  CheckCircle2 
} from 'lucide-react';

export const PessoasModule = ({ user }) => {
  const [pessoas, setPessoas] = useState([]);
  const [tiposPessoa, setTiposPessoa] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('Todos');
  const [buscaTexto, setBuscaTexto] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados do formulário
  const [eTipoPessoa, setETipoPessoa] = useState('');
  const [eDataNasc, setEDataNasc] = useState('');
  const [eIdade, setEIdade] = useState(null);
  const [eNome, setENome] = useState('');
  const [eCpf, setECpf] = useState('');
  const [eContato, setEContato] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eRespCpf, setERespCpf] = useState('');
  const [eRespNome, setERespNome] = useState('');
  const [eRespContato, setERespContato] = useState('');

  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const unsubP = onSnapshot(getAppCollection('pessoas'), (s) => {
      setPessoas(
        s.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
      );
    });
    const unsubT = onSnapshot(getAppCollection('config_tipos_pessoa'), (s) => {
      setTiposPessoa(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubP();
      unsubT();
    };
  }, [user]);

  const resetForm = () => {
    setEditing(null);
    setEDataNasc('');
    setEIdade(null);
    setENome('');
    setECpf('');
    setEContato('');
    setEEmail('');
    setERespCpf('');
    setERespNome('');
    setERespContato('');
    setETipoPessoa(tiposPessoa[0]?.nome || 'Consulente');
  };

  const openNew = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setETipoPessoa(p.tipoPessoa || tiposPessoa[0]?.nome || '');
    setEDataNasc(p.dataNascimento || '');
    setEIdade(calcularIdade(p.dataNascimento));
    setENome(p.nome || '');
    setECpf(maskCPF(p.cpf));
    setEContato(maskPhone(p.contato));
    setEEmail(p.email || '');
    setERespCpf(maskCPF(p.responsavelCpf));
    setERespNome(p.responsavelNome || '');
    setERespContato(maskPhone(p.responsavelContato));
    setIsModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!eNome.trim()) {
      toast.error('O nome é obrigatório.');
      return;
    }

    const minor = eIdade !== null && eIdade < 18;
    const rawCpf = cleanDigits(eCpf);
    
    // Validação básica se CPF fornecido
    if (rawCpf && rawCpf.length !== 11) {
      toast.error('CPF deve conter 11 dígitos.');
      return;
    }

    setIsSubmitting(true);
    const data = {
      tipoPessoa: eTipoPessoa,
      nome: eNome.trim(),
      dataNascimento: eDataNasc || null,
      cpf: rawCpf || null,
      contato: minor ? null : cleanDigits(eContato) || null,
      email: minor ? null : eEmail.trim() || null,
      responsavelCpf: minor ? cleanDigits(eRespCpf) || null : null,
      responsavelNome: minor ? eRespNome.trim() || null : null,
      responsavelContato: minor ? cleanDigits(eRespContato) || null : null,
      atualizadoEm: Timestamp.now()
    };

    try {
      if (editing) {
        await updateDoc(getAppDoc('pessoas', editing.id), data);
        toast.success('Cadastro atualizado com sucesso!');
      } else {
        data.criadoEm = Timestamp.now();
        await addDoc(getAppCollection('pessoas'), data);
        toast.success('Nova pessoa cadastrada com sucesso!');
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar os dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(getAppDoc('pessoas', itemToDelete.id));
      toast.success(`Registro de ${itemToDelete.nome} removido.`);
      setItemToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir registro.');
    }
  };

  const cleanSearch = buscaTexto.toLowerCase().trim();
  const filtradas = pessoas.filter(p => {
    const mType = abaAtiva === 'Todos' || p.tipoPessoa === abaAtiva;
    const mSearch = 
      !cleanSearch ||
      (p.nome || "").toLowerCase().includes(cleanSearch) || 
      (p.cpf && p.cpf.includes(cleanSearch));
    return mType && mSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <header className="flex justify-between items-end gap-4 px-1">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">
            Pessoas
          </h2>
          <p className="text-gray-500 font-medium text-xs sm:text-sm mt-1">
            Cadastro unificado de membros e consulentes
          </p>
        </div>
        <Button 
          onClick={openNew} 
          className="rounded-full w-12 h-12 p-0 shadow-lg shadow-purple-500/30 shrink-0 bg-purple-600 hover:bg-purple-700 text-white"
        >
          <UserPlus size={22} />
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center bg-white px-4 py-1.5 rounded-2xl border border-gray-100 shadow-sm">
          <Search size={18} className="text-purple-400 mr-3 shrink-0" />
          <input 
            type="text" 
            placeholder="Procurar nome ou CPF..." 
            value={buscaTexto} 
            onChange={e => setBuscaTexto(e.target.value)} 
            className="w-full bg-transparent border-none outline-none text-sm font-bold text-gray-700 py-2.5" 
          />
        </div>
        <div className="flex items-center bg-white px-4 py-1.5 rounded-2xl border border-gray-100 shadow-sm">
          <Filter size={18} className="text-purple-400 mr-3 shrink-0" />
          <select 
            value={abaAtiva} 
            onChange={e => setAbaAtiva(e.target.value)} 
            className="w-full bg-transparent border-none outline-none text-sm font-bold text-gray-700 py-2.5 cursor-pointer"
          >
            <option value="Todos">Todos os Tipos de Pessoa</option>
            {tiposPessoa.map(t => (
              <option key={t.id} value={t.nome}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtradas.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <UserSquare2 className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">
              Nenhum registro encontrado
            </p>
          </div>
        ) : (
          filtradas.map(p => (
            <Card key={p.id} className="flex flex-col gap-4 !border-none shadow-md">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <UserSquare2 size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-gray-900 text-sm sm:text-base truncate leading-tight">
                      {p.nome}
                    </h4>
                    {isMenor(p.dataNascimento) && (
                      <span className="bg-amber-100 text-amber-800 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        Menor de Idade
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-[9px] font-black uppercase bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full">
                      {p.tipoPessoa || 'Consulente'}
                    </span>
                    {p.cpf && (
                      <span className="text-[11px] font-bold text-gray-400">
                        CPF: {maskCPF(p.cpf)}
                      </span>
                    )}
                    {p.contato && (
                      <span className="text-[11px] font-bold text-gray-400">
                        • {maskPhone(p.contato)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t border-gray-50 pt-3">
                <Button 
                  variant="secondary" 
                  onClick={() => openEdit(p)} 
                  className="flex-1 py-2 text-xs h-10 rounded-xl text-purple-700 hover:bg-purple-50"
                >
                  <Edit size={14} /> Editar
                </Button>
                <Button 
                  variant="danger" 
                  onClick={() => setItemToDelete(p)} 
                  className="px-4 py-2 h-10 rounded-xl"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editing ? "Editar Pessoa" : "Novo Cadastro"}
      >
        <form onSubmit={save} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                Tipo *
              </label>
              <select 
                value={eTipoPessoa} 
                onChange={e => setETipoPessoa(e.target.value)} 
                required 
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm focus:border-purple-500 focus:bg-white outline-none cursor-pointer"
              >
                {tiposPessoa.map(t => (
                  <option key={t.id} value={t.nome}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                Data de Nascimento
              </label>
              <input 
                type="date" 
                value={eDataNasc} 
                onChange={e => { 
                  setEDataNasc(e.target.value); 
                  setEIdade(calcularIdade(e.target.value)); 
                }} 
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm focus:border-purple-500 focus:bg-white outline-none" 
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
              Nome Completo *
            </label>
            <input 
              value={eNome} 
              onChange={e => setENome(e.target.value)} 
              required 
              placeholder="Ex: João da Silva"
              className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm focus:border-purple-500 focus:bg-white outline-none" 
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                CPF
              </label>
              <input 
                value={eCpf} 
                onChange={e => setECpf(maskCPF(e.target.value))} 
                placeholder="000.000.000-00" 
                maxLength={14}
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm focus:border-purple-500 focus:bg-white outline-none" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                Celular / WhatsApp
              </label>
              <input 
                value={eContato} 
                onChange={e => setEContato(maskPhone(e.target.value))} 
                placeholder="(00) 00000-0000" 
                maxLength={15}
                className="w-full bg-gray-50 px-4 py-3 rounded-xl border border-transparent font-bold text-sm focus:border-purple-500 focus:bg-white outline-none" 
              />
            </div>
          </div>

          {eIdade !== null && eIdade < 18 && (
            <div className="bg-amber-50/60 p-4 sm:p-5 rounded-2xl space-y-3 border border-amber-200/70">
              <p className="text-[10px] font-black uppercase text-amber-800 tracking-widest">
                Dados do Responsável (Menor de Idade)
              </p>
              <input 
                value={eRespNome} 
                onChange={e => setERespNome(e.target.value)} 
                placeholder="Nome Completo do Responsável" 
                required 
                className="w-full bg-white px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:border-amber-500" 
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input 
                  value={eRespCpf} 
                  onChange={e => setERespCpf(maskCPF(e.target.value))} 
                  placeholder="CPF do Responsável" 
                  maxLength={14}
                  required 
                  className="w-full bg-white px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:border-amber-500" 
                />
                <input 
                  value={eRespContato} 
                  onChange={e => setERespContato(maskPhone(e.target.value))} 
                  placeholder="WhatsApp do Responsável" 
                  maxLength={15}
                  required 
                  className="w-full bg-white px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:border-amber-500" 
                />
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-4 mt-2 text-base bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
          >
            <CheckCircle2 size={18} /> {isSubmitting ? 'Salvando...' : 'Gravar Registro'}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog 
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDelete}
        title="Excluir Registro"
        message={`Deseja realmente excluir o registro de "${itemToDelete?.nome}"? Esta ação não pode ser desfeita.`}
        confirmText="Sim, Excluir"
      />
    </div>
  );
};
