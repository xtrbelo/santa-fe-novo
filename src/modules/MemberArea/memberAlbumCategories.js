export const MEMBER_ALBUM_CATEGORIES = [
  { value: 'trabalhos-casa', label: '01 - Trabalhos da Casa', subdivisions: ['Mesa Mediúnica', 'Giras', 'Outros Trabalhos'] },
  { value: 'celebracoes-festividades', label: '02 - Celebrações e Festividades', subdivisions: [] },
  { value: 'sacramentos', label: '03 - Sacramentos', subdivisions: [] },
  { value: 'acoes-sociais', label: '04 - Ações Sociais', subdivisions: [] },
  { value: 'eventos-campanhas', label: '05 - Eventos e Campanhas', subdivisions: [] },
  { value: 'institucional', label: '06 - Institucional', subdivisions: ['Fotos da Casa', 'Fachada e Ambientes', 'Dirigentes e Equipe'] },
  { value: 'redes-sociais', label: '07 - Redes Sociais', subdivisions: ['Material para Publicar', 'Publicados'] },
  { value: 'videos', label: '08 - Vídeos', subdivisions: [] },
  { value: 'arquivo-historico', label: '99 - Arquivo Histórico', subdivisions: [] },
];

export const getMemberAlbumCategory = value => MEMBER_ALBUM_CATEGORIES.find(item => item.value === value);
