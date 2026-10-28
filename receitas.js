// Receitas do app. Percentuais em relação à farinha total (padeiro).
// Só a hidratação pode ser alterada no app; o resto é fixo.
//
// Nos textos do modo de preparo, {chave} é trocado pela quantidade calculada:
//   {farinha} {agua} {sal} {fermento} {azeite} {azeiteMl} {agua90} {aguaResto}
//   {pfFarinha} {pfAgua} {finFarinha} {finAgua} {finAgua23} {finAguaResto} {bolas} {pesoBola}

const AZEITE = 0.03; // 3% fixo em todas as receitas (30 g por kg de farinha), por preferência

// Fotos com licença livre do Wikimedia Commons (o crédito aparece embaixo de cada foto)
const commons = (arquivo) => ({
  url: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(arquivo) + '?width=900',
  pagina: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(arquivo.replace(/ /g, '_')),
});

const FOTOS = {
  margherita1: { ...commons("L'Oro di Napoli - January 2025 - Sarah Stierch 17.jpg"), autor: 'Sarah Stierch', licenca: 'CC0', alt: 'Pizza margherita napolitana com borda alta e tostada' },
  margherita2: { ...commons("L'Oro di Napoli - January 2025 - Sarah Stierch 18.jpg"), autor: 'Sarah Stierch', licenca: 'CC0', alt: 'Pizza napolitana recém-saída do forno' },
  margherita3: { ...commons('Napoli -Pizza Neapoli- 2009 by-RaBoe.jpg'), autor: 'Ra Boe', licenca: 'CC BY-SA 3.0', alt: 'Pizza margherita em Nápoles' },
  margherita4: { ...commons('Eq it-na pizza-margherita sep2005 sml.jpg'), autor: 'Valerio Capello', licenca: 'CC BY-SA 3.0', alt: 'Pizza margherita com manjericão' },
  poolishPronto: { ...commons('Focaccia - Poolish the next day.jpg'), autor: 'Rebecca Siegel', licenca: 'CC BY 2.0', alt: 'Poolish maduro com a superfície coberta de bolhas' },
  sova: { ...commons("Baker woman's hands kneading bread dough.jpg"), autor: 'Shixart1985', licenca: 'CC BY 2.0', alt: 'Mãos sovando massa na bancada enfarinhada' },
  farinha: { ...commons('Making Bread (Unsplash).jpg'), autor: 'Gaelle Marcel', licenca: 'CC0', alt: 'Farinha caindo das mãos em uma tigela' },
};

// ---------- Passos comuns a todas as receitas ----------

const BOLEAR = {
  icone: 'bolas',
  titulo: 'Divida e boleie',
  tempo: '10 min',
  texto: 'Divida a massa em {bolas} pedaços de {pesoBola} (use a balança). Para bolear: dobre as bordas do pedaço para baixo, puxando a superfície para que fique lisa e esticada, e feche a base apertando entre os dedos. Gire a bola na bancada com as mãos em concha para firmar. Coloque numa caixa ou assadeira levemente untada com azeite, com ~5 cm entre as bolas, e tampe bem para não formar casca.',
};

const ABRIR = {
  icone: 'abrir',
  titulo: 'Abra o disco',
  texto: 'Polvilhe a bancada com farinha (ou sêmola). Pegue a bola com uma espátula sem amassar, passe os dois lados na farinha e, com as pontas dos dedos, pressione do centro para fora deixando 1–1,5 cm de borda sem tocar — é ela que cresce e vira o cornicione. Gire e estique com as mãos até ~30–33 cm (bola de 250 g). Não use rolo: ele tira o gás da borda.',
};

const ASSAR = {
  icone: 'forno',
  titulo: 'Monte e asse',
  foto: 'margherita1',
  texto: 'Forno doméstico: pré-aqueça no máximo (250–300 °C) por 45–60 min com pedra ou chapa de aço na grelha mais alta. Monte rápido em cima de uma pá enfarinhada (molho, mussarela bem escorrida, um fio de azeite) e asse 5–8 min; se tiver grill/gratinador, ligue no último minuto para tostar. Forno de pizza (430–480 °C): 60–90 s, girando a cada 20–30 s.',
};

const SOVAR = {
  icone: 'sova',
  titulo: 'Sove',
  tempo: '10–12 min',
  foto: 'sova',
  texto: 'Sove 10–12 min à mão (ou 6–8 min na batedeira com gancho, velocidade baixa) até a massa ficar lisa, elástica e parar de grudar. Teste do véu: estique um pedacinho bem fino contra a luz — ele deve ficar translúcido sem rasgar. Temperatura ideal da massa no fim: 23–25 °C.',
};

const TESTE_DEDO = 'Teste do dedo: aperte de leve com a ponta do dedo — se a marca volta devagar e não some totalmente, está pronta; se volta rápido, espere mais; se não volta, passou do ponto (asse logo).';

// Mistura da massa direta (fermento dissolvido em 90% da água, sal com os 10% restantes)
const misturaDireta = (tipo) => [
  {
    icone: 'tigela',
    titulo: 'Dissolva o fermento e misture',
    tempo: '5 min + 10 min',
    foto: 'farinha',
    texto: (tipo === 'fresco'
      ? 'Esfarele {fermento} de fermento fresco em {agua90} de água e mexa até dissolver.'
      : 'Misture {fermento} de fermento seco em {agua90} de água.')
      + ' Adicione a farinha ({farinha}) aos poucos, mexendo com a mão ou uma colher, até não sobrar farinha seca. Tampe e descanse 10 min — isso facilita a sova.',
  },
  {
    icone: 'tigela',
    titulo: 'Junte o sal e o azeite',
    texto: 'Dissolva o sal ({sal}) nos {aguaResto} de água que sobraram e incorpore à massa, apertando com os dedos até absorver. O sal entra depois para não ficar em contato direto com o fermento. Por último, junte o azeite ({azeite}) em fio, aos poucos.',
  },
];

// ---------- Receitas ----------

const RECEITAS = [
  {
    id: 'biga',
    nome: 'Biga',
    resumo: 'Pré-fermento firme e seco que dá massa leve, alveolada e mais digerível, com aroma levemente frutado.',
    prazo: 'Biga 16–24 h a 18 °C + massa final 4–6 h',
    metodo: 'Biga',
    foto: 'margherita2',
    hidratacao: 0.65,
    sal: 0.028,
    fermento: 0.5 * 0.01, // 1% sobre a farinha da biga (metade da farinha total)
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    prefermento: { nome: 'Biga', rotulo: 'Toda a biga', farinha: 0.5, agua: 0.45, fermento: 0.01 },
    linhaTempo: ['Biga 16–24 h', 'Massa final 20 min', 'Bloco 30–60 min', 'Bolas 3–5 h', 'Assar'],
    fases: [
      {
        titulo: 'Etapa 1 · Biga',
        quando: 'Na véspera',
        ingredientes: 'prefermento',
        passos: [
          {
            icone: 'termometro',
            titulo: 'Acerte a temperatura da água',
            texto: 'A biga deve terminar a 18–20 °C. Regra prática (regra do 55): temperatura da água = 55 − temperatura da farinha − temperatura ambiente. Ex.: farinha a 22 °C e cozinha a 25 °C → água a 8 °C (gelada). No inverno a água fica perto de 15–20 °C.',
          },
          {
            icone: 'tigela',
            titulo: 'Misture sem sovar',
            tempo: '2–3 min',
            texto: 'Dissolva {fermento} de fermento fresco em {pfAgua} de água. Coloque {pfFarinha} de farinha numa tigela grande, despeje a água e misture com as pontas dos dedos (ou uma colher) por 2–3 min, só até a farinha absorver toda a água. NÃO sove: a biga fica em flocos e grumos úmidos e irregulares — é assim mesmo.',
          },
          {
            icone: 'pote',
            titulo: 'Deixe maturar',
            tempo: '16–24 h',
            texto: 'Passe para um pote sem compactar, tampe deixando uma fresta (ou filme com furinhos) e deixe 16–24 h a 18 °C — um cômodo fresco, adega ou geladeira de bebidas. Sem um lugar a 18 °C: 1 h em temperatura ambiente + 20–24 h na geladeira (4 °C), tirando 1 h antes de usar.',
          },
          {
            icone: 'dedo',
            titulo: 'Confira o ponto',
            texto: 'Pronta quando cresceu e está mais macia, com cheiro levemente alcoólico e frutado; ao abrir, por dentro aparecem fios e pequenos alvéolos. Muito ácida, molhada ou desmanchando = passou do ponto.',
          },
        ],
      },
      {
        titulo: 'Etapa 2 · Massa final',
        quando: 'No dia de assar',
        ingredientes: 'final',
        passos: [
          {
            icone: 'tigela',
            titulo: 'Desmanche a biga',
            tempo: '3–5 min',
            texto: 'Coloque a biga em pedaços na tigela (ou na batedeira) com {finAgua23} de água fresca e aperte/mexa por 3–5 min até ela se desfazer e virar um creme grosso.',
          },
          {
            icone: 'tigela',
            titulo: 'Farinha, sal, água e azeite',
            texto: 'Adicione {finFarinha} de farinha e misture até formar uma massa. Junte o sal ({sal}) e, então, os {finAguaResto} de água restantes aos poucos — só coloque mais quando a anterior tiver sido absorvida. Por último, o azeite ({azeite}) em fio.',
          },
          { ...SOVAR, texto: SOVAR.texto.replace('23–25 °C', '24–26 °C') },
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '30–60 min',
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 30–60 min em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '3–5 h',
            texto: 'Deixe as bolas tampadas 3–5 h em temperatura ambiente (22–24 °C), até quase dobrarem de volume, ficarem macias e com bolhinhas na base. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'A biga clássica tem 44–45% de água sobre a farinha da biga e 1% de fermento fresco; a água que falta para a hidratação escolhida entra na massa final.',
      'Use farinha forte (tipo 00 ou 0 para pizza, W 300 ou mais): a biga é longa e exige glúten resistente.',
      'Fermento seco no lugar do fresco: use 1/3 do peso.',
    ],
    fontes: [
      { nome: 'Dissapore — Biga: o que é e como usar', url: 'https://www.dissapore.com/cucina/biga-cose-preparazione-e-usi/' },
      { nome: 'Scatti di Gusto — 10 regras da biga (Zaghini)', url: 'https://www.scattidigusto.it/2017/01/27/lezioni-di-pizza-biga-vincente/' },
    ],
  },
  {
    id: 'poolish',
    nome: 'Poolish',
    resumo: 'Pré-fermento líquido (mesmo peso de farinha e água) que deixa a massa extensível, aromática e com borda bem aerada.',
    prazo: 'Poolish 12–16 h a 18–20 °C + massa final 6–8 h',
    metodo: 'Poolish',
    foto: 'margherita3',
    hidratacao: 0.65,
    sal: 0.028,
    fermento: 0.3 * 0.002, // 0,2% sobre a farinha do poolish (30% da farinha total)
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    prefermento: { nome: 'Poolish', rotulo: 'Todo o poolish', farinha: 0.3, agua: 1.0, fermento: 0.002 },
    linhaTempo: ['Poolish 12–16 h', 'Massa final 25 min', 'Bloco 1–2 h', 'Bolas 4–6 h', 'Assar'],
    fases: [
      {
        titulo: 'Etapa 1 · Poolish',
        quando: 'Na véspera',
        ingredientes: 'prefermento',
        passos: [
          {
            icone: 'tigela',
            titulo: 'Misture o poolish',
            tempo: '2 min',
            texto: 'Num pote com o dobro do volume, dissolva {fermento} de fermento fresco em {pfAgua} de água a 20–22 °C. Junte {pfFarinha} de farinha e mexa com colher ou fouet por 1–2 min, até virar um creme liso, sem grumos — consistência de massa de panqueca grossa.',
          },
          {
            icone: 'pote',
            titulo: 'Deixe fermentar',
            tempo: '12–16 h',
            texto: 'Tampe e deixe 12–16 h a 18–20 °C. Em dia quente (acima de 24 °C), deixe 2–3 h fora e o restante na geladeira, tirando 1 h antes de usar.',
          },
          {
            icone: 'dedo',
            titulo: 'Confira o ponto',
            foto: 'poolishPronto',
            texto: 'Pronto quando a superfície está toda coberta de bolhas, levemente abaulada e começando a afundar no centro, com cheiro frutado e levemente alcoólico. Se já desabou bastante e cheira azedo, passou do ponto: a massa fica mais ácida e fraca.',
          },
        ],
      },
      {
        titulo: 'Etapa 2 · Massa final',
        quando: 'No dia de assar',
        ingredientes: 'final',
        passos: [
          {
            icone: 'tigela',
            titulo: 'Dilua o poolish',
            texto: 'Coloque o poolish e {finAgua23} de água (fria se o dia estiver quente) numa tigela e mexa até diluir.',
          },
          {
            icone: 'tigela',
            titulo: 'Farinha e descanso',
            tempo: '15 min',
            texto: 'Adicione {finFarinha} de farinha aos poucos, mexendo, até formar uma massa sem farinha seca. Tampe e descanse 15 min (autólise curta) — a massa fica mais fácil de sovar.',
          },
          {
            icone: 'tigela',
            titulo: 'Sal, água e azeite',
            texto: 'Junte o sal ({sal}) dissolvido nos {finAguaResto} de água restantes, apertando com os dedos até absorver. Por último, o azeite ({azeite}) em fio.',
          },
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1–2 h',
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 1–2 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '4–6 h',
            texto: 'Deixe as bolas tampadas 4–6 h em temperatura ambiente (20–24 °C), até quase dobrarem de volume, ficarem macias e com bolhinhas na base. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'O poolish leva 100% de água sobre a sua farinha. Aqui ele usa 30% da farinha total; o restante da água entra na massa final.',
      'Pouco fermento (0,2% sobre a farinha do poolish) = fermentação lenta e mais aroma. Para poolish mais rápido: 0,75% fica pronto em ~8 h, 1,5% em ~4 h.',
      'Fermento seco no lugar do fresco: use 1/3 do peso.',
    ],
    fontes: [
      { nome: 'Scatti di Gusto — O poolish de Luca Pezzetta', url: 'https://www.scattidigusto.it/2020/03/15/lezioni-di-pizza-il-poolish-o-biga-liquida-di-luca-pezzetta/' },
      { nome: 'My Personal Trainer — Poolish: fermento × tempo', url: 'https://www.my-personaltrainer.it/Tv/Ricette/Pane_Pizza_Brioche/poolish.html' },
      { nome: 'Dissapore — Pizza napolitana com poolish (Nicola Cavallaro)', url: 'https://www.dissapore.com/cucina/perche-mangiare-la-pizza-napoletana-col-metodo-poolish-spiegato-passo-passo-da-nicola-cavallaro/' },
    ],
  },
  {
    id: 'mesmo-dia',
    nome: 'Mesmo dia',
    resumo: 'Massa direta para fazer e assar no mesmo dia, com 6–8 h de fermentação em temperatura ambiente.',
    prazo: '6–8 h a ~20–23 °C',
    metodo: 'Direta',
    foto: 'margherita4',
    hidratacao: 0.65,
    sal: 0.025,
    fermento: 0.003,
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 25 min', 'Bloco 2 h', 'Bolas 4–6 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Comece de manhã para assar à noite',
        ingredientes: 'tudo',
        passos: [
          {
            icone: 'balanca',
            titulo: 'Pese e prepare',
            texto: 'Pese tudo antes de começar. Use água em temperatura ambiente (20–22 °C); em dia quente (acima de 26 °C), use água gelada para a massa não fermentar rápido demais. Separe {agua90} de água para o fermento e {aguaResto} para o sal.',
          },
          ...misturaDireta('fresco'),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '2 h',
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 2 h em temperatura ambiente (20–23 °C).',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '4–6 h',
            texto: 'Deixe as bolas tampadas 4–6 h em temperatura ambiente, até quase dobrarem de volume, ficarem macias e com bolhinhas na base. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'Dia quente (acima de 25 °C) acelera tudo: encurte o tempo das bolas e confie no teste do dedo, não no relógio.',
      'Dia frio: deixe a massa dentro do forno desligado com a luz acesa (fica a ~25 °C).',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '12h',
    nome: '12 h',
    resumo: 'Massa no estilo AVPN, fermentada em temperatura ambiente fresca. Faça de manhã cedo para a noite, ou à noite para o almoço.',
    prazo: '12 h a 18–20 °C',
    metodo: 'Direta',
    foto: 'margherita3',
    hidratacao: 0.60,
    sal: 0.03,
    fermento: 0.001,
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 25 min', 'Bloco 2 h', 'Bolas 8–10 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: '12 h antes de assar',
        ingredientes: 'tudo',
        passos: [
          {
            icone: 'balanca',
            titulo: 'Pese e prepare',
            texto: 'Pese tudo antes de começar — com tão pouco fermento ({fermento}), use balança de precisão. Use água fresca (18–20 °C). Separe {agua90} de água para o fermento e {aguaResto} para o sal.',
          },
          ...misturaDireta('fresco'),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '2 h',
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 2 h a 18–20 °C.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '8–10 h',
            texto: 'Deixe as bolas tampadas 8–10 h a 18–20 °C, até quase dobrarem de volume e ficarem macias. Se a casa passar de 22 °C, deixe as 4 primeiras horas na geladeira. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'A temperatura é decisiva: 18–20 °C é o ideal. Mais quente acelera muito a fermentação.',
      'Use farinha 00 ou 0 própria para pizza.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '24h',
    nome: '24 h',
    resumo: 'Fermentação lenta na geladeira: mais sabor, massa mais leve e flexibilidade de horário.',
    prazo: '18–24 h na geladeira (4–6 °C) + 2–4 h fora',
    metodo: 'Direta · geladeira',
    foto: 'margherita1',
    hidratacao: 0.60,
    sal: 0.027,
    fermento: 0.001,
    tipoFermento: 'seco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 25 min', 'Bloco 1 h', 'Geladeira 18–24 h', 'Fora 2–4 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Na véspera, ~24 h antes de assar',
        ingredientes: 'tudo',
        passos: [
          {
            icone: 'balanca',
            titulo: 'Pese e prepare',
            texto: 'Pese tudo antes de começar. Use água gelada (5–8 °C, da geladeira) para a massa terminar a ~22 °C e entrar fria na geladeira. Separe {agua90} de água para o fermento e {aguaResto} para o sal.',
          },
          ...misturaDireta('seco'),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1 h',
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 1 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'geladeira',
            titulo: 'Geladeira',
            tempo: '18–24 h',
            texto: 'Leve a caixa bem tampada à geladeira (4–6 °C) por 18–24 h. Evite abrir a caixa: o ar seca a superfície das bolas.',
          },
          {
            icone: 'relogio',
            titulo: 'Tire da geladeira antes',
            tempo: '2–4 h',
            texto: 'Tire 2–4 h antes de assar e deixe tampada em temperatura ambiente, até as bolas ficarem macias, relaxadas e sem estar frias no centro. Massa fria rasga e encolhe ao abrir. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'Geladeiras variam muito: com termômetro, confira se a prateleira fica em 4–6 °C.',
      'Fermento fresco no lugar do seco: use 3 vezes o peso.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '48h',
    nome: '48 h',
    resumo: 'Fermentação longa na geladeira, em bloco e depois em bolas: sabor mais complexo e massa bem digerível.',
    prazo: '24 h em bloco + 18–20 h em bolas na geladeira + 3–5 h fora',
    metodo: 'Direta · geladeira',
    foto: 'margherita2',
    hidratacao: 0.67,
    sal: 0.027,
    fermento: 0.0006,
    tipoFermento: 'seco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 30 min', 'Bloco 1 h', 'Geladeira em bloco 24 h', 'Bolas na geladeira 18–20 h', 'Fora 3–5 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Dois dias antes de assar',
        ingredientes: 'tudo',
        passos: [
          {
            icone: 'balanca',
            titulo: 'Pese e prepare',
            texto: 'Pese tudo antes de começar — com tão pouco fermento ({fermento}), use balança de precisão. Use água gelada (5–8 °C). Separe {agua90} de água para o fermento e {aguaResto} para o sal.',
          },
          ...misturaDireta('seco'),
          {
            icone: 'dobra',
            titulo: 'Sove e faça dobras',
            tempo: '8 min + 45 min',
            foto: 'sova',
            texto: 'Com 67% de água a massa é mais mole. Sove 8 min (sem colocar mais farinha) e depois faça 3 séries de dobras, a cada 15 min: com a mão molhada, puxe uma borda da massa, dobre sobre o centro, gire a tigela e repita 4 vezes. No fim ela deve estar lisa e firme.',
          },
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1 h',
            texto: 'Coloque num pote untado com tampa, com espaço para a massa dobrar de volume, e deixe 1 h em temperatura ambiente.',
          },
          {
            icone: 'geladeira',
            titulo: 'Geladeira em bloco',
            tempo: '24 h',
            texto: 'Leve o pote tampado à geladeira (4–6 °C) por 24 h.',
          },
          { ...BOLEAR, titulo: 'No 2º dia: divida e boleie', texto: 'Tire a massa da geladeira e boleie ainda gelada (fica mais fácil). ' + BOLEAR.texto },
          {
            icone: 'geladeira',
            titulo: 'Bolas na geladeira',
            tempo: '18–20 h',
            texto: 'Volte com a caixa bem tampada para a geladeira por mais 18–20 h.',
          },
          {
            icone: 'relogio',
            titulo: 'Tire da geladeira antes',
            tempo: '3–5 h',
            texto: 'Tire 3–5 h antes de assar e deixe tampada em temperatura ambiente, até as bolas ficarem macias, relaxadas e sem estar frias no centro. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'Prefira farinha forte, própria para longa fermentação (W 300 ou mais).',
      'Controle o frio: geladeira acima de 6 °C pode fazer a massa passar do ponto em 48 h.',
      'Fermento fresco no lugar do seco: use 3 vezes o peso.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
];
