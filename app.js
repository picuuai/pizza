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

  // Pré-fermento (biga/poolish): sua água é fixa; a hidratação escolhida só muda a água da massa final
  const pf = receita.prefermento;
  if (pf) {
    r.pfFarinha = farinha * pf.farinha;
    r.pfAgua = r.pfFarinha * pf.agua;
    r.pfPeso = r.pfFarinha + r.pfAgua + r.fermento;
    r.finFarinha = farinha - r.pfFarinha;
    r.finAgua = r.agua - r.pfAgua;
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

// ---------- Ilustrações das etapas ----------

const ICONES = {
  balanca: '<rect x="7" y="22" width="34" height="18" rx="4"/><rect x="15" y="27" width="18" height="7" rx="1.5"/><path d="M11 22c0-6 6-10 13-10s13 4 13 10"/>',
  tigela: '<path d="M6 22h36c0 10-8 18-18 18S6 32 6 22z"/><path d="M33 5l-9 17"/><path d="M12 22c2-4 6-6 10-6"/>',
  sova: '<path d="M8 38c0-9 7-15 16-15s16 6 16 15z"/><path d="M14 16a12 12 0 0 1 20 0"/><path d="M31 11l3 5-6 1"/>',
  dobra: '<rect x="9" y="18" width="30" height="20" rx="6"/><path d="M14 22c3-9 17-9 20 0"/><path d="M31 15l3 6-6 1"/>',
  pote: '<path d="M14 9h20v4l3 4v21a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V17l3-4z"/><path d="M11 24h26"/><circle cx="19" cy="31" r="2"/><circle cx="27" cy="35" r="1.5"/><circle cx="29" cy="29" r="2.5"/>',
  relogio: '<circle cx="24" cy="26" r="15"/><path d="M24 17v9l6 4"/><path d="M20 6h8"/>',
  geladeira: '<rect x="12" y="5" width="24" height="38" rx="3"/><path d="M12 18h24M17 10v4M17 23v7"/><path d="M28 30l2-2m0 0l2 2m-2-2v6"/>',
  bolas: '<ellipse cx="13" cy="31" rx="8" ry="6"/><ellipse cx="35" cy="31" rx="8" ry="6"/><ellipse cx="24" cy="22" rx="8" ry="6"/><path d="M3 39h42"/>',
  abrir: '<ellipse cx="24" cy="27" rx="17" ry="10"/><ellipse cx="24" cy="27" rx="12" ry="6"/><path d="M2 27h3M43 27h3M24 8v6M21 11l3 3 3-3"/>',
  forno: '<path d="M6 41V29a18 18 0 0 1 36 0v12z"/><path d="M15 41v-8a9 9 0 0 1 18 0v8"/><path d="M21 39c0-3 3-4 3-7 0 3 3 4 3 7"/><path d="M3 41h42"/>',
  termometro: '<path d="M21 8a3 3 0 0 1 6 0v20a7 7 0 1 1-6 0z"/><circle cx="24" cy="34" r="3"/><path d="M24 31V15M30 12h4M30 18h4M30 24h4"/>',
  dedo: '<ellipse cx="24" cy="36" rx="17" ry="7"/><path d="M21 33V12a3 3 0 0 1 6 0v21"/><path d="M15 30c3 2 15 2 18 0"/>',
};

function icone(nome) {
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${ICONES[nome] || ICONES.tigela}</svg>`;
}

function figura(chave, classe) {
  const f = FOTOS[chave];
  if (!f) return '';
  return `<figure class="${classe}">
    <img src="${f.url}" alt="${f.alt}" loading="lazy" onerror="this.closest('figure').hidden=true">
    <figcaption>Foto: <a href="${f.pagina}" target="_blank" rel="noopener">${f.autor}</a> · ${f.licenca} · Wikimedia Commons</figcaption>
  </figure>`;
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
  else if (id) history.replaceState(null, '', '#' + receitaAtual().id);
  mostrarReceita();
}

function mostrarComparativo() {
  $('#tela-receita').hidden = true;
  $('#tela-comparativo').hidden = false;
  marcarAba('comparativo');
  document.title = 'Comparativo · Massa de Pizza';
  const corpo = $('#tabela-comparativo tbody');
  corpo.innerHTML = '';
  for (const r of RECEITAS) {
    const tr = document.createElement('tr');
    const h = hidratacaoDe(r);
    const hTexto = pct(h) + (h !== r.hidratacao ? ' *' : '');
    tr.innerHTML = `
      <th scope="row"><a href="#${r.id}">${r.nome}</a><small>${r.prazo}</small></th>
      <td>${r.metodo}</td>
      <td>${hTexto}</td>
      <td>${pct(r.sal)}</td>
      <td>${pct(r.fermento)} <span class="tag tag-${r.tipoFermento}">${r.tipoFermento}</span></td>
      <td>${pct(r.azeite)}</td>`;
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

  $('#capa').innerHTML = figura(r.foto, 'capa');
  $('#nome').textContent = r.nome;
  $('#resumo').textContent = r.resumo;
  $('#prazo').textContent = r.prazo;
  $('#metodo').textContent = 'Método: ' + r.metodo;
  const tipo = $('#tipo-fermento');
  tipo.textContent = 'Fermento ' + r.tipoFermento;
  tipo.className = 'tag tag-' + r.tipoFermento;

  $('#linha-tempo').innerHTML = r.linhaTempo.map((t) => `<li>${t}</li>`).join('');
  $('#dicas').innerHTML = r.dicas.map((d) => `<li>${d}</li>`).join('');
  $('#fontes').innerHTML = r.fontes
    .map((f) => `<li><a href="${f.url}" target="_blank" rel="noopener">${f.nome}</a></li>`)
    .join('');

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
  const pf = r.prefermento;
  $('#hid-nota').textContent = pf
    ? `A água do ${pf.nome.toLowerCase()} é fixa (${pct(pf.agua)} da farinha dele); mudar a hidratação altera só a água da massa final.`
    : '';
}

// Linhas da tabela de ingredientes de cada etapa
function ingredientesDaFase(r, c, tipo) {
  const fermentoExtra = r.tipoFermento === 'seco'
    ? `≈ ${gramas(c.fermento * 3, 2)} se usar fresco`
    : `≈ ${gramas(c.fermento / 3, 2)} se usar seco`;
  const fermento = { nome: 'Fermento ' + r.tipoFermento, g: gramas(c.fermento, 2), extra: fermentoExtra };
  const azeite = { nome: 'Azeite', nota: pct(r.azeite), g: gramas(c.azeite, 1), extra: `≈ ${fmt0.format(c.azeite * ML_POR_G_AZEITE)} ml` };
  const sal = { nome: 'Sal', nota: pct(r.sal), g: gramas(c.sal, 1) };
  const acucar = r.acucar ? [{ nome: 'Açúcar', nota: pct(r.acucar), g: gramas(c.acucar, 1) }] : [];
  const pf = r.prefermento;

  if (tipo === 'prefermento') {
    return [
      { nome: 'Farinha', nota: `${pct(pf.farinha)} do total`, g: gramas(c.pfFarinha, 0) },
      { nome: 'Água', nota: `${pct(pf.agua)} da farinha`, g: gramas(c.pfAgua, 0) },
      { ...fermento, nota: `${pct(pf.fermento)} da farinha` },
    ];
  }
  if (tipo === 'final') {
    return [
      { nome: pf.rotulo, nota: 'da etapa 1', g: gramas(c.pfPeso, 0) },
      { nome: 'Farinha', nota: 'restante', g: gramas(c.finFarinha, 0) },
      { nome: 'Água', nota: 'restante', g: gramas(c.finAgua, 0), agua: true },
      sal,
      azeite,
      ...acucar,
    ];
  }
  return [
    { nome: 'Farinha', nota: '100%', g: gramas(c.farinha, 0) },
    { nome: 'Água', nota: pct(c.hidratacao), g: gramas(c.agua, 0), agua: true },
    sal,
    { ...fermento, nota: pct(r.fermento) },
    azeite,
    ...acucar,
  ];
}

function tabelaIngredientes(linhas) {
  const corpo = linhas.map((l) => `
    <tr${l.agua ? ' class="linha-agua"' : ''}>
      <th scope="row">${l.nome}${l.extra ? `<small>${l.extra}</small>` : ''}</th>
      <td class="pct">${l.nota}</td>
      <td class="g">${l.g}</td>
    </tr>`).join('');
  return `<table class="tabela">
    <thead><tr><th scope="col">Ingrediente</th><th scope="col" class="pct">Proporção</th><th scope="col" class="g">Quantidade</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>`;
}

// Valores que entram no texto do modo de preparo
function valoresDoTexto(r, c) {
  const v = {
    farinha: gramas(c.farinha, 0),
    agua: gramas(c.agua, 0),
    sal: gramas(c.sal, 1),
    fermento: gramas(c.fermento, 2),
    azeite: gramas(c.azeite, 1),
    azeiteMl: fmt0.format(c.azeite * ML_POR_G_AZEITE) + ' ml',
    agua90: gramas(c.agua * 0.9, 0),
    aguaResto: gramas(c.agua - Math.round(c.agua * 0.9), 0),
    bolas: String(estado.modo === 'bolas' ? estado.bolas : c.bolasInteiras),
    pesoBola: gramas(estado.pesoBola, 0),
  };
  if (r.prefermento) {
    const parte = Math.round(c.finAgua * 2 / 3);
    Object.assign(v, {
      pfFarinha: gramas(c.pfFarinha, 0),
      pfAgua: gramas(c.pfAgua, 0),
      finFarinha: gramas(c.finFarinha, 0),
      finAgua: gramas(c.finAgua, 0),
      finAgua23: gramas(parte, 0),
      finAguaResto: gramas(c.finAgua - parte, 0),
    });
  }
  return v;
}

function preencher(texto, v) {
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in v ? `<strong>${v[k]}</strong>` : m));
}

function renderFases(r, c) {
  const v = valoresDoTexto(r, c);
  $('#fases').innerHTML = r.fases.map((fase) => `
    <section class="card fase">
      <header class="fase-topo">
        <h3>${fase.titulo}</h3>
        ${fase.quando ? `<span class="quando">${fase.quando}</span>` : ''}
      </header>
      ${tabelaIngredientes(ingredientesDaFase(r, c, fase.ingredientes))}
      <h4 class="modo-titulo">Modo de fazer</h4>
      <ol class="passos">
        ${fase.passos.map((p) => `
          <li class="passo">
            <div class="passo-icone">${icone(p.icone)}</div>
            <div class="passo-corpo">
              <div class="passo-topo">
                <strong>${p.titulo}</strong>
                ${p.tempo ? `<span class="tempo">${p.tempo}</span>` : ''}
              </div>
              <p>${preencher(p.texto, v)}</p>
              ${p.foto ? figura(p.foto, 'foto-passo') : ''}
            </div>
          </li>`).join('')}
      </ol>
    </section>`).join('');
}

function atualizar() {
  const r = receitaAtual();
  const c = calcular(r);

  $('#total').textContent = gramas(c.total, 0);
  const peso = estado.pesoBola > 0 ? estado.pesoBola : 250;
  let bolasTexto = `${c.bolasInteiras} × ${fmt0.format(peso)} g`;
  if (estado.modo !== 'bolas' && c.sobra >= 1) bolasTexto += ` (sobra ${gramas(c.sobra, 0)})`;
  $('#bolas-resultado').textContent = bolasTexto;
  $('#farinha-total').textContent = gramas(c.farinha, 0);
  $('#agua-total').textContent = gramas(c.agua, 0);
  $('#aviso-fermento').hidden = !(c.fermento > 0 && c.fermento < 1);

  renderFases(r, c);
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
if (!location.hash) history.replaceState(null, '', '#' + receitaAtual().id);
rota();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
