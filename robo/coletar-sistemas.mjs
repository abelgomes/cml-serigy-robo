// Robô de coleta — etapa 2: lê os SISTEMAS da Ágape (licitações, contratos e folha de pagamento)
// e gera arquivos JSON em docs/sistemas/, que as páginas do portal da Câmara leem.
//
// Uso: node robo/coletar-sistemas.mjs
// Roda junto com a coleta de documentos, uma vez por dia (.github/workflows/coletar-agape.yml).
//
// Para não sobrecarregar a Ágape, o robô reaproveita o que já coletou: detalhes de licitações e contratos
// de anos antigos e meses fechados da folha só são lidos de novo se ainda não estiverem guardados.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const PORTAL = 'https://portal.sitesagapesistemas.com.br/agape2/portal/';
const FOLHA = 'https://agportal.prd.sitesagapesistemas.com.br/embed/v1/cmlagarto/folha';
const PASTA = new URL('../docs/sistemas/', import.meta.url);
const AGORA = new Date();
const ANO = AGORA.getFullYear();
const ANO_MIN = ANO - 4;            // histórico: ano atual + 4 anteriores (o TCE pede 3)
const ESPERA_MS = 150;              // pausa entre pedidos, por educação com o servidor da Ágape

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ENTIDADES = { nbsp: ' ', amp: '&', quot: '"', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ',
  aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú',
  ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', acirc: 'â', Acirc: 'Â', agrave: 'à', Agrave: 'À', ordm: 'º', ordf: 'ª', times: '×' };
const texto = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|[a-zA-Z]+);/g, (m, e) => e[0] === '#' ? String.fromCharCode(+e.slice(1)) : (ENTIDADES[e] ?? m))
  .replace(/\s+/g, ' ').trim();
const valorBR = (s) => { const t = texto(s).replace(/[^\d,.-]/g, ''); if (!t) { return null; } const n = Number(t.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const dataISO = (s) => { const m = texto(s).match(/(\d{2})[/-](\d{2})[/-](\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

async function baixar(url, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'robo-transparencia-camara-lagarto (github.com/abelgomes)' } });
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      const h = await r.text();
      await dormir(ESPERA_MS);
      return h;
    } catch (e) {
      if (i >= tentativas) { throw e; }
      await dormir(1500 * i);
    }
  }
}

// Todas as tabelas de "cabeçalho → valores" de uma página de detalhe.
function tabelas(h) {
  return [...h.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) =>
    [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1])));
}
function campos(h) {
  const out = {};
  for (const linhas of tabelas(h)) {
    if (linhas.length < 2) { continue; }
    const cab = linhas[0].map(texto);
    cab.forEach((c, i) => { if (c && !(c in out)) { out[c] = linhas[1][i] ?? ''; } });
  }
  return out;
}

// Estes arquivos não ficam no histórico do repositório (seriam grandes demais todo dia): a coleta anterior
// é lida da pasta local (testes) ou, no GitHub Actions, do próprio site publicado.
const PUBLICADO = 'https://abelgomes.github.io/cml-serigy-robo/sistemas/';
async function lerAnterior(nome) {
  try { return JSON.parse(await readFile(new URL(nome, PASTA), 'utf8')); } catch { /* segue */ }
  try {
    const r = await fetch(PUBLICADO + nome, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
async function gravar(nome, dados) {
  await writeFile(new URL(nome, PASTA), JSON.stringify(dados, null, 1));
}

// ---------------------------------------------------------------- Licitações
async function licitacoes() {
  const antes = await lerAnterior('licitacoes.json');
  const cache = new Map((antes?.itens || []).map((x) => [x.id, x]));
  const h = await baixar(PORTAL + '?alias=cmlagarto&p=licitacoes');
  const itens = [];
  // Cada mês fica num bloco id='accd-AAAAM'; dentro dele, uma tabela com as licitações.
  for (const bloco of h.split(/id='accd-/).slice(1)) {
    const ano = bloco.slice(0, 4);
    for (const tr of bloco.split(/<tr>/i).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      const id = (tr.match(/p=licitacoes&i=(\d+)/) || [])[1];
      if (!id || tds.length < 6) { continue; }
      const [sigla, numero] = [texto(tds[0].split(/<br/i)[0]), texto((tds[0].match(/<strong>([\s\S]*?)<\/strong>/i) || [])[1])];
      itens.push({ id, ano: +ano, sigla, numero, objeto: texto(tds[1]), data: dataISO(tds[2]), situacao: texto(tds[3]),
        valorFinal: valorBR(tds[5]), vencedores: [...(tds[6] || '').matchAll(/<span>([\s\S]*?)<\/span>/gi)].map((s) => texto(s[1])).filter(Boolean),
        url: PORTAL + '?alias=cmlagarto&p=licitacoes&i=' + id });
    }
  }
  if (!itens.length) { throw new Error('nenhuma licitação encontrada (a página mudou?)'); }

  let lidos = 0;
  for (const it of itens.filter((x) => x.ano >= ANO_MIN)) {
    const velho = cache.get(it.id);
    if (velho && velho.modalidade && it.ano < ANO - 1 && velho.situacao === it.situacao) {
      Object.assign(it, { modalidade: velho.modalidade, valorEstimado: velho.valorEstimado, criterio: velho.criterio, publicacao: velho.publicacao, arquivos: velho.arquivos });
      continue;
    }
    const d = await baixar(it.url); lidos++;
    const c = campos(d);
    it.modalidade = texto(c['Modalidade']) || it.sigla;
    it.valorEstimado = valorBR(c['Valor Estimado']);
    it.criterio = texto(c['Critério']);
    it.publicacao = dataISO(c['Data de Publicação']);
    it.arquivos = [...d.matchAll(/href='([^']*\/upload\/licitacao\/[^']+)'[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => ({ nome: texto(m[2]), url: m[1] }))
      .filter((a, i, todos) => todos.findIndex((b) => b.url === a.url) === i);
  }
  // Fora da janela de histórico, guarda só o resumo da lista (sem detalhes).
  await gravar('licitacoes.json', { atualizado: AGORA.toISOString(), fonte: PORTAL + '?alias=cmlagarto&p=licitacoes', itens });
  return `${itens.length} licitações (${lidos} detalhes lidos agora)`;
}

// ---------------------------------------------------------------- Contratos
async function contratos() {
  const antes = await lerAnterior('contratos.json');
  const cache = new Map((antes?.itens || []).map((x) => [x.id, x]));
  const h = await baixar(PORTAL + '?alias=cmlagarto&p=contratos');
  let itens = [];
  for (const bloco of h.split(/id='accd-/).slice(1)) {
    const ano = +bloco.slice(0, 4);
    for (const tr of bloco.split(/<tr/i).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
      const id = (tr.match(/p=contratos&i=(\d+)/) || [])[1];
      if (!id || tds.length < 4) { continue; }
      const arq = (tr.match(/href='([^']*\/upload\/contrato\/[^']+)'/) || [])[1] || null;
      itens.push({ id, ano, numero: texto(tds[0]), documento: texto(tds[1]), resumo: texto(tds[2]), arquivo: arq,
        url: PORTAL + '?alias=cmlagarto&p=contratos&i=' + id });
    }
  }
  // A página da Ágape lista cada contrato duas vezes: fica uma cópia só.
  const vistos = new Set();
  itens = itens.filter((x) => (vistos.has(x.id) ? false : vistos.add(x.id)));
  if (!itens.length) { throw new Error('nenhum contrato encontrado (a página mudou?)'); }

  let lidos = 0;
  for (const it of itens.filter((x) => x.ano >= ANO_MIN)) {
    const velho = cache.get(it.id);
    if (velho && velho.fornecedor !== undefined && it.ano < ANO - 1) {
      for (const k of ['modalidade', 'situacao', 'fornecedor', 'valor', 'celebracao', 'inicio', 'fim', 'fiscais']) { it[k] = velho[k]; }
      continue;
    }
    const d = await baixar(it.url); lidos++;
    const c = campos(d);
    it.modalidade = texto(c['Modalidade']);
    it.situacao = texto(c['Situação']);
    it.fornecedor = texto(c['Fornecedor']);
    it.valor = valorBR(c['Valor do Contrato']);
    it.celebracao = dataISO(c['Data da Celebração']);
    it.inicio = dataISO(c['Ínicio do Contrato'] ?? c['Início do Contrato']);
    it.fim = dataISO(c['Validade do Contrato']);
    // Fiscais: tabela "Nome | Matrícula" (pode ter várias linhas).
    const tFiscais = tabelas(d).find((t) => t.length > 1 && texto(t[0][0]) === 'Nome' && texto(t[0][1] || '') === 'Matrícula');
    it.fiscais = tFiscais ? tFiscais.slice(1).map((l) => texto(l[0])).filter(Boolean) : [];
  }
  // Aditivos: ficam como documentos próprios, com o mesmo número do contrato original.
  itens.forEach((x) => { x.aditivo = /ADITIVO|APOSTILA/i.test(x.documento); });
  await gravar('contratos.json', { atualizado: AGORA.toISOString(), fonte: PORTAL + '?alias=cmlagarto&p=contratos', itens });
  return `${itens.length} contratos e aditivos (${lidos} detalhes lidos agora)`;
}

// ---------------------------------------------------------------- Folha de pagamento
function linhasFolha(h) {
  return h.split('<tr id="data"').slice(1).map((r) => {
    const tds = [...r.split('</tr>')[0].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .map((m) => ({ titulo: texto((m[1].match(/title="([^"]*)"/) || [])[1] || ''), t: texto(m[2]) }));
    if (tds.length < 12) { return null; }
    const v = (i) => (tds[i].titulo || tds[i].t).replace(/^-$/, '');
    return { situacao: tds[0].t, matricula: tds[1].t, nome: v(2), admissao: dataISO(tds[3].t), afastamento: dataISO(tds[4].t),
      termino: dataISO(tds[5].t), vinculo: v(6), lotacao: v(7), cargo: v(8), funcao: v(9), horas: +tds[10].t || null, salario: valorBR(tds[11].t) };
  }).filter(Boolean);
}

async function folha() {
  const resumo = [];
  for (let ano = ANO - 3; ano <= ANO; ano++) {
    const antes = await lerAnterior(`folha-${ano}.json`);
    const meses = Object.assign({}, antes?.meses || {});
    const ultimoMes = ano === ANO ? AGORA.getMonth() + 1 : 12;
    // Relê sempre os 2 meses mais recentes do ano atual (podem ser corrigidos); os outros, só se faltarem.
    for (let mes = 1; mes <= ultimoMes; mes++) {
      const recente = ano === ANO && mes >= ultimoMes - 1;
      if (meses[mes] && meses[mes].length && !recente) { continue; }
      const base = `${FOLHA}?base=587&mes=${mes}&ano=${ano}&filtrar=pesquisar`;
      const p1 = await baixar(base);
      const paginas = +((p1.match(/pagina=(\d+)[^"]*"\s+class="page-link">\s*Última/) || [])[1] || 1);
      let linhas = linhasFolha(p1);
      for (let p = 2; p <= paginas; p++) { linhas = linhas.concat(linhasFolha(await baixar(`${FOLHA}?pagina=${p}&base=587&mes=${mes}&ano=${ano}&filtrar=pesquisar`))); }
      if (linhas.length) { meses[mes] = linhas; } else { delete meses[mes]; }
    }
    await gravar(`folha-${ano}.json`, { atualizado: AGORA.toISOString(), ano, fonte: FOLHA, meses });
    resumo.push(`${ano}: ${Object.keys(meses).length} meses`);
  }
  return 'folha ' + resumo.join(', ');
}

async function main() {
  await mkdir(PASTA, { recursive: true });
  const indice = (await lerAnterior('index.json')) || { conjuntos: {} };
  indice.atualizado = AGORA.toISOString();
  let erros = 0;
  for (const [nome, fn] of Object.entries({ licitacoes, contratos, folha })) {
    try {
      const r = await fn();
      indice.conjuntos[nome] = { lidoEm: AGORA.toISOString(), resumo: r };
      console.log(`${nome.padEnd(12)} ${r}`);
    } catch (e) {
      erros++;
      // Em caso de erro, republica os arquivos da última coleta boa (as páginas seguem mostrando esses dados).
      indice.conjuntos[nome] = Object.assign({}, indice.conjuntos[nome], { erro: String(e.message || e), erroEm: AGORA.toISOString() });
      console.log(`${nome.padEnd(12)} ERRO: ${e.message || e}`);
      const arquivos = nome === 'folha' ? [0, 1, 2, 3].map((i) => `folha-${ANO - i}.json`) : [`${nome}.json`];
      for (const arq of arquivos) {
        try { await readFile(new URL(arq, PASTA)); } catch {
          const anterior = await lerAnterior(arq);
          if (anterior) { await gravar(arq, anterior); }
        }
      }
    }
  }
  await gravar('index.json', indice);
  if (erros === 3) { process.exit(1); }
}

main();
