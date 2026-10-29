'use strict';

// ---------- Planejador de horários ----------
// Monta o cronograma de trás para frente a partir do horário de assar. As etapas com mão na
// massa são encaixadas nos horários livres (em dia útil, só depois do trabalho); as esperas
// (fermentação, geladeira) usam a folga da faixa de tempo de cada passo para isso.
// Usa os campos `ativo` (minutos de mão na massa) e `espera` ([mín, máx] horas) dos passos.

const MIN = 60000;
const HORA = 3600000;
const PASSO_BUSCA_H = 0.25; // procura encaixes de 15 em 15 min
const DIAS_BUSCA = 14;
let cachePlano = { chave: '', plano: null };
let timersAlertas = [];

function minutosDoDia(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function janelaLivre(data) {
  const dia = data.getDay();
  const [a, b] = dia === 0 || dia === 6 ? estado.livre.fds : estado.livre.util;
  return [minutosDoDia(a), minutosDoDia(b)];
}

// O intervalo [ini, fim] cabe inteiro no horário livre do dia?
function cabeNoLivre(ini, fim) {
  const d = new Date(ini);
  const [a, b] = janelaLivre(d);
  const inicio = d.getHours() * 60 + d.getMinutes();
  return inicio >= a && inicio + (fim - ini) / MIN <= b;
}

// Agrupa passos seguidos sem espera entre eles: são feitos de uma vez só
function blocosDaReceita(r) {
  const blocos = [];
  let atual = null;
  for (const fase of fasesDe(r)) {
    for (const passo of fase.passos) {
      if (!atual) atual = { passos: [], ativo: 0, espera: [0, 0] };
      atual.passos.push({ passo, fase, offset: atual.ativo });
      atual.ativo += passo.ativo || 0;
      if (passo.espera && passo.espera[1] > 0) {
        atual.espera = passo.espera;
        blocos.push(atual);
        atual = null;
      }
    }
  }
  if (atual) blocos.push(atual);
  return blocos;
}

function planejar(r, assar) {
  const blocos = blocosDaReceita(r);
  const ultimo = blocos[blocos.length - 1];
  const passoAssar = ultimo.passos.find((x) => x.passo.assar);
  ultimo.inicio = assar - (passoAssar ? passoAssar.offset : ultimo.ativo) * MIN;
  ultimo.esperaH = 0;
  ultimo.conflito = !cabeNoLivre(ultimo.inicio, assar + 15 * MIN);

  for (let i = blocos.length - 2; i >= 0; i--) {
    const b = blocos[i];
    const proximo = blocos[i + 1].inicio;
    const [lo, hi] = b.espera;
    const pref = (lo + hi) / 2;
    const candidatos = [];
    for (let e = lo; e <= hi + 1e-9; e += PASSO_BUSCA_H) candidatos.push(e);
    candidatos.sort((x, y) => Math.abs(x - pref) - Math.abs(y - pref));
    const duracao = Math.max(b.ativo, 1) * MIN;
    // início arredondado para baixo em múltiplos de 5 min (horários fáceis de seguir)
    const inicioCom = (e) => Math.floor((proximo - e * HORA - b.ativo * MIN) / (5 * MIN)) * 5 * MIN;
    const encaixe = candidatos.find((e) => {
      const ini = inicioCom(e);
      return cabeNoLivre(ini, ini + duracao);
    });
    b.conflito = encaixe === undefined;
    b.inicio = inicioCom(encaixe ?? pref);
    b.esperaH = (proximo - b.inicio) / HORA - b.ativo / 60;
  }

  const ligarForno = assar - fornoAtual().preaquecer * MIN;
  const fornoConflito = !cabeNoLivre(ligarForno, ligarForno + MIN);
  return {
    assar,
    blocos,
    ligarForno,
    fornoConflito,
    inicio: Math.min(blocos[0].inicio, ligarForno),
    conflitos: blocos.filter((b) => b.conflito).length + (fornoConflito ? 1 : 0),
  };
}

// Primeiro horário de assar, a partir de agora, em que tudo cabe nos horários livres
function proximoHorario(r) {
  const agora = Date.now();
  const t = new Date(agora);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 30) * 30);
  let reserva = null;
  for (let ms = t.getTime(); ms < agora + DIAS_BUSCA * 24 * HORA; ms += 30 * MIN) {
    if (!cabeNoLivre(ms, ms + 15 * MIN)) continue;
    const p = planejar(r, ms);
    if (p.inicio < agora) continue;
    if (p.conflitos === 0) return ms;
    if (reserva === null) reserva = ms;
  }
  return reserva ?? t.getTime() + 24 * HORA;
}

function horarioAssar(r) {
  if (!estado.assarEm || estado.assarEm < Date.now()) estado.assarEm = proximoHorario(r);
  return estado.assarEm;
}

function planoDe(r) {
  const assar = horarioAssar(r);
  const chave = [r.id, assar, JSON.stringify(estado.livre), estado.forno, estado.autolise, estado.sova, hidratacaoDe(r)].join('|');
  if (cachePlano.chave !== chave) cachePlano = { chave, plano: planejar(r, assar) };
  return cachePlano.plano;
}

// Período em que esta massa está fermentando (usado na média da previsão do tempo)
function janelaFermentacao(r) {
  const p = planoDe(r);
  return [p.inicio, p.assar];
}

// ---------- Eventos do cronograma ----------

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtQuando = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function duracaoTexto(horas) {
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function eventosDoPlano(r, p, c) {
  const v = valoresDoTexto(r, c);
  const texto = (x) => semHtml(preencher(x.passo.texto, valoresDaFase(r, x.fase, v)));
  const eventos = [];
  for (const b of p.blocos) {
    const titulos = b.passos.map((x) => x.passo.titulo);
    eventos.push({
      tipo: 'acao',
      ini: b.inicio,
      fim: b.inicio + Math.max(b.ativo, 5) * MIN,
      ativo: b.ativo,
      titulo: titulos.join(' → '),
      detalhe: b.passos.map((x) => `${x.passo.titulo}: ${texto(x)}`).join('\n\n'),
      conflito: b.conflito,
    });
    if (b.esperaH > 0) {
      const ini = b.inicio + b.ativo * MIN;
      eventos.push({
        tipo: 'espera',
        ini,
        fim: ini + b.esperaH * HORA,
        titulo: b.passos[b.passos.length - 1].passo.titulo,
        duracao: b.esperaH,
      });
    }
  }
  const forno = fornoAtual();
  eventos.push({
    tipo: 'forno',
    ini: p.ligarForno,
    fim: p.ligarForno + 5 * MIN,
    titulo: `Ligue o forno (${forno.nome})`,
    detalhe: forno.texto,
    conflito: p.fornoConflito,
  });
  return eventos.sort((a, b) => a.ini - b.ini || (a.tipo === 'forno' ? -1 : 1));
}

function linkGoogleAgenda(r, e) {
  const data = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(`Pizza ${r.nome}: ${e.titulo}`)}` +
    `&dates=${data(e.ini)}/${data(e.fim)}` +
    `&details=${encodeURIComponent(e.detalhe.slice(0, 1500))}`;
}

function renderPlano(r, c) {
  const p = planoDe(r);
  const agora = Date.now();
  $('#in-assar').value = paraInputLocal(p.assar);

  const aviso = $('#plano-aviso');
  if (p.inicio < agora) {
    aviso.className = 'aviso';
    aviso.innerHTML = `Para assar nesse horário seria preciso começar <strong>${fmtQuando.format(p.inicio)}</strong>, que já passou. Escolha um horário mais tarde ou toque em "Próximo horário possível".`;
  } else if (p.conflitos) {
    aviso.className = 'aviso';
    aviso.innerHTML = `${p.conflitos === 1 ? '1 etapa cai' : `${p.conflitos} etapas caem`} fora dos seus horários livres (marcadas com ⚠). Tente outro horário de assar ou toque em "Próximo horário possível".`;
  } else {
    aviso.className = 'ok';
    aviso.innerHTML = `Tudo encaixado nos seus horários livres. Comece <strong>${fmtQuando.format(p.inicio)}</strong>.`;
  }

  const eventos = eventosDoPlano(r, p, c);
  let dia = '';
  let html = '';
  for (const e of eventos) {
    const d = fmtDia.format(e.ini);
    if (d !== dia) {
      dia = d;
      html += `<li class="plano-dia">${d}</li>`;
    }
    if (e.tipo === 'espera') {
      html += `<li class="plano-ev espera"><time>${fmtHora.format(e.ini)}</time>
        <div>⏳ ${e.titulo} · ${duracaoTexto(e.duracao)} <small>até ${fmtQuando.format(e.fim)}</small></div></li>`;
    } else {
      const ativo = e.tipo === 'acao' && e.ativo ? `<small>~${duracaoTexto(e.ativo / 60)} de mão na massa</small>` : '';
      html += `<li class="plano-ev ${e.tipo}${e.conflito ? ' conflito' : ''}"><time>${fmtHora.format(e.ini)}</time>
        <div><strong>${e.tipo === 'forno' ? '🔥 ' : ''}${e.titulo}</strong>${ativo}
        ${e.conflito ? '<small class="fora">⚠ fora do seu horário livre</small>' : ''}
        <a class="gcal" href="${linkGoogleAgenda(r, e)}" target="_blank" rel="noopener">+ Google Agenda</a></div></li>`;
    }
  }
  html += `<li class="plano-ev assar"><time>${fmtHora.format(p.assar)}</time><div><strong>🍕 Assar</strong></div></li>`;
  $('#plano').innerHTML = html;
  renderBotaoAlertas(r, p);
}

function textoPlano() {
  const r = receitaAtual();
  const p = planoDe(r);
  const linhas = eventosDoPlano(r, p, calcular(r)).map((e) =>
    e.tipo === 'espera'
      ? `   ⏳ ${e.titulo}: ${duracaoTexto(e.duracao)}`
      : `${fmtQuando.format(e.ini)} — ${e.titulo}`
  );
  linhas.push(`${fmtQuando.format(p.assar)} — 🍕 Assar`);
  return linhas.join('\n');
}

function paraInputLocal(ms) {
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function sincronizarPlanoEntradas() {
  $('#util-ini').value = estado.livre.util[0];
  $('#util-fim').value = estado.livre.util[1];
  $('#fds-ini').value = estado.livre.fds[0];
  $('#fds-fim').value = estado.livre.fds[1];
}

// ---------- Agenda do celular (.ics) ----------

function gerarIcs(r, eventos) {
  const data = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  // linhas longas são quebradas e continuam com um espaço (regra do formato iCalendar)
  const dobrar = (linha) => {
    const cps = Array.from(linha);
    const partes = [];
    for (let i = 0; i < cps.length; i += 70) partes.push((i ? ' ' : '') + cps.slice(i, i + 70).join(''));
    return partes.join('\r\n');
  };
  const agora = data(Date.now());
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Massa de Pizza//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  eventos.forEach((e, i) => {
    const titulo = `Pizza ${r.nome}: ${e.titulo}`;
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.ini}-${i}-${r.id}@massa-pizza`,
      `DTSTAMP:${agora}`,
      `DTSTART:${data(e.ini)}`,
      `DTEND:${data(e.fim)}`,
      dobrar(`SUMMARY:${esc(titulo)}`),
      dobrar(`DESCRIPTION:${esc(e.detalhe)}`),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      dobrar(`DESCRIPTION:${esc(titulo)}`),
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT'
    );
  });
  linhas.push('END:VCALENDAR');
  return linhas.join('\r\n');
}

function baixarIcs() {
  const r = receitaAtual();
  const p = planoDe(r);
  const eventos = eventosDoPlano(r, p, calcular(r)).filter((e) => e.tipo !== 'espera');
  const blob = new Blob([gerarIcs(r, eventos)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pizza-${r.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Avisos no app (notificações) ----------
// Só disparam com o app aberto ou em segundo plano; para avisos com o app fechado, use a agenda.

function alertasAtivosPara(r, p) {
  const a = estado.alertas;
  return Boolean(a && a.receitaId === r.id && a.assar === p.assar);
}

function renderBotaoAlertas(r, p) {
  const bt = $('#bt-alertas');
  const ativos = alertasAtivosPara(r, p) && 'Notification' in window && Notification.permission === 'granted';
  bt.classList.toggle('ativo', ativos);
  bt.textContent = ativos ? '🔔 Avisos ligados (toque para desligar)' : '🔔 Avisos no app';
}

function notificar(titulo, corpo) {
  const opcoes = { body: corpo, icon: 'icons/icon-192.png', tag: 'massa-' + titulo };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(titulo, opcoes)).catch(() => new Notification(titulo, opcoes));
  } else {
    new Notification(titulo, opcoes);
  }
}

function agendarAlertas() {
  timersAlertas.forEach(clearTimeout);
  timersAlertas = [];
  const a = estado.alertas;
  if (!a || !('Notification' in window) || Notification.permission !== 'granted') return;
  const r = RECEITAS.find((x) => x.id === a.receitaId);
  if (!r) return;
  const p = planejar(r, a.assar);
  for (const e of eventosDoPlano(r, p, calcular(r))) {
    if (e.tipo === 'espera') continue;
    const falta = e.ini - Date.now();
    if (falta > 0 && falta < 2 ** 31 - 1) {
      timersAlertas.push(setTimeout(() => notificar(`🍕 ${r.nome}: ${e.titulo}`, e.detalhe.slice(0, 180)), falta));
    }
  }
}

async function alternarAlertas() {
  const r = receitaAtual();
  const p = planoDe(r);
  if (alertasAtivosPara(r, p)) {
    estado.alertas = false;
  } else {
    if (!('Notification' in window)) {
      alert('Este navegador não mostra avisos. Use "Adicionar à agenda" para receber os lembretes.');
      return;
    }
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      alert('Os avisos foram bloqueados. Libere as notificações do app nas configurações do celular, ou use "Adicionar à agenda".');
      return;
    }
    estado.alertas = { receitaId: r.id, assar: p.assar };
  }
  salvarEstado();
  agendarAlertas();
  renderBotaoAlertas(r, p);
}

function retomarAlertas() {
  if (estado.alertas && estado.alertas.assar < Date.now()) estado.alertas = false;
  agendarAlertas();
}

// ---------- Eventos ----------

function ligarEventosPlano() {
  $('#in-assar').addEventListener('change', (e) => {
    const ms = new Date(e.target.value).getTime();
    if (Number.isFinite(ms)) {
      estado.assarEm = ms;
      atualizar();
    }
  });
  $('#bt-sugerir').addEventListener('click', () => {
    estado.assarEm = proximoHorario(receitaAtual());
    atualizar();
  });
  for (const [id, grupo, i] of [['#util-ini', 'util', 0], ['#util-fim', 'util', 1], ['#fds-ini', 'fds', 0], ['#fds-fim', 'fds', 1]]) {
    $(id).addEventListener('change', (e) => {
      if (!e.target.value) return;
      estado.livre[grupo][i] = e.target.value;
      atualizar();
    });
  }
  $('#bt-ics').addEventListener('click', baixarIcs);
  $('#bt-alertas').addEventListener('click', alternarAlertas);
}
