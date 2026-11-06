/* Resumo Diário — atualização e filtros em memória.
 * REFERENCIA aceita YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD e datas ISO com horário.
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

function dataValida(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

function interpretarData(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    // Datas numéricas exportadas do Excel: dias desde 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    return dataValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (m) return dataValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
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

function valorFiltro(chave) { return el(controles[chave]).value; }
function combina(registro, ignorar = '') {
  const f = Object.fromEntries(Object.keys(controles).map(k => [k, valorFiltro(k)]));
  return (!f.parceira || ignorar === 'parceira' || registro.parceira === f.parceira)
    && (!f.ano || ignorar === 'ano' || String(registro.ano) === f.ano)
    && (!f.mes || ignorar === 'mes' || String(registro.mes) === f.mes)
    && (!f.semana || ignorar === 'semana' || String(registro.semana) === f.semana)
    && (!f.dia || ignorar === 'dia' || registro.referencia === f.dia);
}

function atualizarOpcoes(chave, lista, formatar) {
  const select = el(controles[chave]);
  const anterior = select.value;
  const titulo = {parceira:'Todas as parceiras', ano:'Todos os anos', mes:'Todos os meses', semana:'Todas as semanas', dia:'Todos os dias'}[chave];
  select.replaceChildren(new Option(titulo,''));
  lista.forEach(v => select.add(new Option(formatar(v), String(v))));
  if (lista.some(v => String(v) === anterior)) select.value = anterior;
  else select.value = '';
  select.disabled = lista.length === 0;
}

function atualizarFiltros() {
  // Dependências em cascata: parceiro > ano > mês > semana > dia.
  const parceiros = [...new Set(registrosOriginais.map(r => r.parceira))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  atualizarOpcoes('parceira', parceiros, v => v);
  let elegiveis = registrosOriginais.filter(r => !valorFiltro('parceira') || r.parceira === valorFiltro('parceira'));
  const anos = [...new Set(elegiveis.map(r => r.ano).filter(Number.isInteger))].sort((a,b) => b-a);
  atualizarOpcoes('ano', anos, v => String(v));
  elegiveis = elegiveis.filter(r => !valorFiltro('ano') || String(r.ano) === valorFiltro('ano'));
  const meses = [...new Set(elegiveis.map(r => r.mes).filter(Number.isInteger))].sort((a,b) => a-b);
  atualizarOpcoes('mes', meses, v => MESES[v-1]);
  elegiveis = elegiveis.filter(r => !valorFiltro('mes') || String(r.mes) === valorFiltro('mes'));
  const semanas = [...new Set(elegiveis.map(r => r.semana).filter(Number.isInteger))].sort((a,b) => a-b);
  atualizarOpcoes('semana', semanas, v => `Semana ${String(v).padStart(2,'0')}`);
  elegiveis = elegiveis.filter(r => !valorFiltro('semana') || String(r.semana) === valorFiltro('semana'));
  const dias = [...new Set(elegiveis.map(r => r.referencia).filter(Boolean))].sort();
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
  const algumFiltro = Object.keys(controles).some(k => valorFiltro(k));
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
  el(id).addEventListener('change', () => {
    atualizarFiltros();
    renderizar();
  });
});
el('clear-filters').addEventListener('click', () => {
  Object.values(controles).forEach(id => { el(id).value = ''; });
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
