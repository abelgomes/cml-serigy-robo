// Robô de coleta: lê as pastas de documentos que a Câmara publica no portal da Ágape
// e gera docs/agape.json, que as páginas do portal da Câmara leem.
//
// Uso: node robo/coletar-agape.mjs
// Roda sozinho uma vez por dia no GitHub Actions (.github/workflows/coletar-agape.yml).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://portal.sitesagapesistemas.com.br/agape2/portal/?alias=cmlagarto&p=documentos&f=';
const ARQUIVOS = 'https://portal.sitesagapesistemas.com.br/agape2/upload/arquivos/75/';
const SAIDA = new URL('../docs/agape.json', import.meta.url);

// Pastas acompanhadas: chave usada pelas páginas -> número da pasta na Ágape.
const PASTAS = {
  balancoGeral: { f: 22024, titulo: 'Prestação de Contas (Balanço Geral)' },
  relatorioGestao: { f: 2972, titulo: 'Relatório de Gestão, Certificado de Auditoria e Parecer do Controle Interno' },
  julgamentoTCE: { f: 27398, titulo: 'Julgamento das contas do Legislativo pelo TCE' },
  julgamentoExecutivo: { f: 27397, titulo: 'Julgamento das contas do Executivo' },
  rgf: { f: 36, titulo: 'Relatório de Gestão Fiscal (RGF)' },
  planoEstrategico: { f: 22017, titulo: 'Plano Estratégico Institucional' },
  convenios: { f: 3883, titulo: 'Convênios e transferências (notas explicativas)' },
  obras: { f: 19433, titulo: 'Obras' },
  cotas: { f: 22039, titulo: 'Verba indenizatória (notas explicativas)' },
  votacoesNominais: { f: 22036, titulo: 'Votações nominais' },
  pca: { f: 20947, titulo: 'Plano de Contratações Anual (PCA)' },
  sancoes: { f: 24141, titulo: 'Licitantes sancionados (notas explicativas)' },
  estagiarios: { f: 21652, titulo: 'Estagiários (declarações)' },
  terceirizados: { f: 21666, titulo: 'Terceirizados (declarações)' },
  concursos: { f: 20605, titulo: 'Concursos e processos seletivos (declarações)' },
  fiscaisContratos: { f: 24140, titulo: 'Relação de contratos e fiscais' },
  quadroRemuneratorio: { f: 2960, titulo: 'Quadro remuneratório de cargos' },
  diarias: { f: 20911, titulo: 'Diárias (lei e tabela de valores)' }
};

const limpa = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&ccedil;/g, 'ç').replace(/&atilde;/g, 'ã').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
  .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ecirc;/g, 'ê')
  .replace(/&ocirc;/g, 'ô').replace(/&otilde;/g, 'õ').replace(/&agrave;/g, 'à').replace(/\s+/g, ' ').trim();
const IGNORAR = /^(Publicações|Exportar em:|PDF|CSV|XLSX|Documento|Resumo|Tamanho|Visualizar|Copiar link|Visualizar arquivo|Detalhes|Ano|Descrição\/Resumo|Limpar filtro|[\d.,]+ ?(KB|MB|GB))$/i;

// Lê uma pasta: devolve os documentos em ordem, com o ano do grupo em que aparecem.
async function lerPasta(f) {
  const r = await fetch(BASE + f, { headers: { 'User-Agent': 'robo-transparencia-camara-lagarto (github.com/abelgomes)' } });
  if (!r.ok) { throw new Error('HTTP ' + r.status); }
  let h = await r.text();
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const ini = h.indexOf('Limpar filtro') > 0 ? h.indexOf('Limpar filtro') : h.indexOf('VOCÊ ESTÁ AQUI');
  const fim = h.indexOf('Conjunto de informa', ini);
  if (ini < 0 || fim < 0) { throw new Error('estrutura da página mudou'); }
  const trecho = h.slice(ini, fim).replace(/upload\/arquivos\/75\/(arq_[0-9a-f]+\.\w+)/g, '>@@$1<');
  const tokens = trecho.replace(/<[^>]+>/g, '\n').split('\n').map(limpa).filter((t) => t && !IGNORAR.test(t));

  const docs = [];
  let ano = '', textos = [];
  for (const t of tokens) {
    if (/^\d{4}$/.test(t)) { ano = t; textos = []; continue; }
    if (t.startsWith('@@')) {
      const unicos = [...new Set(textos)];
      docs.push({ ano, titulo: unicos[0] || '', resumo: unicos[1] || '', arquivo: t.slice(2), url: ARQUIVOS + t.slice(2) });
      textos = [];
      continue;
    }
    textos.push(t);
  }
  // A Ágape às vezes repete o mesmo arquivo no mesmo ano: fica uma cópia só.
  const vistos = new Set();
  return docs.filter((d) => { const k = d.ano + '|' + d.arquivo; if (vistos.has(k)) { return false; } vistos.add(k); return true; });
}

async function main() {
  let anterior = null;
  try { anterior = JSON.parse(await readFile(SAIDA, 'utf8')); } catch { /* primeira execução */ }
  const agora = new Date().toISOString();
  const saida = { atualizado: agora, fonte: 'portal.sitesagapesistemas.com.br (alias cmlagarto)', pastas: {} };
  let erros = 0;

  for (const [chave, info] of Object.entries(PASTAS)) {
    const antes = anterior && anterior.pastas[chave];
    try {
      const docs = await lerPasta(info.f);
      // Guarda quando cada arquivo foi visto pela primeira vez, para o painel mostrar as novidades.
      const vistoAntes = new Map((antes && antes.docs || []).map((d) => [d.ano + '|' + d.arquivo, d.primeiraVez]));
      docs.forEach((d) => { d.primeiraVez = vistoAntes.get(d.ano + '|' + d.arquivo) || (anterior ? agora : null); });
      saida.pastas[chave] = { f: info.f, titulo: info.titulo, lidoEm: agora, docs };
      console.log(`${chave.padEnd(20)} ${String(docs.length).padStart(3)} documentos`);
    } catch (e) {
      erros++;
      // Se a Ágape falhar, mantém a última lista boa e marca o erro.
      saida.pastas[chave] = Object.assign({}, antes || { f: info.f, titulo: info.titulo, docs: [] }, { erro: String(e.message || e) });
      console.log(`${chave.padEnd(20)} ERRO: ${e.message || e}`);
    }
  }
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(SAIDA, JSON.stringify(saida, null, 1));
  console.log(`\n${Object.keys(PASTAS).length - erros} pastas lidas, ${erros} com erro.`);
  if (erros === Object.keys(PASTAS).length) { process.exit(1); }
}

main();
