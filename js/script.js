/* Resumo Diário — atualização e filtros em memória.
 * REFERENCIA aceita YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, números seriais Excel e ISO com horário.
 * Semana = ISO 8601 (segunda a domingo). Filtros combinados por interseção.
 */
const URL_DADOS = './Dados/DadosJson.json';
const INTERVALO_ATUALIZACAO_MS = 60_000;
const el = id => document.getElementById(id);
const fmt = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const controles = { parceira: 'f-parceira', ano: 'f-ano', mes: 'f-mes', semana: 'f-semana', dia: 'f-dia' };
let registrosOriginais = [];
let primeiraCarga = true;
let geracaoConsulta = 0;
// Cada filtro armazena um conjunto de opções; vazio significa "Todas".
const selecoes = Object.fromEntries(Object.keys(controles).map(chave => [chave, new Set()]));
let filtroAberto = null;

function dataValida(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

function interpretarData(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  if ((typeof valor === 'number' && Number.isFinite(valor)) || (typeof valor === 'string' && /^\d{5}(?:\.\d+)?$/.test(valor.trim()))) {
    // Datas numéricas exportadas do Excel: dias desde 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(valor)) * 86400000);
    return dataValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s.*)?$/);
  if (m) return dataValida(+m[3], +m[2], +m[1]);
  return null;
}

function semanaISO(data) {
  if (!data) return null;
  const d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - inicioAno) / 86400000) + 1) / 7);
}

function interpretarRegistro(item) {
  const texto = campo => String(item[campo] ?? '').trim();
  const status = texto('STATUS').toUpperCase();
  const referencia = interpretarData(item.REFERENCIA);
  return {
    parceira: texto('PARCEIRA') || 'NÃO INFORMADA',
    pep: texto('PEP') || '—', status: status || 'NÃO INFORMADO',
    motivo: texto('MOTIVO / OBSERVAÇÃO') || '—', tipo: texto('TIPO') || '—',
    referencia,
    ano: referencia ? +referencia.slice(0,4) : null,
    mes: referencia ? +referencia.slice(5,7) : null,
    semana: semanaISO(referencia),
    executada: ['EXEC','EXECUTADA','EXECUTADO','CONCLUÍDA','CONCLUIDA','CONCLUÍDO','CONCLUIDO'].includes(status)
  };
}

// Dentro de um filtro, as opções selecionadas são combinadas por OU.
// Entre filtros diferentes, aplica-se E (interseção).
function combina(registro) {
  return (!selecoes.parceira.size || selecoes.parceira.has(registro.parceira))
    && (!selecoes.ano.size || selecoes.ano.has(String(registro.ano)))
    && (!selecoes.mes.size || selecoes.mes.has(String(registro.mes)))
    && (!selecoes.semana.size || selecoes.semana.has(String(registro.semana)))
    && (!selecoes.dia.size || selecoes.dia.has(registro.referencia));
}

function resumoSelecao(chave, lista, formatar) {
  const escolhidos = lista.filter(v => selecoes[chave].has(String(v)));
  if (!escolhidos.length) return ({parceira:'Todas as parceiras',ano:'Todos os anos',mes:'Todos os meses',semana:'Todas as semanas',dia:'Todos os dias'})[chave];
  if (escolhidos.length === 1) return formatar(escolhidos[0]);
  return `${escolhidos.length} selecionados`;
}

function fecharMenus() {
  Object.keys(controles).forEach(chave => {
    const menu = el(`options-${chave}`);
    menu.hidden = true;
    el(controles[chave]).setAttribute('aria-expanded', 'false');
  });
  filtroAberto = null;
}

function alternarMenu(chave) {
  const deveAbrir = filtroAberto !== chave;
  fecharMenus();
  if (deveAbrir) {
    el(`options-${chave}`).hidden = false;
    el(controles[chave]).setAttribute('aria-expanded','true');
    filtroAberto = chave;
  }
}

function atualizarOpcoes(chave, lista, formatar) {
  const selecionados = selecoes[chave];
  const validos = new Set(lista.map(String));
  // Uma atualização do JSON só elimina escolhas que deixaram de existir na fonte.
  for (const valor of selecionados) if (!validos.has(valor)) selecionados.delete(valor);
  const menu = el(`options-${chave}`).querySelector('.multi-items');
  const fragmento = document.createDocumentFragment();
  for (const valor of lista) {
    const texto = formatar(valor);
    const item = document.createElement('label');
    item.className = 'multi-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(valor);
    checkbox.checked = selecionados.has(String(valor));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selecionados.add(checkbox.value);
      else selecionados.delete(checkbox.value);
      atualizarFiltros();
      renderizar();
    });
    const span = document.createElement('span');
    span.textContent = texto;
    item.append(checkbox, span);
    fragmento.append(item);
  }
  if (!lista.length) {
    const aviso = document.createElement('span');
    aviso.className = 'multi-empty';
    aviso.textContent = 'Sem opções disponíveis';
    fragmento.append(aviso);
  }
  menu.replaceChildren(fragmento);
  const trigger = el(controles[chave]);
  trigger.querySelector('.multi-text').textContent = resumoSelecao(chave,lista,formatar);
  trigger.classList.toggle('has-selection',selecionados.size > 0);
  trigger.disabled = lista.length === 0;
  if (trigger.disabled && filtroAberto === chave) fecharMenus();
}

function atualizarFiltros() {
  // Opções independentes: selecionar vários anos, meses, parceiras, semanas e dias
  // não apaga escolhas de outros campos. A interseção só ocorre na apuração.
  const parceiros = [...new Set(registrosOriginais.map(r => r.parceira))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  const anos = [...new Set(registrosOriginais.map(r => r.ano).filter(Number.isInteger))].sort((a,b) => b-a);
  const meses = [...new Set(registrosOriginais.map(r => r.mes).filter(Number.isInteger))].sort((a,b) => a-b);
  const semanas = [...new Set(registrosOriginais.map(r => r.semana).filter(Number.isInteger))].sort((a,b) => a-b);
  const dias = [...new Set(registrosOriginais.map(r => r.referencia).filter(Boolean))].sort();
  atualizarOpcoes('parceira', parceiros, v => v);
  atualizarOpcoes('ano', anos, v => String(v));
  atualizarOpcoes('mes', meses, v => MESES[v-1]);
  atualizarOpcoes('semana', semanas, v => `Semana ${String(v).padStart(2,'0')}`);
  atualizarOpcoes('dia', dias, v => v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4));
}

function formatarData(d) { return d ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4) : null; }

function renderizar() {
  const registros = registrosOriginais.filter(r => combina(r));
  const total = registros.length;
  const executadas = registros.filter(r => r.executada).length;
  const pendentes = total - executadas;
  const percentual = total ? Math.round(100 * executadas / total) : 0;
  const datas = [...new Set(registros.map(r => r.referencia).filter(Boolean))].sort();
  const algumFiltro = Object.keys(controles).some(k => selecoes[k].size > 0);
  const semData = registros.filter(r => !r.referencia).length;
  el('previstas').textContent = fmt(total);
  el('executadas').textContent = fmt(executadas);
  el('naoexecutadas').textContent = fmt(pendentes);
  el('aderencia').textContent = percentual+'%';
  el('pctpendentes').textContent = (total ? Math.round(100 * pendentes / total) : 0)+'%';
  el('total-table').textContent = 'TOTAL: '+fmt(total);
  el('total-chart').textContent = 'TOTAL: '+fmt(total);
  el('donut-count').textContent = fmt(executadas);
  el('donut-percent').textContent = percentual+'%';
  el('donut').style.setProperty('--pct', percentual+'%');
  el('l-exec').textContent = fmt(executadas);
  el('l-pend').textContent = fmt(pendentes);
  el('summary').textContent = total === 0 ? 'Nenhuma obra encontrada para os filtros selecionados.' :
    pendentes === 0 ? 'Todas as obras do período foram concluídas.' :
    `${executadas} de ${total} obras do período foram concluídas.`;
  const umaData = datas.length === 1 && semData === 0;
  el('date').textContent = umaData ? formatarData(datas[0]) : (datas.length ? 'PERÍODO' : 'SEM DATA');
  el('weekday').textContent = umaData ? new Date(datas[0]+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase() : (datas.length ? `${formatarData(datas[0])} A ${formatarData(datas.at(-1))}` : 'REFERÊNCIA NÃO INFORMADA');
  el('filter-result').textContent = `${total} ${total === 1 ? 'obra encontrada' : 'obras encontradas'}${algumFiltro ? ' · filtros ativos' : ' · visão geral'}`;
  el('rows').innerHTML = registros.length ? registros.map(r => `<tr>
    <td class="parceira">${esc(r.parceira)}</td>
    <td class="pep">${esc(r.pep)}</td>
    <td><span class="status" style="${r.executada ? '' : 'background:#ffedf0;color:#ba2033'}">${esc(r.status)}</span></td>
    <td class="${r.motivo === '—' ? 'empty' : ''}">${esc(r.motivo)}</td>
    <td class="type">${esc(r.tipo)}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhuma obra encontrada para os filtros.</td></tr>';
  el('data-status').classList.remove('error');
  const invalidos = registrosOriginais.filter(r => !r.referencia).length;
  el('data-status').textContent = `Fonte: Dados/DadosJson.json${invalidos ? ` · ${invalidos} registro(s) sem REFERENCIA válida` : ''}`;
  el('last-check').textContent = 'JSON consultado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  primeiraCarga = false;
}

async function atualizarDados() {
  const minhaConsulta = ++geracaoConsulta;
  try {
    const resposta = await fetch(URL_DADOS+'?_='+Date.now(), {cache:'no-store'});
    if (!resposta.ok) throw new Error('HTTP '+resposta.status);
    const fonte = await resposta.json();
    const lista = Array.isArray(fonte) ? fonte : fonte?.obras;
    if (!Array.isArray(lista)) throw new Error('O JSON deve ser uma lista ou conter obras: [...].');
    if (minhaConsulta !== geracaoConsulta) return;
    registrosOriginais = lista.map(interpretarRegistro);
    atualizarFiltros();
    renderizar();
  } catch (erro) {
    if (minhaConsulta !== geracaoConsulta) return;
    console.error('Erro ao consultar o JSON:', erro);
    el('data-status').classList.add('error');
    el('data-status').textContent = primeiraCarga ?
      'Não foi possível carregar o JSON. Abra via GitHub Pages ou servidor HTTP local.' :
      'Falha na consulta ao JSON. Últimos dados válidos mantidos.';
    el('last-check').textContent = 'Erro na atualização';
  }
}

Object.entries(controles).forEach(([chave,id]) => {
  el(id).addEventListener('click', () => alternarMenu(chave));
  el(`options-${chave}`).querySelector('.multi-clear').addEventListener('click', () => {
    selecoes[chave].clear();
    atualizarFiltros();
    renderizar();
  });
});
document.addEventListener('click', evento => {
  if (!evento.target.closest('.multi-filter')) fecharMenus();
});
document.addEventListener('keydown', evento => {
  if (evento.key === 'Escape') fecharMenus();
});
el('clear-filters').addEventListener('click', () => {
  Object.values(selecoes).forEach(conjunto => conjunto.clear());
  fecharMenus();
  atualizarFiltros();
  renderizar();
});

function resize() {
  const escala = Math.min(innerWidth / 1600, innerHeight / 900);
  const slide = el('slide');
  slide.style.transform = `scale(${escala})`;
  slide.style.left = ((innerWidth - 1600 * escala) / 2)+'px';
  slide.style.top = ((innerHeight - 900 * escala) / 2)+'px';
}
addEventListener('resize',resize);
resize();
atualizarDados();
setInterval(atualizarDados,INTERVALO_ATUALIZACAO_MS);
