'use strict';

const ARMAZENAMENTO = 'pizza-calc-v1';
const ML_POR_G_AZEITE = 1 / 0.92;
const HID_MIN = 50;
const HID_MAX = 85;
// Aquecimento que a sova dá à massa (°C), para o cálculo da temperatura da água
const FRICCAO = { mao: 4, batedeira: 12 };
const PREVISAO_VALIDADE_MS = 3 * 3600 * 1000;

const estado = carregarEstado();

function carregarEstado() {
  const padrao = {
    receitaId: RECEITAS[0].id,
    bolas: 6,
    pesoBola: 250,
    hidratacoes: {}, // hidratação escolhida por receita (fração)
    fermentoTipo: 'fresco', // 'fresco' | 'seco' (instantâneo)
    farinhaTipo: 'italiana',
    farinhaW: 280,
    tempCozinha: 22,
    tempFonte: 'manual', // 'manual' | 'previsao'
    previsao: null, // { lat, lon, em, atual, horas: [ms], temps: [°C] }
    sova: 'mao',
    forno: 'pedra',
    assarEm: null, // horário escolhido para assar (ms)
    livre: { util: ['18:00', '23:00'], fds: ['08:00', '23:00'] },
    alertas: false,
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

// ---------- Temperatura ----------

// Temperatura da cozinha usada nos cálculos: digitada ou média da previsão durante a fermentação
function temperaturaAmbiente() {
  const p = estado.previsao;
  if (estado.tempFonte !== 'previsao' || !p) return estado.tempCozinha;
  const [ini, fim] = janelaFermentacao(receitaAtual());
  const temps = p.horas
    .map((h, i) => (h >= ini - 1800000 && h <= fim ? p.temps[i] : null))
    .filter((t) => t != null);
  const media = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : p.atual;
  return Math.round(media * 2) / 2;
}

// A fermentação dobra de velocidade a cada ~10 °C: ajusta a dose para a temperatura da cozinha
function fatorTemperatura(receita) {
  if (!receita.tempRef) return 1;
  const t = Math.min(35, Math.max(10, temperaturaAmbiente()));
  return Math.min(2.5, Math.max(0.35, 2 ** ((receita.tempRef - t) / 10)));
}

// Temperatura da água para a massa terminar na temperatura desejada (fórmula da padaria):
// água = n × massa desejada − farinha − ambiente − sova (− pré-fermento, na massa final)
function tempAgua(receita, fase) {
  const t = temperaturaAmbiente();
  const friccao = fase.semSova ? 0 : FRICCAO[estado.sova] ?? FRICCAO.mao;
  if (fase.ingredientes === 'final' && receita.prefermento) {
    const tpf = receita.prefermento.temp ?? t;
    return 4 * fase.ddt - t - t - tpf - friccao;
  }
  return 3 * fase.ddt - t - t - friccao;
}

function textoTempAgua(graus) {
  if (graus < 2) return '~2 °C (água com gelo)';
  if (graus < 8) return `${fmt0.format(graus)} °C (gelada)`;
  if (graus > 38) return '38 °C (morna; não passe disso)';
  return `${fmt0.format(graus)} °C`;
}

const grausC = (t) => fmt1Opcional.format(t) + ' °C';

function fornoAtual() {
  return FORNOS.find((f) => f.id === estado.forno) || FORNOS[0];
}

// ---------- Farinha e fermento ----------

// Fermento da receita convertido para o tipo escolhido e ajustado à temperatura (fração da farinha)
function fermentoDe(receita) {
  let f = receita.fermento * fatorTemperatura(receita);
  if (receita.tipoFermento !== estado.fermentoTipo) {
    f = estado.fermentoTipo === 'seco' ? f / FRESCO_POR_SECO : f * FRESCO_POR_SECO;
  }
  return f;
}

// Água que a farinha absorve bem, pela força W (valores indicativos)
function hidratacaoMaxima(w) {
  if (w < 200) return 0.58;
  if (w < 240) return 0.60;
  if (w < 280) return 0.63;
  if (w < 320) return 0.67;
  if (w < 360) return 0.70;
  return 0.75;
}

// Padrão da receita, limitado ao que a farinha escolhida aguenta
function hidratacaoPadrao(receita) {
  return Math.min(receita.hidratacao, hidratacaoMaxima(estado.farinhaW));
}

function hidratacaoDe(receita) {
  return estado.hidratacoes[receita.id] ?? hidratacaoPadrao(receita);
}

function avaliarFarinha(receita) {
  const w = estado.farinhaW;
  const [a, b] = receita.wIdeal;
  if (w < receita.wMin) return 'fraca';
  if (w < a) return 'atencao';
  if (w > b + 40) return 'forte';
  return 'ok';
}

const ROTULO_COMPAT = {
  ok: 'Farinha adequada',
  atencao: 'Farinha no limite',
  fraca: 'Farinha fraca para esta receita',
  forte: 'Farinha mais forte que o necessário',
};

// ---------- Cálculo ----------

function calcular(receita) {
  const h = hidratacaoDe(receita);
  const fermento = fermentoDe(receita);
  const soma = 1 + h + receita.sal + fermento + receita.azeite + receita.acucar;

  // Farinha calculada para chegar exatamente em bolas × peso
  const farinha = Math.max(0, (estado.bolas * estado.pesoBola) / soma || 0);

  const r = {
    hidratacao: h,
    farinha,
    agua: farinha * h,
    sal: farinha * receita.sal,
    fermentoExato: farinha * fermento,
    azeite: farinha * receita.azeite,
    acucar: farinha * receita.acucar,
    total: farinha * soma,
  };
  // Dose para pesar: arredondada para 1; 1,5; 2 g… (a balança de casa não pesa menos que isso)
  r.fermento = arredondarFermento(r.fermentoExato);
  r.fermentoOutro = arredondarFermento(
    estado.fermentoTipo === 'seco' ? r.fermentoExato * FRESCO_POR_SECO : r.fermentoExato / FRESCO_POR_SECO
  );

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
const fmt1Opcional = nf(0, 1);

function gramas(valor, casas) {
  const f = casas === 2 ? fmt2 : casas === 1 ? fmt1 : fmt0;
  return f.format(valor) + ' g';
}

// Fermento em passos de 0,5 g, nunca menos que 1 g
function arredondarFermento(g) {
  return g > 0 ? Math.max(1, Math.round(g * 2) / 2) : 0;
}

function gramasFermento(valor) {
  return fmt1Opcional.format(valor) + ' g';
}

function pct(fracao) {
  return fmtPct.format(fracao * 100) + '%';
}

function lerDecimal(texto) {
  const n = parseFloat(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

const nomeFermento = (tipo) => (tipo === 'seco' ? 'fermento seco instantâneo' : 'fermento fresco');

function semHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<br\s*\/?>/g, '\n');
  return d.textContent.replace(/[ \t]+/g, ' ').trim();
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

function montarMenu() {
  const nav = $('#abas');
  nav.innerHTML = RECEITAS.map((r) => `
    <a href="#${r.id}" class="aba" data-id="${r.id}">
      <span class="aba-nome">${r.nome}</span>
      <span class="aba-prazo">${r.curto}</span>
      <i class="compat-ponto" aria-hidden="true"></i>
    </a>`).join('') + `
    <a href="#comparativo" class="aba aba-comparativo" data-id="comparativo">
      <span class="aba-nome">Comparativo</span>
      <span class="aba-prazo">todas as receitas</span>
    </a>`;

  $('#sel-farinha').innerHTML = FARINHAS.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('');
  $('#sel-forno').innerHTML = FORNOS.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('');
}

// Bolinha de compatibilidade da farinha em cada item do menu
function marcarCompatMenu() {
  for (const a of document.querySelectorAll('.aba[data-id]')) {
    const r = RECEITAS.find((x) => x.id === a.dataset.id);
    const ponto = a.querySelector('.compat-ponto');
    if (!r || !ponto) continue;
    const s = avaliarFarinha(r);
    ponto.className = 'compat-ponto compat-' + s;
    a.title = `${r.nome}: ${ROTULO_COMPAT[s].toLowerCase()} (W ${estado.farinhaW})`;
  }
}

function marcarAba(id) {
  const nav = $('#abas');
  for (const a of document.querySelectorAll('.aba')) {
    const ativa = a.dataset.id === id;
    a.classList.toggle('ativa', ativa);
    if (ativa) {
      a.setAttribute('aria-current', 'page');
      // rola só a barra do menu (scrollIntoView também rolaria a página)
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
  $('#comp-fermento').textContent = 'Fermento ' + (estado.fermentoTipo === 'seco' ? 'seco' : 'fresco');
  $('#comp-farinha').textContent = `Sua farinha (W ${estado.farinhaW})`;
  const corpo = $('#tabela-comparativo tbody');
  corpo.innerHTML = '';
  for (const r of RECEITAS) {
    const tr = document.createElement('tr');
    const h = hidratacaoDe(r);
    const hTexto = pct(h) + (r.id in estado.hidratacoes ? ' *' : '');
    const s = avaliarFarinha(r);
    tr.innerHTML = `
      <th scope="row"><a href="#${r.id}">${r.nome}</a><small>${r.prazo}</small></th>
      <td>${r.metodo}</td>
      <td>${hTexto}</td>
      <td>${pct(r.sal)}</td>
      <td>${pct(fermentoDe(r))}</td>
      <td>${r.azeite ? pct(r.azeite) : '–'}</td>
      <td><span class="compat-ponto compat-${s}"></span> W ${r.wIdeal[0]}–${r.wIdeal[1]}</td>`;
    corpo.appendChild(tr);
  }
  marcarCompatMenu();
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
  $('#azeite-tag').textContent = r.azeite ? `Com azeite ${pct(r.azeite)}` : 'Sem azeite';

  $('#linha-tempo').innerHTML = r.linhaTempo.map((t) => `<li>${t}</li>`).join('');
  $('#dicas').innerHTML = r.dicas.map((d) => `<li>${d}</li>`).join('');
  $('#fontes').innerHTML = r.fontes
    .map((f) => `<li><a href="${f.url}" target="_blank" rel="noopener">${f.nome}</a></li>`)
    .join('');
  $('#nota-azeite').hidden = !r.azeite;

  sincronizarEntradas();
  atualizar();
}

function sincronizarEntradas() {
  for (const b of document.querySelectorAll('[data-fermento]')) {
    const ativo = b.dataset.fermento === estado.fermentoTipo;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', ativo);
  }
  for (const b of document.querySelectorAll('[data-sova]')) {
    const ativo = b.dataset.sova === estado.sova;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', ativo);
  }
  $('#in-bolas').value = estado.bolas;
  $('#in-peso').value = estado.pesoBola;
  $('#sel-farinha').value = estado.farinhaTipo;
  $('#in-w').value = estado.farinhaW;
  $('#sel-forno').value = estado.forno;
  const f = FARINHAS.find((x) => x.id === estado.farinhaTipo);
  $('#farinha-dica').textContent = f ? f.dica : '';
  sincronizarPlanoEntradas();
}

function sincronizarHidratacao() {
  const r = receitaAtual();
  const atual = hidratacaoDe(r);
  const padrao = hidratacaoPadrao(r);
  const max = hidratacaoMaxima(estado.farinhaW);
  $('#in-hid').value = fmt1.format(atual * 100);
  $('#slider-hid').value = atual * 100;

  let texto = `Padrão da receita: <strong>${pct(r.hidratacao)}</strong>`;
  if (padrao < r.hidratacao - 1e-9) {
    texto += ` · ajustado para <strong>${pct(padrao)}</strong> porque farinha W ${estado.farinhaW} absorve até ~${pct(max)}`;
  }
  texto += '. Os outros percentuais são fixos.';
  if (r.notaHidratacao) texto += ' ' + r.notaHidratacao;
  const pf = r.prefermento;
  if (pf) {
    const de = pf.artigo === 'a' ? 'da' : 'do';
    const dele = pf.artigo === 'a' ? 'dela' : 'dele';
    texto += ` A água ${de} ${pf.nome.toLowerCase()} é fixa (${pct(pf.agua)} da farinha ${dele}); mudar a hidratação altera só a água da massa final.`;
  }
  $('#hid-texto').innerHTML = texto;

  const alterada = r.id in estado.hidratacoes;
  $('#bt-restaurar').hidden = !alterada;
  $('#card-hid').classList.toggle('alterada', alterada);
  const acima = atual > max + 1e-9;
  $('#aviso-hid').hidden = !acima;
  $('#aviso-hid').textContent = acima
    ? `Acima do recomendado para farinha W ${estado.farinhaW} (até ~${pct(max)}): a massa tende a ficar mole, grudenta e difícil de abrir.`
    : '';
}

// Análise da farinha escolhida para a receita, com o que fazer para manter a qualidade
function renderCompat(r, c) {
  const w = estado.farinhaW;
  const [a, b] = r.wIdeal;
  const s = avaliarFarinha(r);
  const max = hidratacaoMaxima(w);
  let html = `<strong class="compat-titulo"><span class="compat-ponto compat-${s}"></span>${ROTULO_COMPAT[s]}</strong>`;

  if (s === 'ok') {
    html += `<p>W ${w} está na faixa ideal (W ${a}–${b}) para esta fermentação.</p>`;
  } else if (s === 'atencao') {
    html += `<p>W ${w} está abaixo do ideal (W ${a}–${b}), mas funciona. Mantenha a hidratação até ~${pct(max)} e observe a massa: se amolecer ou grudar demais, encurte a fermentação das bolas.</p>`;
  } else if (s === 'forte') {
    html += `<p>W ${w} é mais forte que o necessário (ideal W ${a}–${b}): a massa fica mais elástica e pode encolher ao abrir. Deixe as bolas descansarem bem antes de abrir; se quiser, aumente a hidratação até ~${pct(max)}.</p>`;
  } else {
    html += `<p>W ${w} é fraca para esta fermentação (mínimo ~W ${r.wMin}, ideal W ${a}–${b}): a massa tende a amolecer, rasgar e perder o gás antes do fim.</p><ul>`;
    const p = (a - w) / (W_MANITOBA - w);
    if (p > 0 && p <= 0.6) {
      const g = c.farinha * p;
      html += `<li><strong>Reforce com Manitoba:</strong> use ~${fmt0.format(p * 100)}% de Manitoba na farinha — ≈ ${gramas(g, 0)} de Manitoba + ${gramas(c.farinha - g, 0)} da sua farinha (valor aproximado).</li>`;
    }
    const alternativas = RECEITAS.filter((x) => x.id !== r.id && w >= x.wMin);
    if (alternativas.length) {
      html += `<li><strong>Ou escolha uma receita adequada:</strong> ${alternativas.map((x) => `<a href="#${x.id}">${x.nome}</a>`).join(', ')}.</li>`;
    } else {
      html += '<li><strong>Nenhuma receita longa combina com essa farinha sozinha.</strong> Com W abaixo de ~200 ela aguenta só fermentações curtas (3–5 h): reforce com Manitoba ou troque por uma farinha mais forte.</li>';
    }
    html += '</ul>';
  }
  $('#compat').className = 'compat compat-box-' + s;
  $('#compat').innerHTML = html;

  const outro = estado.fermentoTipo === 'seco' ? 'fresco' : 'seco instantâneo';
  $('#dose-fermento').innerHTML =
    `Nesta receita: <strong>${gramasFermento(c.fermento)}</strong> de ${nomeFermento(estado.fermentoTipo)} ` +
    `(se usar ${outro}: ${gramasFermento(c.fermentoOutro)}).`;
}

// Cartão "Sua cozinha": de onde vem a temperatura, água de cada etapa e ajuste do fermento
function renderCozinha(r) {
  const t = temperaturaAmbiente();
  $('#in-temp').value = fmt1Opcional.format(t).replace(',', '.');
  const p = estado.previsao;
  let info;
  if (estado.tempFonte === 'previsao' && p) {
    const [ini, fim] = janelaFermentacao(r);
    const quando = (ms) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
    info = `Previsão para a sua localização: agora ${grausC(p.atual)}; média de <strong>${grausC(t)}</strong> entre ${quando(ini)} e ${quando(fim)}, período desta massa. ` +
      'Dentro de casa a temperatura costuma variar menos que lá fora: se a sua cozinha for mais quente ou mais fria, ajuste o número.';
  } else {
    info = 'Temperatura digitada por você. Toque em "Usar previsão" para pegar a previsão do tempo da sua cidade para o período da fermentação.';
  }
  $('#temp-info').innerHTML = info;

  const aguas = r.fases.map((f) => `${r.fases.length > 1 ? f.titulo.replace(/^Etapa \d · /, '') + ': ' : ''}<strong>${textoTempAgua(tempAgua(r, f))}</strong>`);
  $('#agua-info').innerHTML = 'Água: ' + aguas.join(' · ');

  const fator = fatorTemperatura(r);
  let fermentoTexto;
  if (!r.tempRef) {
    fermentoTexto = r.geladeira
      ? 'Nesta receita a fermentação principal é na geladeira, então a dose de fermento não muda com a temperatura da cozinha — só a temperatura da água.'
      : 'Nesta receita a biga fermenta a 18 °C controlados, então a dose de fermento não muda com a temperatura da cozinha.';
  } else if (Math.abs(fator - 1) < 0.05) {
    fermentoTexto = `Dose de fermento pensada para ~${grausC(r.tempRef)}: sem ajuste para a sua cozinha.`;
  } else {
    fermentoTexto = `Dose de fermento ajustada de ~${grausC(r.tempRef)} para ${grausC(t)}: ${fmt2.format(fator)}× a dose original ` +
      `(${fator < 1 ? 'mais quente, fermenta mais rápido — menos fermento' : 'mais frio, fermenta mais devagar — mais fermento'}).`;
  }
  $('#fermento-temp').textContent = fermentoTexto;
  const btPrev = $('#bt-previsao');
  btPrev.classList.toggle('ativo', estado.tempFonte === 'previsao');
}

// Linhas da tabela de ingredientes de cada etapa
function ingredientesDaFase(r, c, fase) {
  const outro = estado.fermentoTipo === 'seco' ? 'fresco' : 'seco';
  const fermento = {
    nome: 'Fermento ' + (estado.fermentoTipo === 'seco' ? 'seco' : 'fresco'),
    g: gramasFermento(c.fermento),
    extra: `≈ ${gramasFermento(c.fermentoOutro)} se usar ${outro}`,
  };
  const aguaExtra = `a ${textoTempAgua(tempAgua(r, fase))}`;
  const azeite = r.azeite
    ? [{ nome: 'Azeite', nota: pct(r.azeite), g: gramas(c.azeite, 1), extra: `≈ ${fmt0.format(c.azeite * ML_POR_G_AZEITE)} ml` }]
    : [];
  const sal = { nome: 'Sal', nota: pct(r.sal), g: gramas(c.sal, 1) };
  const acucar = r.acucar ? [{ nome: 'Açúcar', nota: pct(r.acucar), g: gramas(c.acucar, 1) }] : [];
  const pf = r.prefermento;

  if (fase.ingredientes === 'prefermento') {
    return [
      { nome: 'Farinha', nota: `${pct(pf.farinha)} do total`, g: gramas(c.pfFarinha, 0) },
      { nome: 'Água', nota: `${pct(pf.agua)} da farinha`, g: gramas(c.pfAgua, 0), extra: aguaExtra },
      { ...fermento, nota: `${pct(c.fermentoExato / c.pfFarinha || 0)} da farinha` },
    ];
  }
  if (fase.ingredientes === 'final') {
    return [
      { nome: pf.rotulo, nota: 'da etapa 1', g: gramas(c.pfPeso, 0) },
      { nome: 'Farinha', nota: 'restante', g: gramas(c.finFarinha, 0) },
      { nome: 'Água', nota: 'restante', g: gramas(c.finAgua, 0), agua: true, extra: aguaExtra },
      sal,
      ...azeite,
      ...acucar,
    ];
  }
  return [
    { nome: 'Farinha', nota: '100%', g: gramas(c.farinha, 0) },
    { nome: 'Água', nota: pct(c.hidratacao), g: gramas(c.agua, 0), agua: true, extra: aguaExtra },
    sal,
    { ...fermento, nota: pct(fermentoDe(r)) },
    ...azeite,
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
  const forte = (t) => `<strong>${t}</strong>`;
  const fermento = gramasFermento(c.fermento);
  const agua90 = gramas(c.agua * 0.9, 0);
  const v = {
    farinha: gramas(c.farinha, 0),
    agua: gramas(c.agua, 0),
    sal: gramas(c.sal, 1),
    fermento,
    azeite: gramas(c.azeite, 1),
    azeiteMl: fmt0.format(c.azeite * ML_POR_G_AZEITE) + ' ml',
    agua90,
    aguaResto: gramas(c.agua - Math.round(c.agua * 0.9), 0),
    bolas: String(estado.bolas),
    pesoBola: gramas(estado.pesoBola, 0),
    tempCozinha: grausC(temperaturaAmbiente()),
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
  for (const k in v) v[k] = forte(v[k]);
  // Lista do que pesar: "X de farinha, Y de água, ... e Z de azeite"
  const itens = [
    `${v.farinha} de farinha`,
    `${v.agua} de água`,
    `${v.sal} de sal`,
    `${v.fermento} de ${nomeFermento(estado.fermentoTipo)}`,
  ];
  if (r.azeite) itens.push(`${v.azeite} de azeite`);
  if (r.acucar) itens.push(`${forte(gramas(c.acucar, 1))} de açúcar`);
  v.listaPesagem = itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  // Trechos de texto (já formatados) que dependem do fermento e do forno escolhidos
  v.fermentoNome = nomeFermento(estado.fermentoTipo);
  v.fermentoDissolver = estado.fermentoTipo === 'seco'
    ? `Misture ${forte(fermento)} de fermento seco instantâneo em ${forte(agua90)} de água.`
    : `Esfarele ${forte(fermento)} de fermento fresco em ${forte(agua90)} de água e mexa até dissolver.`;
  v.instrucaoForno = fornoAtual().texto;
  return v;
}

// Valores que mudam em cada etapa (temperatura da água e da massa)
function valoresDaFase(r, fase, v) {
  return {
    ...v,
    tempAgua: `<strong>${textoTempAgua(tempAgua(r, fase))}</strong>`,
    ddt: `<strong>${grausC(fase.ddt)}</strong>`,
  };
}

function preencher(texto, v) {
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

function renderFases(r, c) {
  const v = valoresDoTexto(r, c);
  $('#fases').innerHTML = r.fases.map((fase) => {
    const vf = valoresDaFase(r, fase, v);
    return `
    <section class="card fase">
      <header class="fase-topo">
        <h3>${fase.titulo}</h3>
        ${fase.quando ? `<span class="quando">${fase.quando}</span>` : ''}
      </header>
      ${tabelaIngredientes(ingredientesDaFase(r, c, fase))}
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
              <p>${preencher(p.texto, vf)}</p>
              ${p.foto ? figura(p.foto, 'foto-passo') : ''}
            </div>
          </li>`).join('')}
      </ol>
    </section>`;
  }).join('');
}

function atualizar() {
  const r = receitaAtual();
  const c = calcular(r);

  sincronizarHidratacao();
  renderCompat(r, c);
  renderCozinha(r);
  marcarCompatMenu();

  $('#total').textContent = gramas(c.total, 0);
  $('#bolas-resultado').textContent = `${estado.bolas} × ${fmt0.format(estado.pesoBola)} g`;
  $('#farinha-total').textContent = gramas(c.farinha, 0);
  $('#agua-total').textContent = gramas(c.agua, 0);
  // Arredondar a dose só muda o resultado em fermentação à temperatura ambiente;
  // na geladeira 1–2 g é a prática comum, então não há aviso
  const fator = c.fermentoExato > 0 ? c.fermento / c.fermentoExato : 1;
  const aviso = $('#aviso-fermento');
  aviso.hidden = r.geladeira || fator < 1.5;
  if (!aviso.hidden) {
    const solucao = gramas(c.fermentoExato * 100, 0);
    aviso.innerHTML =
      `Dose arredondada de ${fmt2.format(c.fermentoExato)} g para <strong>${gramasFermento(c.fermento)}</strong>. ` +
      'Como esta fermentação é em temperatura ambiente, a massa pode ficar pronta antes: comece a conferir pelo teste do dedo mais cedo. ' +
      `<br>Se quiser a dose exata: dissolva 1 g de fermento em 100 g de água e use ${solucao} dessa mistura, tirando ${solucao} da água da receita.`;
  }

  renderFases(r, c);
  renderPlano(r, c);
  salvarEstado();
}

function definirHidratacao(percentual) {
  if (!Number.isFinite(percentual)) return;
  const h = Math.min(HID_MAX, Math.max(HID_MIN, Math.round(percentual * 10) / 10));
  const r = receitaAtual();
  if (Math.abs(h / 100 - hidratacaoPadrao(r)) < 0.0005) delete estado.hidratacoes[r.id];
  else estado.hidratacoes[r.id] = h / 100;
  atualizar();
}

// ---------- Previsão do tempo (Open-Meteo, sem cadastro) ----------

async function buscarPrevisao(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast?current=temperature_2m&hourly=temperature_2m' +
    `&forecast_days=7&timezone=GMT&latitude=${lat}&longitude=${lon}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('previsão indisponível');
  const d = await resp.json();
  estado.previsao = {
    lat,
    lon,
    em: Date.now(),
    atual: d.current.temperature_2m,
    horas: d.hourly.time.map((t) => Date.parse(t + 'Z')),
    temps: d.hourly.temperature_2m,
  };
}

async function usarPrevisao() {
  const bt = $('#bt-previsao');
  if (!('geolocation' in navigator)) {
    alert('Este aparelho não informa a localização. Digite a temperatura da cozinha.');
    return;
  }
  bt.disabled = true;
  bt.textContent = 'Buscando…';
  try {
    const pos = await new Promise((ok, erro) =>
      navigator.geolocation.getCurrentPosition(ok, erro, { timeout: 15000, maximumAge: 3600000 })
    );
    // 2 casas decimais (~1 km) bastam para a previsão e preservam a privacidade
    await buscarPrevisao(pos.coords.latitude.toFixed(2), pos.coords.longitude.toFixed(2));
    estado.tempFonte = 'previsao';
    atualizar();
  } catch {
    alert('Não foi possível obter a previsão (localização negada ou sem internet). Digite a temperatura da cozinha.');
  } finally {
    bt.disabled = false;
    bt.textContent = 'Usar previsão';
  }
}

// Atualiza a previsão guardada se ela tiver mais de 3 h
async function renovarPrevisao() {
  const p = estado.previsao;
  if (estado.tempFonte !== 'previsao' || !p || Date.now() - p.em < PREVISAO_VALIDADE_MS) return;
  try {
    await buscarPrevisao(p.lat, p.lon);
    atualizar();
  } catch {
    // sem internet: segue com a previsão antiga
  }
}

// ---------- Compartilhar e imprimir ----------

function textoReceita() {
  const r = receitaAtual();
  const c = calcular(r);
  const v = valoresDoTexto(r, c);
  const linhas = [
    `🍕 ${r.nome} — ${estado.bolas} bolas de ${fmt0.format(estado.pesoBola)} g (massa total ${gramas(c.total, 0)})`,
    `Hidratação ${pct(c.hidratacao)} · farinha W ${estado.farinhaW} · ${nomeFermento(estado.fermentoTipo)} · cozinha a ${grausC(temperaturaAmbiente())}`,
    `Forno: ${fornoAtual().nome}`,
  ];
  for (const fase of r.fases) {
    const vf = valoresDaFase(r, fase, v);
    linhas.push('', `*${fase.titulo}*${fase.quando ? ` (${fase.quando})` : ''}`);
    for (const l of ingredientesDaFase(r, c, fase)) {
      linhas.push(`• ${l.nome}: ${l.g}${l.extra ? ` (${l.extra})` : ''}`);
    }
    linhas.push('Modo de fazer:');
    fase.passos.forEach((p, i) => linhas.push(`${i + 1}. ${p.titulo}: ${semHtml(preencher(p.texto, vf))}`));
  }
  const plano = textoPlano();
  if (plano) linhas.push('', '*Horários*', plano);
  linhas.push('', location.href.split('#')[0] + '#' + r.id);
  return linhas.join('\n');
}

async function compartilhar() {
  const texto = textoReceita();
  const titulo = receitaAtual().nome + ' · Massa de Pizza';
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    alert('Receita copiada. Agora é só colar no WhatsApp ou onde quiser.');
  } catch {
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }
}

// ---------- Eventos ----------

function ligarEventos() {
  window.addEventListener('hashchange', rota);

  for (const b of document.querySelectorAll('[data-fermento]')) {
    b.addEventListener('click', () => {
      estado.fermentoTipo = b.dataset.fermento;
      sincronizarEntradas();
      atualizar();
    });
  }
  for (const b of document.querySelectorAll('[data-sova]')) {
    b.addEventListener('click', () => {
      estado.sova = b.dataset.sova;
      sincronizarEntradas();
      atualizar();
    });
  }

  $('#sel-farinha').addEventListener('change', (e) => {
    const f = FARINHAS.find((x) => x.id === e.target.value);
    estado.farinhaTipo = f.id;
    estado.farinhaW = f.w;
    sincronizarEntradas();
    atualizar();
  });
  $('#sel-forno').addEventListener('change', (e) => {
    estado.forno = e.target.value;
    atualizar();
  });

  const MINIMOS = { bolas: 1, pesoBola: 1, farinhaW: 100, tempCozinha: 5 };
  const numerico = (sel, chave, aoMudar) => {
    $(sel).addEventListener('input', (e) => {
      const n = e.target.valueAsNumber;
      if (Number.isFinite(n) && n >= MINIMOS[chave]) {
        estado[chave] = n;
        if (aoMudar) aoMudar();
        atualizar();
      }
    });
    $(sel).addEventListener('blur', (e) => {
      e.target.value = chave === 'tempCozinha' ? temperaturaAmbiente() : estado[chave];
    });
  };
  numerico('#in-bolas', 'bolas');
  numerico('#in-peso', 'pesoBola');
  numerico('#in-w', 'farinhaW');
  numerico('#in-temp', 'tempCozinha', () => { estado.tempFonte = 'manual'; });

  for (const b of document.querySelectorAll('[data-passo]')) {
    b.addEventListener('click', () => {
      const [chave, passo] = b.dataset.passo.split(':');
      if (chave === 'tempCozinha') {
        // ajustar à mão a partir do valor mostrado (que pode vir da previsão)
        estado.tempCozinha = Math.min(40, Math.max(5, temperaturaAmbiente() + Number(passo)));
        estado.tempFonte = 'manual';
      } else {
        const min = chave === 'bolas' ? 1 : Math.max(10, MINIMOS[chave]);
        estado[chave] = Math.max(min, (Number(estado[chave]) || 0) + Number(passo));
      }
      sincronizarEntradas();
      atualizar();
    });
  }

  $('#bt-previsao').addEventListener('click', usarPrevisao);
  $('#bt-compartilhar').addEventListener('click', compartilhar);
  $('#bt-imprimir').addEventListener('click', () => window.print());

  $('#slider-hid').addEventListener('input', (e) => definirHidratacao(Number(e.target.value)));
  $('#in-hid').addEventListener('change', (e) => definirHidratacao(lerDecimal(e.target.value)));
  $('#in-hid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });
  $('#hid-menos').addEventListener('click', () => definirHidratacao(hidratacaoDe(receitaAtual()) * 100 - 0.5));
  $('#hid-mais').addEventListener('click', () => definirHidratacao(hidratacaoDe(receitaAtual()) * 100 + 0.5));
  $('#bt-restaurar').addEventListener('click', () => {
    delete estado.hidratacoes[receitaAtual().id];
    atualizar();
  });

  ligarEventosPlano();
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

// Começa depois que todos os scripts (inclusive o planejador) foram carregados
document.addEventListener('DOMContentLoaded', () => {
  montarMenu();
  ligarEventos();
  if (!location.hash) history.replaceState(null, '', '#' + receitaAtual().id);
  rota();
  renovarPrevisao();
  retomarAlertas();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache: 'none' faz o navegador sempre conferir se o sw.js mudou
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
