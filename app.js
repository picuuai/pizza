'use strict';

const ARMAZENAMENTO = 'pizza-calc-v1';
const ML_POR_G_AZEITE = 1 / 0.92;
const HID_MIN = 50;
const HID_MAX = 85;

const estado = carregarEstado();

function carregarEstado() {
  const padrao = {
    receitaId: RECEITAS[0].id,
    modo: 'bolas',
    bolas: 6,
    pesoBola: 250,
    massa: 1500,
    farinha: 1000,
    hidratacoes: {}, // hidratação escolhida por receita (fração)
  };
  try {
    const salvo = JSON.parse(localStorage.getItem(ARMAZENAMENTO));
    return salvo ? { ...padrao, ...salvo } : padrao;
  } catch {
    return padrao;
  }
}

function salvarEstado() {
  try {
    localStorage.setItem(ARMAZENAMENTO, JSON.stringify(estado));
  } catch {
    // sem armazenamento (aba privada etc.): o app continua funcionando
  }
}

// ---------- Cálculo ----------

function hidratacaoDe(receita) {
  return estado.hidratacoes[receita.id] ?? receita.hidratacao;
}

function calcular(receita) {
  const h = hidratacaoDe(receita);
  const soma = 1 + h + receita.sal + receita.fermento + receita.azeite + receita.acucar;

  let farinha;
  if (estado.modo === 'bolas') farinha = (estado.bolas * estado.pesoBola) / soma;
  else if (estado.modo === 'massa') farinha = estado.massa / soma;
  else farinha = estado.farinha;
  farinha = Math.max(0, farinha || 0);

  const r = {
    hidratacao: h,
    farinha,
    agua: farinha * h,
    sal: farinha * receita.sal,
    fermento: farinha * receita.fermento,
    azeite: farinha * receita.azeite,
    acucar: farinha * receita.acucar,
    total: farinha * soma,
  };

  const peso = estado.pesoBola > 0 ? estado.pesoBola : 250;
  r.bolasInteiras = Math.floor(r.total / peso + 1e-9);
  r.sobra = r.total - r.bolasInteiras * peso;

  if (receita.biga) {
    const bigaFarinha = farinha * receita.biga.farinha;
    const bigaAgua = bigaFarinha * receita.biga.agua;
    r.biga = {
      farinha: bigaFarinha,
      agua: bigaAgua,
      fermento: r.fermento,
      peso: bigaFarinha + bigaAgua + r.fermento,
      farinhaFinal: farinha - bigaFarinha,
      aguaFinal: r.agua - bigaAgua,
    };
  }
  return r;
}

// ---------- Formatação ----------

const nf = (min, max) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
const fmt0 = nf(0, 0);
const fmt1 = nf(1, 1);
const fmt2 = nf(2, 2);
const fmtPct = nf(0, 3);

function gramas(valor, casas) {
  const f = casas === 2 ? fmt2 : casas === 1 ? fmt1 : fmt0;
  return f.format(valor) + ' g';
}

function pct(fracao) {
  return fmtPct.format(fracao * 100) + '%';
}

function lerDecimal(texto) {
  const n = parseFloat(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// ---------- Interface ----------

const $ = (sel) => document.querySelector(sel);

function receitaAtual() {
  return RECEITAS.find((r) => r.id === estado.receitaId) || RECEITAS[0];
}

function montarAbas() {
  const nav = $('#abas');
  const itens = RECEITAS.map((r) => ({ id: r.id, nome: r.nome }));
  itens.push({ id: 'comparativo', nome: 'Comparativo' });
  nav.innerHTML = '';
  for (const item of itens) {
    const a = document.createElement('a');
    a.href = '#' + item.id;
    a.className = 'aba' + (item.id === 'comparativo' ? ' aba-comparativo' : '');
    a.dataset.id = item.id;
    a.textContent = item.nome;
    nav.appendChild(a);
  }
}

function marcarAba(id) {
  const nav = $('#abas');
  for (const a of document.querySelectorAll('.aba')) {
    const ativa = a.dataset.id === id;
    a.classList.toggle('ativa', ativa);
    if (ativa) {
      a.setAttribute('aria-current', 'page');
      // rola só a barra de abas (scrollIntoView também rolaria a página)
      nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2 });
    } else {
      a.removeAttribute('aria-current');
    }
  }
}

function rota() {
  const id = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);
  if (id === 'comparativo') {
    mostrarComparativo();
    return;
  }
  if (RECEITAS.some((r) => r.id === id)) estado.receitaId = id;
  mostrarReceita();
}

function mostrarComparativo() {
  $('#tela-receita').hidden = true;
  $('#tela-comparativo').hidden = false;
  marcarAba('comparativo');
  const corpo = $('#tabela-comparativo tbody');
  corpo.innerHTML = '';
  for (const r of RECEITAS) {
    const tr = document.createElement('tr');
    const h = hidratacaoDe(r);
    const hTexto = pct(h) + (h !== r.hidratacao ? ' *' : '');
    tr.innerHTML = `
      <th scope="row"><a href="#${r.id}">${r.nome}</a><small>${r.prazo}</small></th>
      <td>${hTexto}</td>
      <td>${pct(r.sal)}</td>
      <td>${pct(r.fermento)} <span class="tag tag-${r.tipoFermento}">${r.tipoFermento}</span></td>
      <td>${pct(r.azeite)}</td>
      <td>${r.acucar ? pct(r.acucar) : '–'}</td>`;
    corpo.appendChild(tr);
  }
  salvarEstado();
}

function mostrarReceita() {
  const r = receitaAtual();
  $('#tela-comparativo').hidden = true;
  $('#tela-receita').hidden = false;
  marcarAba(r.id);
  document.title = r.nome + ' · Massa de Pizza';

  $('#nome').textContent = r.nome;
  $('#prazo').textContent = r.prazo;
  $('#metodo').textContent = 'Método: ' + r.metodo;
  const tipo = $('#tipo-fermento');
  tipo.textContent = 'Fermento ' + r.tipoFermento;
  tipo.className = 'tag tag-' + r.tipoFermento;

  $('#info-origem').textContent = r.origem;
  $('#info-obs').textContent = r.observacao;
  const fonte = $('#info-fonte');
  if (r.fonte) {
    fonte.innerHTML = '';
    const a = document.createElement('a');
    a.href = r.fonte;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = r.fonte.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48) + (r.fonte.length > 56 ? '…' : '');
    fonte.appendChild(a);
  } else {
    fonte.textContent = 'Receita informada pelo usuário';
  }

  sincronizarEntradas();
  atualizar();
}

function sincronizarEntradas() {
  for (const b of document.querySelectorAll('[data-modo]')) {
    const ativo = b.dataset.modo === estado.modo;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', ativo);
  }
  for (const p of document.querySelectorAll('[data-painel]')) {
    p.hidden = p.dataset.painel !== estado.modo;
  }
  $('#in-bolas').value = estado.bolas;
  $('#in-peso').value = estado.pesoBola;
  $('#in-massa').value = estado.massa;
  $('#in-farinha').value = estado.farinha;
  sincronizarHidratacao();
}

function sincronizarHidratacao() {
  const r = receitaAtual();
  const h = hidratacaoDe(r) * 100;
  $('#in-hid').value = fmt1.format(h);
  $('#slider-hid').value = h;
  $('#hid-padrao').textContent = fmtPct.format(r.hidratacao * 100) + '%';
  const alterada = Math.abs(hidratacaoDe(r) - r.hidratacao) > 1e-9;
  $('#bt-restaurar').hidden = !alterada;
  $('#card-hid').classList.toggle('alterada', alterada);
}

function atualizar() {
  const r = receitaAtual();
  const c = calcular(r);

  const linhas = [
    { nome: 'Farinha', pct: 1, g: gramas(c.farinha, 0), fixo: true },
    { nome: 'Água', pct: c.hidratacao, g: gramas(c.agua, 0), ajustavel: true },
    { nome: 'Sal', pct: r.sal, g: gramas(c.sal, 1), fixo: true },
    {
      nome: 'Fermento ' + r.tipoFermento,
      pct: r.fermento,
      g: gramas(c.fermento, 2),
      fixo: true,
      extra: r.tipoFermento === 'seco'
        ? `≈ ${gramas(c.fermento * 3, 2)} se usar fresco`
        : `≈ ${gramas(c.fermento / 3, 2)} se usar seco`,
    },
    { nome: 'Azeite', pct: r.azeite, g: gramas(c.azeite, 1), fixo: true, extra: `≈ ${fmt0.format(c.azeite * ML_POR_G_AZEITE)} ml` },
  ];
  if (r.acucar) linhas.push({ nome: 'Açúcar', pct: r.acucar, g: gramas(c.acucar, 1), fixo: true });

  const corpo = $('#tabela-ingredientes tbody');
  corpo.innerHTML = '';
  for (const l of linhas) {
    const tr = document.createElement('tr');
    if (l.ajustavel) tr.className = 'linha-agua';
    tr.innerHTML = `
      <th scope="row">${l.nome}${l.extra ? `<small>${l.extra}</small>` : ''}</th>
      <td class="pct">${l.fixo ? '<span class="cadeado" aria-label="fixo" title="Percentual fixo">🔒</span>' : ''}${pct(l.pct)}</td>
      <td class="g">${l.g}</td>`;
    corpo.appendChild(tr);
  }

  $('#total').textContent = gramas(c.total, 0);
  const peso = estado.pesoBola > 0 ? estado.pesoBola : 250;
  let bolasTexto = `${c.bolasInteiras} × ${fmt0.format(peso)} g`;
  if (estado.modo !== 'bolas' && c.sobra >= 1) bolasTexto += ` (sobra ${gramas(c.sobra, 0)})`;
  $('#bolas-resultado').textContent = bolasTexto;

  const aviso = $('#aviso-fermento');
  aviso.hidden = !(c.fermento > 0 && c.fermento < 1);

  const cardBiga = $('#card-biga');
  cardBiga.hidden = !c.biga;
  if (c.biga) {
    $('#biga-farinha').textContent = gramas(c.biga.farinha, 0);
    $('#biga-agua').textContent = gramas(c.biga.agua, 0);
    $('#biga-fermento').textContent = gramas(c.biga.fermento, 2);
    $('#biga-peso').textContent = gramas(c.biga.peso, 0);
    $('#final-farinha').textContent = gramas(c.biga.farinhaFinal, 0);
    $('#final-agua').textContent = gramas(c.biga.aguaFinal, 0);
    $('#final-sal').textContent = gramas(c.sal, 1);
    $('#final-azeite').textContent = gramas(c.azeite, 1);
    $('#biga-pct-farinha').textContent = pct(r.biga.farinha);
    $('#biga-pct-agua').textContent = pct(r.biga.agua);
  }

  salvarEstado();
}

function definirHidratacao(percentual) {
  if (!Number.isFinite(percentual)) return;
  const h = Math.min(HID_MAX, Math.max(HID_MIN, Math.round(percentual * 10) / 10));
  const r = receitaAtual();
  if (Math.abs(h / 100 - r.hidratacao) < 1e-9) delete estado.hidratacoes[r.id];
  else estado.hidratacoes[r.id] = h / 100;
  sincronizarHidratacao();
  atualizar();
}

function ligarEventos() {
  window.addEventListener('hashchange', rota);

  for (const b of document.querySelectorAll('[data-modo]')) {
    b.addEventListener('click', () => {
      // ao trocar de modo, mantém a mesma quantidade de massa já calculada
      const c = calcular(receitaAtual());
      estado.massa = Math.round(c.total);
      estado.farinha = Math.round(c.farinha);
      estado.modo = b.dataset.modo;
      sincronizarEntradas();
      atualizar();
    });
  }

  const numerico = (sel, chave, min) => {
    $(sel).addEventListener('input', (e) => {
      const n = e.target.valueAsNumber;
      if (Number.isFinite(n) && n >= min) {
        estado[chave] = n;
        atualizar();
      }
    });
    $(sel).addEventListener('blur', (e) => {
      e.target.value = estado[chave];
    });
  };
  numerico('#in-bolas', 'bolas', 1);
  numerico('#in-peso', 'pesoBola', 1);
  numerico('#in-massa', 'massa', 0);
  numerico('#in-farinha', 'farinha', 0);

  for (const b of document.querySelectorAll('[data-passo]')) {
    b.addEventListener('click', () => {
      const [chave, passo] = b.dataset.passo.split(':');
      const min = chave === 'bolas' ? 1 : 10;
      estado[chave] = Math.max(min, (Number(estado[chave]) || 0) + Number(passo));
      sincronizarEntradas();
      atualizar();
    });
  }

  $('#slider-hid').addEventListener('input', (e) => definirHidratacao(Number(e.target.value)));
  $('#in-hid').addEventListener('change', (e) => definirHidratacao(lerDecimal(e.target.value)));
  $('#in-hid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });
  $('#hid-menos').addEventListener('click', () => definirHidratacao(hidratacaoDe(receitaAtual()) * 100 - 0.5));
  $('#hid-mais').addEventListener('click', () => definirHidratacao(hidratacaoDe(receitaAtual()) * 100 + 0.5));
  $('#bt-restaurar').addEventListener('click', () => definirHidratacao(receitaAtual().hidratacao * 100));

  configurarTelaAcesa();
}

// Mantém a tela do celular acesa enquanto pesa os ingredientes
function configurarTelaAcesa() {
  const bt = $('#bt-tela');
  if (!('wakeLock' in navigator)) return;
  bt.hidden = false;
  let trava = null;
  let querAcesa = false;

  const pedir = async () => {
    try {
      trava = await navigator.wakeLock.request('screen');
      trava.addEventListener('release', () => {
        trava = null;
        render();
      });
    } catch {
      querAcesa = false;
    }
    render();
  };
  const render = () => {
    const ativa = Boolean(trava);
    bt.classList.toggle('ativo', ativa);
    bt.setAttribute('aria-pressed', ativa);
    bt.title = ativa ? 'Tela ficará acesa (toque para desligar)' : 'Manter tela acesa';
  };

  bt.addEventListener('click', async () => {
    querAcesa = !trava;
    if (trava) await trava.release();
    else await pedir();
  });
  document.addEventListener('visibilitychange', () => {
    if (querAcesa && !trava && document.visibilityState === 'visible') pedir();
  });
  render();
}

montarAbas();
ligarEventos();
if (!location.hash) history.replaceState(null, '', '#' + estado.receitaId);
rota();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
