/* Fonte única de dados: Dados/DadosJson.json (mantida separada do HTML). */
const URL_DADOS = './Dados/DadosJson.json';
const INTERVALO_ATUALIZACAO_MS = 60_000;
const el = id => document.getElementById(id);
const fmt = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let primeiraCarga = true;

function interpretarRegistro(item) {
  const texto = campo => String(item[campo] ?? '').trim();
  const status = texto('STATUS').toUpperCase();
  return {
    parceira: texto('PARCEIRA') || '—',
    pep: texto('PEP') || '—',
    status: status || 'NÃO INFORMADO',
    motivo: texto('MOTIVO / OBSERVAÇÃO') || '—',
    tipo: texto('TIPO') || '—',
    executada: ['EXEC', 'EXECUTADA', 'EXECUTADO', 'CONCLUÍDA', 'CONCLUIDA', 'CONCLUÍDO', 'CONCLUIDO'].includes(status)
  };
}

function dataDeReferencia(fonte) {
  // O JSON fornecido é uma lista sem campo de data. Não confundir data de acesso
  // com a data real de execução das obras.
  const valor = Array.isArray(fonte) ? null : (fonte.dataReferencia || fonte.data || null);
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return null;
  const d = new Date(String(valor) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function renderizar(fonte) {
  // Aceita a lista atual e também o formato futuro {dataReferencia, obras:[...]}.
  const lista = Array.isArray(fonte) ? fonte : fonte?.obras;
  if (!Array.isArray(lista)) throw new Error('O JSON deve conter uma lista de obras.');
  const registros = lista.map(interpretarRegistro);
  const total = registros.length;
  const executadas = registros.filter(r => r.executada).length;
  const pendentes = total - executadas;
  const percentual = total ? Math.round(100 * executadas / total) : 0;
  const referencia = dataDeReferencia(fonte);

  el('previstas').textContent = fmt(total);
  el('executadas').textContent = fmt(executadas);
  el('naoexecutadas').textContent = fmt(pendentes);
  el('aderencia').textContent = percentual + '%';
  el('pctpendentes').textContent = (total ? Math.round(100 * pendentes / total) : 0) + '%';
  el('total-table').textContent = 'TOTAL: ' + fmt(total);
  el('total-chart').textContent = 'TOTAL: ' + fmt(total);
  el('donut-count').textContent = fmt(executadas);
  el('donut-percent').textContent = percentual + '%';
  el('donut').style.setProperty('--pct', percentual + '%');
  el('l-exec').textContent = fmt(executadas);
  el('l-pend').textContent = fmt(pendentes);
  el('summary').textContent = total === 0 ? 'Nenhuma obra cadastrada no JSON.' :
    pendentes === 0 ? 'Todas as obras cadastradas foram concluídas.' :
    `${executadas} de ${total} obras cadastradas foram concluídas.`;
  el('date').textContent = referencia ? referencia.toLocaleDateString('pt-BR') : 'SEM DATA';
  el('weekday').textContent = referencia ? referencia.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase() : 'REFERÊNCIA NÃO INFORMADA';

  el('rows').innerHTML = registros.length ? registros.map(r => `<tr>
    <td class="parceira">${esc(r.parceira)}</td>
    <td class="pep">${esc(r.pep)}</td>
    <td><span class="status" style="${r.executada ? '' : 'background:#ffedf0;color:#ba2033'}">${esc(r.status)}</span></td>
    <td class="${r.motivo === '—' ? 'empty' : ''}">${esc(r.motivo)}</td>
    <td class="type">${esc(r.tipo)}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhuma obra disponível.</td></tr>';

  el('data-status').classList.remove('error');
  el('data-status').textContent = 'Dados carregados de Dados/DadosJson.json' + (referencia ? '' : ' · Sem data de referência na fonte');
  el('last-check').textContent = 'JSON consultado às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  primeiraCarga = false;
}

async function atualizarDados() {
  try {
    const resposta = await fetch(URL_DADOS + '?_=' + Date.now(), {cache:'no-store'});
    if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
    const dados = await resposta.json();
    renderizar(dados);
  } catch (erro) {
    console.error('Erro ao consultar o JSON:', erro);
    el('data-status').classList.add('error');
    el('data-status').textContent = primeiraCarga
      ? 'Não foi possível carregar o JSON. Abra via GitHub Pages ou um servidor HTTP local.'
      : 'Falha na consulta ao JSON. Últimos dados válidos mantidos.';
    el('last-check').textContent = 'Erro na atualização';
  }
}

function resize() {
  const escala = Math.min(innerWidth / 1600, innerHeight / 900);
  const slide = el('slide');
  slide.style.transform = `scale(${escala})`;
  slide.style.left = ((innerWidth - 1600 * escala) / 2) + 'px';
  slide.style.top = ((innerHeight - 900 * escala) / 2) + 'px';
}
addEventListener('resize', resize);
resize();
atualizarDados();
setInterval(atualizarDados, INTERVALO_ATUALIZACAO_MS);
