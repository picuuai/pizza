// Receitas do app. Percentuais em relação à farinha total (padeiro).
// Só a hidratação pode ser alterada no app; o resto é fixo.
//
// Nos textos do modo de preparo, {chave} é trocado pela quantidade calculada:
//   {farinha} {agua} {sal} {fermento} {azeite} {azeiteMl} {agua90} {aguaResto}
//   {pfFarinha} {pfAgua} {finFarinha} {finAgua} {finAgua23} {finAguaResto} {bolas} {pesoBola}
//   {listaPesagem} (todos os ingredientes da receita com o peso calculado)
// e pelo fermento escolhido no app: {fermentoNome} ("fermento fresco"/"fermento seco instantâneo")
// e {fermentoDissolver} (frase pronta de como dissolver {fermento} em {agua90}).
// Temperaturas da etapa: {tempAgua} (água calculada), {ddt} (temperatura final desejada da massa),
// {tempCozinha}; e {instrucaoForno} (como assar no forno escolhido).
//
// O fermento de cada receita está em `tipoFermento`; o app converte se o usuário
// escolher o outro tipo (seco instantâneo = fresco ÷ 3, como indica a AVPN).
//
// wMin / wIdeal: força da farinha (W) mínima e ideal para o tempo de fermentação da receita.
// tempRef: temperatura ambiente para a qual a dose de fermento foi pensada; o app ajusta a dose
//   para a temperatura da cozinha (a fermentação dobra de velocidade a cada ~10 °C).
//   Receitas sem tempRef (geladeira ou biga a 18 °C controlados) não têm a dose ajustada.
// fase.ddt: temperatura final desejada da massa na etapa (usada para calcular a água);
//   fase.semSova: etapa sem sova (pré-fermento), sem o aquecimento da sova no cálculo.
// passo.mistura: passo de mistura, trocado pelos passos de autólise quando ela está ligada no app.
// passo.ativo: minutos de mão na massa; passo.espera: [mín, máx] horas de espera depois do passo.
//   O planejador usa esses tempos para montar o cronograma.

const AZEITE = 0.03; // 3% nas receitas adaptadas (30 g por kg de farinha), por preferência
const FRESCO_POR_SECO = 3;

// Tipos de farinha: o W sugerido pode ser trocado pelo da embalagem/ficha técnica
const FARINHAS = [
  { id: 'nacional', nome: 'Nacional comum', w: 200, dica: 'Farinha de trigo tipo 1 de mercado; W geralmente entre 170 e 230.' },
  { id: 'nacional-pizza', nome: 'Nacional para pizza', w: 260, dica: 'Farinhas "especial para pizza" ou profissionais; W geralmente entre 240 e 300 — confira a ficha técnica.' },
  { id: 'italiana', nome: 'Italiana 00 ou 0', w: 280, dica: 'Veja o W na embalagem. Ex.: Caputo Pizzeria ~W 260–270; Caputo Cuoco ~W 300–320.' },
  { id: 'manitoba', nome: 'Manitoba', w: 380, dica: 'Muito forte (W 350+). Usada pura em biga/longas fermentações ou misturada para reforçar outra farinha.' },
];
const W_MANITOBA = 380;

// Fornos: instrução de como assar e quanto tempo antes ligar (minutos)
const FORNOS = [
  {
    id: 'pedra',
    nome: 'Doméstico com pedra',
    preaquecer: 60,
    texto: 'Coloque a pedra na grelha mais alta e pré-aqueça no máximo (250–300 °C) por 45–60 min. Monte rápido sobre uma pá enfarinhada, deslize na pedra e asse 6–8 min; ligue o grill/gratinador no último minuto para tostar a borda.',
  },
  {
    id: 'chapa',
    nome: 'Doméstico com chapa de aço',
    preaquecer: 60,
    texto: 'Coloque a chapa de aço (6–10 mm) na grelha mais alta e pré-aqueça no máximo por 45–60 min. Asse 4–6 min, usando o grill no fim. A chapa passa mais calor que a pedra: o fundo tosta mais rápido.',
  },
  {
    id: 'assadeira',
    nome: 'Doméstico com assadeira',
    preaquecer: 30,
    texto: 'Pré-aqueça no máximo (250–280 °C) por 30 min. Abra a massa na assadeira levemente untada, monte e asse na grelha de baixo por 10–14 min, até a borda dourar; se o fundo ficar claro, deixe 1–2 min direto no chão do forno.',
  },
  {
    id: 'eletrico',
    nome: 'Forno elétrico de pizza (~400 °C)',
    preaquecer: 20,
    texto: 'Pré-aqueça 15–20 min, até a pedra chegar a ~380–400 °C. Asse 2–4 min, girando a pizza na metade do tempo.',
  },
  {
    id: 'gas',
    nome: 'Forno de pizza a gás',
    preaquecer: 30,
    texto: 'Pré-aqueça 20–30 min, até a pedra passar de 400 °C (430–480 °C no ideal). Abaixe a chama ao colocar a pizza e asse 60–90 s, girando a cada 20 s.',
  },
  {
    id: 'lenha',
    nome: 'Forno a lenha',
    preaquecer: 90,
    texto: 'Acenda 1–2 h antes, até o piso chegar a 430–480 °C, com a chama viva na lateral. Asse 60–90 s, girando a pizza com a pá a cada 20–30 s.',
  },
];

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
  ativo: 10,
  texto: 'Divida a massa em {bolas} pedaços de {pesoBola} (use a balança). Para bolear: dobre as bordas do pedaço para baixo, puxando a superfície para que fique lisa e esticada, e feche a base apertando entre os dedos. Gire a bola na bancada com as mãos em concha para firmar. Coloque numa caixa ou assadeira levemente untada com azeite, com ~5 cm entre as bolas, e tampe bem para não formar casca.',
};

const ABRIR = {
  icone: 'abrir',
  titulo: 'Abra o disco',
  ativo: 5,
  texto: 'Polvilhe a bancada com farinha (ou sêmola). Pegue a bola com uma espátula sem amassar, passe os dois lados na farinha e, com as pontas dos dedos, pressione do centro para fora deixando 1–1,5 cm de borda sem tocar — é ela que cresce e vira o cornicione. Gire e estique com as mãos até ~30–33 cm (bola de 250 g). Não use rolo: ele tira o gás da borda.',
};

const ASSAR = {
  icone: 'forno',
  titulo: 'Monte e asse',
  foto: 'margherita1',
  assar: true, // o planejador alinha este passo com o horário escolhido para assar
  ativo: 0,
  texto: 'Monte rápido (molho, mussarela bem escorrida, um fio de azeite). {instrucaoForno}',
};

const SOVAR = {
  icone: 'sova',
  titulo: 'Sove',
  tempo: '10–12 min',
  ativo: 12,
  foto: 'sova',
  texto: 'Sove 10–12 min à mão (ou 6–8 min na batedeira com gancho, velocidade baixa) até a massa ficar lisa, elástica e parar de grudar. Teste do véu: estique um pedacinho bem fino contra a luz — ele deve ficar translúcido sem rasgar. Temperatura ideal da massa no fim: {ddt}.',
};

const TESTE_DEDO = 'Teste do dedo: aperte de leve com a ponta do dedo — se a marca volta devagar e não some totalmente, está pronta; se volta rápido, espere mais; se não volta, passou do ponto (asse logo).';

// Mistura da massa direta (fermento dissolvido em 90% da água, sal com os 10% restantes)
const misturaDireta = () => [
  {
    icone: 'tigela',
    titulo: 'Dissolva o fermento e misture',
    mistura: true,
    tempo: '5 min + 10 min',
    ativo: 15,
    foto: 'farinha',
    texto: '{fermentoDissolver} Adicione a farinha ({farinha}) aos poucos, mexendo com a mão ou uma colher, até não sobrar farinha seca. Tampe e descanse 10 min — isso facilita a sova.',
  },
  {
    icone: 'tigela',
    titulo: 'Junte o sal e o azeite',
    mistura: true,
    ativo: 5,
    texto: 'Dissolva o sal ({sal}) nos {aguaResto} de água que sobraram e incorpore à massa, apertando com os dedos até absorver. O sal entra depois para não ficar em contato direto com o fermento. Por último, junte o azeite ({azeite}) em fio, aos poucos.',
  },
];

// Autólise (opção do app): farinha e água descansam antes de entrar fermento e sal.
// {fermentoAutolise}, {juntarPrefermento} e {azeiteFinal} são montados pelo app.
const AUTOLISE = {
  icone: 'relogio',
  titulo: 'Autólise',
  tempo: '30–60 min',
  ativo: 5,
  espera: [0.5, 1],
};

const AUTOLISE_DIRETA = [
  {
    ...AUTOLISE,
    texto: 'Misture só a farinha ({farinha}) com {agua90} de água a {tempAgua}, até não sobrar farinha seca — sem fermento e sem sal. Tampe e deixe descansar 30–60 min: a farinha se hidrata e o glúten começa a se formar sozinho, e a massa fica lisa e extensível com bem menos sova.',
  },
  { icone: 'tigela', titulo: 'Junte o fermento', ativo: 3, texto: '{fermentoAutolise}' },
  {
    icone: 'tigela',
    titulo: 'Junte o sal',
    ativo: 5,
    texto: 'Dissolva o sal ({sal}) nos {aguaResto} de água que sobraram e incorpore à massa aos poucos, apertando com os dedos até absorver.{azeiteFinal} Depois da autólise a sova fica mais curta: costuma bastar metade do tempo.',
  },
];

const AUTOLISE_FINAL = [
  {
    ...AUTOLISE,
    texto: 'Misture a farinha restante ({finFarinha}) com {finAgua23} de água a {tempAgua}, até não sobrar farinha seca — ainda sem o pré-fermento e sem sal. Tampe e deixe descansar 30–60 min.',
  },
  { icone: 'tigela', titulo: 'Junte o pré-fermento', ativo: 5, texto: '{juntarPrefermento}' },
  {
    icone: 'tigela',
    titulo: 'Sal e o restante da água',
    ativo: 5,
    texto: 'Junte o sal ({sal}) dissolvido nos {finAguaResto} de água restantes, aos poucos, apertando com os dedos até absorver.{azeiteFinal} Depois da autólise a sova fica mais curta: costuma bastar metade do tempo.',
  },
];

const PESAR = (complemento) => ({
  icone: 'balanca',
  titulo: 'Pese e prepare',
  ativo: 5,
  texto: 'Pese {listaPesagem}. ' + complemento,
});

// ---------- Receitas ----------

const RECEITAS = [
  {
    // Disciplinare AVPN, por litro de água: 1,6–1,8 kg de farinha, 40–60 g de sal, 0,1–3 g de fermento fresco.
    // Valores do meio da faixa: 1,7 kg de farinha, 50 g de sal e 1,7 g de fermento por litro.
    id: 'avpn',
    curto: '8–12 h ambiente',
    wMin: 250,
    wIdeal: [260, 300],
    tempRef: 21,
    nome: 'AVPN Tradicional',
    resumo: 'A receita original da Verace Pizza Napoletana: só farinha, água, sal e fermento. Sem azeite e sem açúcar na massa.',
    prazo: '8–12 h de fermentação total em temperatura ambiente (a AVPN admite até 24 h)',
    metodo: 'Direta · AVPN',
    foto: 'margherita4',
    hidratacao: 1000 / 1700,
    sal: 50 / 1700,
    fermento: 1.7 / 1700,
    tipoFermento: 'fresco',
    azeite: 0,
    acucar: 0,
    notaHidratacao: 'Faixa AVPN: 55,6–62,5% (1 litro de água para 1,6–1,8 kg de farinha).',
    linhaTempo: ['Mistura e sova 30 min', 'Bloco 2–3 h', 'Bolas 6–10 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: '8–12 h antes de assar',
        ingredientes: 'tudo',
        ddt: 23,
        passos: [
          PESAR('Use água a {tempAgua} para a massa terminar a ~{ddt}. A massa AVPN não leva azeite nem açúcar.'),
          {
            icone: 'tigela',
            titulo: 'Água e sal',
            mistura: true,
            ativo: 2,
            texto: 'Coloque toda a água ({agua}) na tigela (ou na amassadeira) e dissolva nela o sal ({sal}).',
          },
          {
            icone: 'tigela',
            titulo: 'Farinha e fermento',
            mistura: true,
            tempo: '10 min',
            ativo: 10,
            foto: 'farinha',
            texto: 'Adicione cerca de 10% da farinha e mexa; em seguida junte {fermento} de {fermentoNome} e comece a misturar. Vá acrescentando o restante da farinha (total de {farinha}) aos poucos, até a massa ficar homogênea e soltar da tigela — o "ponto de massa". Sal e fermento não devem ficar em contato direto por mais de 5 minutos.',
          },
          { ...SOVAR, ativo: 15, texto: SOVAR.texto.replace('Sove 10–12 min à mão (ou 6–8 min na batedeira com gancho, velocidade baixa)', 'Sove 10–15 min à mão (ou ~20 min na amassadeira/batedeira em velocidade baixa)') },
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco (puntata)',
            tempo: '2–3 h',
            ativo: 1,
            espera: [2, 3],
            texto: 'Deixe a massa na bancada ou tigela coberta com um pano úmido, para não formar casca, por 2–3 h em temperatura ambiente.',
          },
          { ...BOLEAR, titulo: 'Divida e boleie (staglio)', texto: BOLEAR.texto + ' A AVPN usa bolas de 200 a 280 g.' },
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas (apretto)',
            tempo: '6–10 h',
            ativo: 0,
            espera: [6, 10],
            texto: 'Deixe as bolas tampadas em temperatura ambiente por 6–10 h — com esta dose de fermento a fermentação total fica em 8–12 h; em local mais fresco ela se aproxima do limite AVPN de 24 h. ' + TESTE_DEDO,
          },
          {
            ...ABRIR,
            texto: 'Somente com as mãos, sem rolo: com as pontas dos dedos, pressione do centro para fora, virando a massa várias vezes. Pela AVPN, o centro fica com no máximo 0,25 cm de espessura e o disco com 22–35 cm, com a borda (cornicione) alta e macia.',
          },
          {
            ...ASSAR,
            texto: 'Na AVPN a pizza assa em forno a lenha com piso a ~430–480 °C por 60–90 s, e o azeite extravirgem entra só por cima, em espiral, depois do recheio. No seu forno: {instrucaoForno}',
          },
        ],
      },
    ],
    dicas: [
      'Proporção oficial AVPN, por litro de água: 1,6–1,8 kg de farinha 00 ou 0, 40–60 g de sal marinho e 0,1–3 g de fermento fresco. O app usa o meio da faixa (1,7 kg de farinha, 50 g de sal e 1,7 g de fermento por litro) e calcula as quantidades para a massa que você escolheu.',
      'A dose de fermento é pensada para ~21 °C e o app a ajusta para a temperatura da sua cozinha. Mais fermento (dentro da faixa AVPN) = menos horas.',
      'O azeite não faz parte da massa AVPN: ele só vai por cima da pizza montada.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: 'biga',
    curto: '1 dia + 4–6 h',
    wMin: 300,
    wIdeal: [300, 360],
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
    prefermento: { nome: 'Biga', artigo: 'a', rotulo: 'Toda a biga', farinha: 0.5, agua: 0.45, fermento: 0.01, temp: 18 },
    linhaTempo: ['Biga 16–24 h', 'Massa final 20 min', 'Bloco 30–60 min', 'Bolas 3–5 h', 'Assar'],
    fases: [
      {
        titulo: 'Etapa 1 · Biga',
        quando: 'Na véspera',
        ingredientes: 'prefermento',
        ddt: 18.5,
        semSova: true,
        passos: [
          {
            icone: 'termometro',
            titulo: 'Acerte a temperatura da água',
            ativo: 2,
            texto: 'A biga deve terminar a 18–20 °C. Com a cozinha a {tempCozinha}, use água a {tempAgua}. É a regra do 55: temperatura da água = 55 − temperatura da farinha − temperatura ambiente.',
          },
          {
            icone: 'tigela',
            titulo: 'Misture sem sovar',
            tempo: '2–3 min',
            ativo: 3,
            texto: 'Dissolva {fermento} de {fermentoNome} em {pfAgua} de água. Coloque {pfFarinha} de farinha numa tigela grande, despeje a água e misture com as pontas dos dedos (ou uma colher) por 2–3 min, só até a farinha absorver toda a água. NÃO sove: a biga fica em flocos e grumos úmidos e irregulares — é assim mesmo.',
          },
          {
            icone: 'pote',
            titulo: 'Deixe maturar',
            tempo: '16–24 h',
            ativo: 1,
            espera: [16, 24],
            texto: 'Passe para um pote sem compactar, tampe deixando uma fresta (ou filme com furinhos) e deixe 16–24 h a 18 °C — um cômodo fresco, adega ou geladeira de bebidas. Sem um lugar a 18 °C: 1 h em temperatura ambiente + 20–24 h na geladeira (4 °C), tirando 1 h antes de usar.',
          },
          {
            icone: 'dedo',
            titulo: 'Confira o ponto',
            ativo: 2,
            texto: 'Pronta quando cresceu e está mais macia, com cheiro levemente alcoólico e frutado; ao abrir, por dentro aparecem fios e pequenos alvéolos. Muito ácida, molhada ou desmanchando = passou do ponto.',
          },
        ],
      },
      {
        titulo: 'Etapa 2 · Massa final',
        quando: 'No dia de assar',
        ingredientes: 'final',
        ddt: 25,
        passos: [
          {
            icone: 'tigela',
            titulo: 'Desmanche a biga',
            mistura: true,
            tempo: '3–5 min',
            ativo: 5,
            texto: 'Coloque a biga em pedaços na tigela (ou na batedeira) com {finAgua23} de água a {tempAgua} e aperte/mexa por 3–5 min até ela se desfazer e virar um creme grosso.',
          },
          {
            icone: 'tigela',
            titulo: 'Farinha, sal, água e azeite',
            mistura: true,
            ativo: 8,
            texto: 'Adicione {finFarinha} de farinha e misture até formar uma massa. Junte o sal ({sal}) e, então, os {finAguaResto} de água restantes aos poucos — só coloque mais quando a anterior tiver sido absorvida. Por último, o azeite ({azeite}) em fio.',
          },
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '30–60 min',
            ativo: 1,
            espera: [0.5, 1],
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 30–60 min em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '3–5 h',
            ativo: 0,
            espera: [3, 5],
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
    ],
    fontes: [
      { nome: 'Dissapore — Biga: o que é e como usar', url: 'https://www.dissapore.com/cucina/biga-cose-preparazione-e-usi/' },
      { nome: 'Scatti di Gusto — 10 regras da biga (Zaghini)', url: 'https://www.scattidigusto.it/2017/01/27/lezioni-di-pizza-biga-vincente/' },
    ],
  },
  {
    id: 'poolish',
    curto: '12–16 h + 6–8 h',
    wMin: 280,
    wIdeal: [300, 350],
    tempRef: 19,
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
    prefermento: { nome: 'Poolish', artigo: 'o', rotulo: 'Todo o poolish', farinha: 0.3, agua: 1.0, fermento: 0.002 },
    linhaTempo: ['Poolish 12–16 h', 'Massa final 30 min', 'Bloco 1–2 h', 'Bolas 4–6 h', 'Assar'],
    fases: [
      {
        titulo: 'Etapa 1 · Poolish',
        quando: 'Na véspera',
        ingredientes: 'prefermento',
        ddt: 21,
        semSova: true,
        passos: [
          {
            icone: 'tigela',
            titulo: 'Misture o poolish',
            tempo: '2 min',
            ativo: 3,
            texto: 'Num pote com o dobro do volume, dissolva {fermento} de {fermentoNome} em {pfAgua} de água a {tempAgua}. Junte {pfFarinha} de farinha e mexa com colher ou fouet por 1–2 min, até virar um creme liso, sem grumos — consistência de massa de panqueca grossa.',
          },
          {
            icone: 'pote',
            titulo: 'Deixe fermentar',
            tempo: '12–16 h',
            ativo: 1,
            espera: [12, 16],
            texto: 'Tampe e deixe 12–16 h em temperatura ambiente. A dose de fermento já está ajustada para a sua cozinha ({tempCozinha}); em dia muito quente (acima de 26 °C), deixe 2–3 h fora e o restante na geladeira, tirando 1 h antes de usar.',
          },
          {
            icone: 'dedo',
            titulo: 'Confira o ponto',
            ativo: 2,
            foto: 'poolishPronto',
            texto: 'Pronto quando a superfície está toda coberta de bolhas, levemente abaulada e começando a afundar no centro, com cheiro frutado e levemente alcoólico. Se já desabou bastante e cheira azedo, passou do ponto: a massa fica mais ácida e fraca.',
          },
        ],
      },
      {
        titulo: 'Etapa 2 · Massa final',
        quando: 'No dia de assar',
        ingredientes: 'final',
        ddt: 24,
        passos: [
          {
            icone: 'tigela',
            titulo: 'Dilua o poolish',
            mistura: true,
            ativo: 3,
            texto: 'Coloque o poolish e {finAgua23} de água a {tempAgua} numa tigela e mexa até diluir.',
          },
          {
            icone: 'tigela',
            titulo: 'Farinha e descanso',
            mistura: true,
            tempo: '15 min',
            ativo: 20,
            texto: 'Adicione {finFarinha} de farinha aos poucos, mexendo, até formar uma massa sem farinha seca. Tampe e descanse 15 min (autólise curta) — a massa fica mais fácil de sovar.',
          },
          {
            icone: 'tigela',
            titulo: 'Sal, água e azeite',
            mistura: true,
            ativo: 5,
            texto: 'Junte o sal ({sal}) dissolvido nos {finAguaResto} de água restantes, apertando com os dedos até absorver. Por último, o azeite ({azeite}) em fio.',
          },
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1–2 h',
            ativo: 1,
            espera: [1, 2],
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe 1–2 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '4–6 h',
            ativo: 0,
            espera: [4, 6],
            texto: 'Deixe as bolas tampadas 4–6 h em temperatura ambiente, até quase dobrarem de volume, ficarem macias e com bolhinhas na base. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'O poolish leva 100% de água sobre a sua farinha. Aqui ele usa 30% da farinha total; o restante da água entra na massa final.',
      'Pouco fermento (0,2% de fresco sobre a farinha do poolish, a ~19 °C) = fermentação lenta e mais aroma. Para poolish mais rápido: 0,75% fica pronto em ~8 h, 1,5% em ~4 h.',
    ],
    fontes: [
      { nome: 'Scatti di Gusto — O poolish de Luca Pezzetta', url: 'https://www.scattidigusto.it/2020/03/15/lezioni-di-pizza-il-poolish-o-biga-liquida-di-luca-pezzetta/' },
      { nome: 'My Personal Trainer — Poolish: fermento × tempo', url: 'https://www.my-personaltrainer.it/Tv/Ricette/Pane_Pizza_Brioche/poolish.html' },
      { nome: 'Dissapore — Pizza napolitana com poolish (Nicola Cavallaro)', url: 'https://www.dissapore.com/cucina/perche-mangiare-la-pizza-napoletana-col-metodo-poolish-spiegato-passo-passo-da-nicola-cavallaro/' },
    ],
  },
  {
    id: 'mesmo-dia',
    curto: '6–8 h',
    wMin: 200,
    wIdeal: [230, 270],
    tempRef: 21.5,
    nome: 'Mesmo dia',
    resumo: 'Massa direta para fazer e assar no mesmo dia, com 6–8 h de fermentação em temperatura ambiente.',
    prazo: '6–8 h em temperatura ambiente',
    metodo: 'Direta',
    foto: 'margherita4',
    hidratacao: 0.65,
    sal: 0.025,
    fermento: 0.003,
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 40 min', 'Bloco 2 h', 'Bolas 4–6 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Comece de manhã para assar à noite',
        ingredientes: 'tudo',
        ddt: 24,
        passos: [
          PESAR('Use água a {tempAgua} para a massa terminar a ~{ddt} — a temperatura da massa controla a velocidade da fermentação. Separe {agua90} de água para o fermento e {aguaResto} para o sal.'),
          ...misturaDireta(),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '2 h',
            ativo: 1,
            espera: [1.5, 2.5],
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe ~2 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '4–6 h',
            ativo: 0,
            espera: [4, 6],
            texto: 'Deixe as bolas tampadas 4–6 h em temperatura ambiente, até quase dobrarem de volume, ficarem macias e com bolhinhas na base. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'A dose de fermento é ajustada à temperatura da sua cozinha; mesmo assim, confie no teste do dedo, não só no relógio.',
      'Dia frio: deixe a massa dentro do forno desligado com a luz acesa (fica a ~25 °C).',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '12h',
    curto: '12 h ambiente',
    wMin: 260,
    wIdeal: [270, 300],
    tempRef: 19,
    nome: '12 h',
    resumo: 'Massa no estilo AVPN, fermentada em temperatura ambiente fresca. Faça de manhã cedo para a noite, ou à noite para o almoço.',
    prazo: '12 h em temperatura ambiente',
    metodo: 'Direta',
    foto: 'margherita3',
    hidratacao: 0.60,
    sal: 0.03,
    fermento: 0.001,
    tipoFermento: 'fresco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 40 min', 'Bloco 2 h', 'Bolas 8–10 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: '12 h antes de assar',
        ingredientes: 'tudo',
        ddt: 22,
        passos: [
          PESAR('Use água a {tempAgua} para a massa terminar a ~{ddt}. Separe {agua90} de água para o fermento e {aguaResto} para o sal.'),
          ...misturaDireta(),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '2 h',
            ativo: 1,
            espera: [1.5, 2.5],
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe ~2 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'dedo',
            titulo: 'Fermentação das bolas',
            tempo: '8–10 h',
            ativo: 0,
            espera: [8, 10],
            texto: 'Deixe as bolas tampadas 8–10 h em temperatura ambiente, até quase dobrarem de volume e ficarem macias. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'A dose de fermento é pensada para ~19 °C e o app a ajusta para a sua cozinha. Em casa acima de 24 °C, a 24 h na geladeira costuma ser mais segura.',
      'Use farinha 00 ou 0 própria para pizza.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '24h',
    curto: '24 h geladeira',
    wMin: 260,
    wIdeal: [280, 320],
    geladeira: true, // fermento trabalha devagar: arredondar para 1–2 g não pede aviso
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
    linhaTempo: ['Mistura e sova 40 min', 'Bloco 1 h', 'Geladeira 18–24 h', 'Fora 2–4 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Na véspera, ~24 h antes de assar',
        ingredientes: 'tudo',
        ddt: 22,
        passos: [
          PESAR('Use água a {tempAgua} para a massa terminar a ~{ddt} e entrar fria na geladeira. Separe {agua90} de água para o fermento e {aguaResto} para o sal.'),
          ...misturaDireta(),
          SOVAR,
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1 h',
            ativo: 1,
            espera: [0.75, 1.5],
            texto: 'Faça uma bola, coloque numa tigela levemente untada, tampe e deixe ~1 h em temperatura ambiente.',
          },
          BOLEAR,
          {
            icone: 'geladeira',
            titulo: 'Geladeira',
            tempo: '18–24 h',
            ativo: 1,
            espera: [18, 24],
            texto: 'Leve a caixa bem tampada à geladeira (4–6 °C) por 18–24 h. Evite abrir a caixa: o ar seca a superfície das bolas.',
          },
          {
            icone: 'relogio',
            titulo: 'Tire da geladeira antes',
            tempo: '2–4 h',
            ativo: 1,
            espera: [2, 4],
            texto: 'Tire 2–4 h antes de assar e deixe tampada em temperatura ambiente, até as bolas ficarem macias, relaxadas e sem estar frias no centro. Massa fria rasga e encolhe ao abrir. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'Na geladeira o fermento trabalha devagar: em receitas caseiras de 24 a 72 h é comum usar de 1 a 2 g por massa (500 g a 1 kg de farinha). Por isso o app arredonda a dose para 1 g, 1,5 g, 2 g…',
      'Geladeiras variam muito: com termômetro, confira se a prateleira fica em 4–6 °C.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
  {
    id: '48h',
    curto: '48 h geladeira',
    wMin: 300,
    wIdeal: [300, 350],
    geladeira: true, // fermento trabalha devagar: arredondar para 1–2 g não pede aviso
    nome: '48 h',
    resumo: 'Fermentação longa na geladeira, em bloco e depois em bolas: sabor mais complexo e massa bem digerível.',
    prazo: '~24 h em bloco + 16–22 h em bolas na geladeira + 3–5 h fora',
    metodo: 'Direta · geladeira',
    foto: 'margherita2',
    hidratacao: 0.67,
    sal: 0.027,
    fermento: 0.0006,
    tipoFermento: 'seco',
    azeite: AZEITE,
    acucar: 0,
    linhaTempo: ['Mistura e sova 80 min', 'Bloco 1 h', 'Geladeira em bloco ~24 h', 'Bolas na geladeira 16–22 h', 'Fora 3–5 h', 'Assar'],
    fases: [
      {
        titulo: 'Massa',
        quando: 'Dois dias antes de assar',
        ingredientes: 'tudo',
        ddt: 22,
        passos: [
          PESAR('Use água a {tempAgua} para a massa terminar a ~{ddt}. Separe {agua90} de água para o fermento e {aguaResto} para o sal.'),
          ...misturaDireta(),
          {
            icone: 'dobra',
            titulo: 'Sove e faça dobras',
            tempo: '8 min + 45 min',
            ativo: 53,
            foto: 'sova',
            texto: 'Com 67% de água a massa é mais mole. Sove 8 min (sem colocar mais farinha) e depois faça 3 séries de dobras, a cada 15 min: com a mão molhada, puxe uma borda da massa, dobre sobre o centro, gire a tigela e repita 4 vezes. No fim ela deve estar lisa e firme, a ~{ddt}.',
          },
          {
            icone: 'relogio',
            titulo: 'Descanso em bloco',
            tempo: '1 h',
            ativo: 1,
            espera: [0.75, 1.5],
            texto: 'Coloque num pote untado com tampa, com espaço para a massa dobrar de volume, e deixe ~1 h em temperatura ambiente.',
          },
          {
            icone: 'geladeira',
            titulo: 'Geladeira em bloco',
            tempo: '~24 h',
            ativo: 1,
            espera: [22, 26],
            texto: 'Leve o pote tampado à geladeira (4–6 °C) por cerca de 24 h.',
          },
          { ...BOLEAR, titulo: 'No 2º dia: divida e boleie', texto: 'Tire a massa da geladeira e boleie ainda gelada (fica mais fácil). ' + BOLEAR.texto },
          {
            icone: 'geladeira',
            titulo: 'Bolas na geladeira',
            tempo: '16–22 h',
            ativo: 1,
            espera: [16, 22],
            texto: 'Volte com a caixa bem tampada para a geladeira por mais 16–22 h.',
          },
          {
            icone: 'relogio',
            titulo: 'Tire da geladeira antes',
            tempo: '3–5 h',
            ativo: 1,
            espera: [3, 5],
            texto: 'Tire 3–5 h antes de assar e deixe tampada em temperatura ambiente, até as bolas ficarem macias, relaxadas e sem estar frias no centro. ' + TESTE_DEDO,
          },
          ABRIR,
          ASSAR,
        ],
      },
    ],
    dicas: [
      'Na geladeira o fermento trabalha devagar: em receitas caseiras de 24 a 72 h é comum usar de 1 a 2 g por massa (500 g a 1 kg de farinha). Por isso o app arredonda a dose para 1 g, 1,5 g, 2 g…',
      'Prefira farinha forte, própria para longa fermentação (W 300 ou mais).',
      'Controle o frio: geladeira acima de 6 °C pode fazer a massa passar do ponto em 48 h.',
    ],
    fontes: [
      { nome: 'AVPN — Disciplinare della Verace Pizza Napoletana', url: 'https://www.pizzanapoletana.org/it/ricetta_pizza_napoletana' },
    ],
  },
];
