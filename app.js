(function () {
  'use strict';

  // ======================= Constantes e utilidades =======================
  const STATUS = {
    possivel: { rotulo: 'Possível', emoji: '💭' },
    falta_comprar: { rotulo: 'Falta comprar', emoji: '🛒' },
    comprada: { rotulo: 'Comprada', emoji: '✅' },
    concluida: { rotulo: 'Concluída', emoji: '🏁' }
  };
  const TIPOS_LUGAR = {
    restaurante: { rotulo: 'Restaurante', emoji: '🍽️' },
    passeio: { rotulo: 'Passeio', emoji: '🎡' },
    hotel: { rotulo: 'Hotel', emoji: '🏨' },
    outro: { rotulo: 'Outro', emoji: '📍' }
  };
  const COMPANHIAS = ['LATAM', 'GOL', 'Azul', 'TAP', 'American Airlines', 'Copa', 'Avianca', 'Aerolíneas Argentinas', 'Iberia', 'Air France', 'KLM', 'Emirates'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DIA_MS = 86400000;

  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

  function isoDe(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dataDe(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d || 1);
  }
  const hojeISO = () => isoDe(new Date());
  function diasAte(iso) {
    return Math.round((dataDe(iso) - dataDe(hojeISO())) / DIA_MS);
  }
  function ultimoDiaDoMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    return isoDe(new Date(a, m, 0));
  }

  // Período que a viagem ocupa no calendário: [início, fim] em ISO.
  function intervalo(v) {
    if (v.tipo === 'mes' && v.mes) return [v.mes + '-01', ultimoDiaDoMes(v.mes)];
    if (v.tipo === 'periodo' && v.inicio) return [v.inicio, v.fim && v.fim >= v.inicio ? v.fim : v.inicio];
    if (v.inicio) return [v.inicio, v.inicio];
    return ['9999-12-31', '9999-12-31'];
  }

  function dataCurta(iso, comAno) {
    const d = dataDe(iso);
    let s = d.getDate() + ' de ' + MESES_CURTOS[d.getMonth()];
    if (comAno || d.getFullYear() !== new Date().getFullYear()) s += ' de ' + d.getFullYear();
    return s;
  }
  function dataComSemana(iso) {
    return DIAS_SEMANA[dataDe(iso).getDay()] + ', ' + dataCurta(iso);
  }
  function nomeMes(mes, comAno) {
    const [a, m] = mes.split('-').map(Number);
    let s = maiuscula(MESES[m - 1]);
    if (comAno || a !== new Date().getFullYear()) s += ' de ' + a;
    return s;
  }

  function textoQuando(v) {
    if (v.tipo === 'mes') return v.mes ? nomeMes(v.mes) + ' · dia ainda não definido' : 'Data a definir';
    if (!v.inicio) return 'Data a definir';
    if (v.tipo === 'periodo' && v.fim && v.fim !== v.inicio) {
      const a = dataDe(v.inicio), b = dataDe(v.fim);
      const dias = Math.round((b - a) / DIA_MS) + 1;
      const ini = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
        ? String(a.getDate())
        : dataCurta(v.inicio);
      return ini + ' a ' + dataCurta(v.fim) + ' · ' + dias + ' dias';
    }
    return maiuscula(dataComSemana(v.inicio));
  }

  function emQuantoTempo(iso) {
    const d = diasAte(iso);
    if (d === 0) return 'hoje';
    if (d === 1) return 'amanhã';
    if (d > 1) return 'em ' + d + ' dias';
    if (d === -1) return 'ontem';
    return 'há ' + (-d) + ' dias';
  }

  function horasCheckin(voo) {
    if (voo.checkinHoras) return Number(voo.checkinHoras);
    return /azul/i.test(voo.companhia || '') ? 72 : 48;
  }
  function momentoVoo(voo) {
    if (!voo.data) return null;
    const [h, m] = (voo.horario || '00:00').split(':').map(Number);
    const d = dataDe(voo.data); d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  function horaDe(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function linkMaps(lugar, viagem) {
    if (lugar.link) return lugar.link;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugar.nome + ', ' + viagem.destino);
  }

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  // ======================= Estado =======================
  const estado = {
    viagens: [],
    pessoas: [],
    tela: 'proximas',
    calMes: (() => { const d = new Date(); d.setDate(1); return d; })(),
    diaSel: null,
    mostrarPassadas: false,
    offline: false
  };
  try { estado.tela = localStorage.getItem('viagens_tela') || 'proximas'; } catch (e) { /* ignora */ }

  const viagemPorId = id => estado.viagens.find(v => v.id === id);
  function ordenar(lista) {
    return lista.slice().sort((a, b) => intervalo(a)[0].localeCompare(intervalo(b)[0]));
  }

  function tratarErro(e) {
    console.error(e);
    if (e && e.codigo === 'PIN') { mostrarPin(); return; }
    if (e && e.codigo === 'BLOQUEADO') { toast('Muitas tentativas erradas. Espere alguns minutos.', 4500); return; }
    if (e && e.codigo === 'OFFLINE') { toast('Sem internet. Tente de novo quando tiver sinal.', 3500); return; }
    toast((e && e.message) || 'Algo deu errado. Tente de novo.', 3500);
  }

  async function carregar() {
    // Sem PIN guardado, pede antes de chamar o Google, para não contar como tentativa errada.
    if (Api.modo === 'conectado' && !Api.temPin()) { mostrarPin(); return; }
    $('#tela-proximas').innerHTML = '<div class="carregando"><span class="girando"></span><p>Carregando viagens…</p></div>';
    try {
      const dados = await Api.carregar();
      estado.viagens = dados.viagens || [];
      estado.pessoas = dados.pessoas || [];
      estado.offline = !!dados.offline;
      render();
      baixarAnexosProximos();
    } catch (e) {
      $('#tela-proximas').innerHTML = '';
      tratarErro(e);
    }
  }

  // Deixa os cartões de embarque das viagens próximas guardados no aparelho,
  // para abrirem no aeroporto mesmo sem sinal.
  function baixarAnexosProximos() {
    if (Api.modo !== 'conectado' || estado.offline) return;
    estado.viagens.forEach(v => {
      const [ini, fim] = intervalo(v);
      if (diasAte(ini) > 3 || diasAte(fim) < 0) return;
      todosAnexos(v).forEach(a => Api.pegarAnexo(a.id).catch(() => {}));
    });
  }
  function todosAnexos(v) {
    return (v.anexos || []).concat(...(v.voos || []).map(voo => voo.anexos || []));
  }

  async function salvarViagem(v) {
    const salva = await Api.salvar(v);
    const i = estado.viagens.findIndex(x => x.id === salva.id);
    if (i >= 0) estado.viagens[i] = salva; else estado.viagens.push(salva);
    render();
    return salva;
  }

  // ======================= Render principal =======================
  function render() {
    const faixa = $('#faixa-status');
    if (estado.offline) { faixa.textContent = '📴 Sem internet: mostrando a última versão salva.'; faixa.hidden = false; }
    else if (Api.modo === 'demo') { faixa.textContent = '🧪 Modo demonstração: dados de exemplo, salvos só neste aparelho.'; faixa.hidden = false; }
    else faixa.hidden = true;

    $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.tela === estado.tela));
    $('#tela-proximas').hidden = estado.tela !== 'proximas';
    $('#tela-calendario').hidden = estado.tela !== 'calendario';
    renderAvisos();
    if (estado.tela === 'proximas') renderProximas(); else renderCalendario();
  }

  // ---------- Avisos ----------
  function gerarAvisos() {
    const hoje = hojeISO();
    const agora = new Date();
    const avisos = [];
    estado.viagens.forEach(v => {
      if (v.status === 'concluida') return;
      const [ini, fim] = intervalo(v);
      const dias = diasAte(ini);

      if (fim < hoje) {
        avisos.push({ prio: 60, classe: 'neutro', emoji: '🏁', texto: 'A viagem para ' + v.destino + ' já passou', sub: 'Quer marcar como concluída?', id: v.id, acao: 'concluir' });
        return;
      }
      if (v.status === 'possivel' && dias <= 180) {
        const quando = v.tipo === 'mes' ? nomeMes(v.mes) : dataCurta(ini);
        avisos.push({ prio: 20 + dias / 10, classe: 'possivel', emoji: '⚠️', texto: quando + ': viagem possível para ' + v.destino, sub: 'Ainda sem passagem', id: v.id });
      }
      if (v.status === 'falta_comprar') {
        avisos.push({ prio: Math.min(dias, 30) - 5, classe: 'alerta', emoji: '🛒', texto: 'Falta comprar a passagem para ' + v.destino, sub: textoQuando(v) + (v.tipo !== 'mes' ? ' · ' + emQuantoTempo(ini) : ''), id: v.id });
      }
      if (v.status === 'comprada') {
        if (ini <= hoje && fim >= hoje) {
          avisos.push({ prio: -20, classe: 'ok', emoji: '🌴', texto: 'Em viagem: ' + v.destino, sub: 'Volta ' + (fim === hoje ? 'hoje' : emQuantoTempo(fim)), id: v.id });
        } else if (dias <= 30) {
          const t = dias === 0 ? 'Hoje: viagem para ' + v.destino : dias === 1 ? 'Amanhã: viagem para ' + v.destino : 'Viagem para ' + v.destino + ' em ' + dias + ' dias';
          avisos.push({ prio: dias, classe: 'ok', emoji: '✈️', texto: t, sub: textoQuando(v), id: v.id });
        }
        (v.voos || []).forEach(voo => {
          const parte = momentoVoo(voo);
          if (!parte) return;
          const abre = new Date(parte.getTime() - horasCheckin(voo) * 3600000);
          const nome = voo.numero ? 'voo ' + voo.numero : 'voo de ' + (voo.trecho || 'ida').toLowerCase();
          if (agora < abre && abre - agora <= 7 * DIA_MS) {
            avisos.push({ prio: dias - 0.5, classe: 'ok', emoji: '🎫', texto: 'Check-in do ' + nome + ' abre ' + dataComSemana(isoDe(abre)) + ' às ' + horaDe(abre), sub: v.destino + ' · aproximadamente ' + horasCheckin(voo) + 'h antes do voo', id: v.id });
          } else if (agora >= abre && agora < parte) {
            avisos.push({ prio: -30, classe: 'alerta', emoji: '🎫', texto: 'Check-in aberto: ' + nome, sub: (voo.trecho || '') + ' · ' + dataComSemana(voo.data) + (voo.horario ? ' às ' + voo.horario : ''), id: v.id });
          }
        });
      }
    });
    return avisos.sort((a, b) => a.prio - b.prio).slice(0, 6);
  }

  function renderAvisos() {
    const el = $('#avisos');
    const todos = gerarAvisos();
    if (!todos.length) { el.innerHTML = ''; return; }
    // No calendário, só um atalho; a lista completa fica na tela "Próximas".
    if (estado.tela === 'calendario') {
      el.innerHTML = '<button class="aviso" id="ver-avisos"><span class="emoji">🔔</span><span class="txt"><b>' + todos.length + (todos.length > 1 ? ' avisos' : ' aviso') + '</b><small>Toque para ver</small></span></button>';
      $('#ver-avisos').addEventListener('click', () => $('.aba[data-tela="proximas"]').click());
      return;
    }
    const VISIVEIS = 3;
    const avisos = estado.todosAvisos ? todos : todos.slice(0, VISIVEIS);
    el.innerHTML = '<p class="avisos-titulo">Avisos</p>' + avisos.map((a, i) =>
      '<div class="aviso ' + a.classe + '" data-i="' + i + '" role="button" tabindex="0">' +
        '<span class="emoji">' + a.emoji + '</span>' +
        '<span class="txt"><b>' + esc(a.texto) + '</b><small>' + esc(a.sub || '') + '</small></span>' +
        (a.acao === 'concluir' ? '<button class="acao-mini" data-concluir="' + esc(a.id) + '">Concluir</button>' : '') +
      '</div>').join('') +
      (todos.length > VISIVEIS
        ? '<button class="btn-link" id="mais-avisos" style="padding:4px">' + (estado.todosAvisos ? '▾ Mostrar menos' : '▸ Ver mais ' + (todos.length - VISIVEIS) + (todos.length - VISIVEIS > 1 ? ' avisos' : ' aviso')) + '</button>'
        : '');
    const mais = $('#mais-avisos', el);
    if (mais) mais.addEventListener('click', () => { estado.todosAvisos = !estado.todosAvisos; renderAvisos(); });
    $$('.aviso', el).forEach(div => div.addEventListener('click', ev => {
      const a = avisos[Number(div.dataset.i)];
      if (ev.target.dataset.concluir) {
        ev.stopPropagation();
        const v = viagemPorId(a.id);
        salvarViagem(Object.assign({}, v, { status: 'concluida' })).then(() => toast('Viagem marcada como concluída')).catch(tratarErro);
        return;
      }
      abrirDetalhe(a.id);
    }));
  }

  // ---------- Lista de próximas viagens ----------
  function cartaoViagem(v, passada) {
    const st = STATUS[v.status] || STATUS.possivel;
    const extras = [];
    if (v.pessoas && v.pessoas.length) extras.push('👥 ' + esc(v.pessoas.join(', ')));
    if (v.voos && v.voos.length) extras.push('✈️ ' + v.voos.length + (v.voos.length > 1 ? ' voos' : ' voo'));
    if (v.lugares && v.lugares.length) extras.push('📍 ' + v.lugares.length + (v.lugares.length > 1 ? ' lugares' : ' lugar'));
    const nAnexos = todosAnexos(v).length;
    if (nAnexos) extras.push('📎 ' + nAnexos);
    const [ini] = intervalo(v);
    const falta = !passada && v.tipo !== 'mes' && diasAte(ini) >= 0 && diasAte(ini) <= 60 ? ' · ' + emQuantoTempo(ini) : '';
    return '<button class="cartao-viagem st-' + v.status + (passada ? ' passada' : '') + '" data-id="' + esc(v.id) + '">' +
      '<div class="linha1"><span class="destino">' + esc(v.destino) + '</span><span class="pilula st-' + v.status + '">' + st.emoji + ' ' + st.rotulo + '</span></div>' +
      '<div class="quando">' + esc(textoQuando(v)) + falta + '</div>' +
      (extras.length ? '<div class="extras">' + extras.map(x => '<span>' + x + '</span>').join('') + '</div>' : '') +
      '</button>';
  }

  function ligarCartoes(raiz) {
    $$('.cartao-viagem', raiz).forEach(b => b.addEventListener('click', () => abrirDetalhe(b.dataset.id)));
  }

  function renderProximas() {
    const el = $('#tela-proximas');
    const hoje = hojeISO();
    const futuras = ordenar(estado.viagens.filter(v => intervalo(v)[1] >= hoje));
    const passadas = ordenar(estado.viagens.filter(v => intervalo(v)[1] < hoje)).reverse();

    let html = '';
    if (!futuras.length) {
      html += '<div class="vazio"><div class="grande">🧳</div><p><b>Nenhuma viagem marcada.</b><br>Toque em “＋ Nova viagem” para começar.</p></div>';
    } else {
      let grupoAtual = null;
      futuras.forEach(v => {
        const [ini] = intervalo(v);
        const grupo = ini <= hoje ? 'Agora' : nomeMes(ini.slice(0, 7));
        if (grupo !== grupoAtual) { html += '<h2 class="grupo-titulo">' + esc(grupo) + '</h2>'; grupoAtual = grupo; }
        html += cartaoViagem(v, false);
      });
    }
    if (passadas.length) {
      html += '<button class="btn-link" id="btn-passadas">' + (estado.mostrarPassadas ? '▾ Esconder' : '▸ Ver') + ' viagens que já aconteceram (' + passadas.length + ')</button>';
      if (estado.mostrarPassadas) html += passadas.map(v => cartaoViagem(v, true)).join('');
    }
    el.innerHTML = html;
    ligarCartoes(el);
    const bp = $('#btn-passadas', el);
    if (bp) bp.addEventListener('click', () => { estado.mostrarPassadas = !estado.mostrarPassadas; renderProximas(); });
  }

  // ---------- Calendário ----------
  function renderCalendario() {
    const el = $('#tela-calendario');
    const base = estado.calMes;
    const ano = base.getFullYear(), mes = base.getMonth();
    const mesIso = ano + '-' + String(mes + 1).padStart(2, '0');
    const hoje = hojeISO();

    const comData = estado.viagens.filter(v => v.tipo !== 'mes');
    const doMes = ordenar(estado.viagens.filter(v => v.tipo === 'mes' && v.mes === mesIso));

    const primeiro = new Date(ano, mes, 1);
    const inicioGrade = new Date(ano, mes, 1 - primeiro.getDay());
    const semanas = Math.ceil((primeiro.getDay() + new Date(ano, mes + 1, 0).getDate()) / 7);

    let grade = DIAS_SEMANA.map(d => '<div class="dsem">' + d.charAt(0).toUpperCase() + '</div>').join('');
    for (let i = 0; i < semanas * 7; i++) {
      const d = new Date(inicioGrade.getFullYear(), inicioGrade.getMonth(), inicioGrade.getDate() + i);
      const iso = isoDe(d);
      const noDia = ordenar(comData.filter(v => { const [a, b] = intervalo(v); return a <= iso && iso <= b; }));
      const marcas = noDia.slice(0, 3).map(v => {
        const [a, b] = intervalo(v);
        return '<span class="marca st-' + v.status + (a === iso ? ' inicio' : '') + (b === iso ? ' fim' : '') + '" style="background:var(--cor)"></span>';
      }).join('') + (noDia.length > 3 ? '<span class="mais">+' + (noDia.length - 3) + '</span>' : '');
      const classes = ['dia'];
      if (d.getMonth() !== mes) classes.push('fora');
      if (iso === hoje) classes.push('hoje');
      if (iso === estado.diaSel) classes.push('sel');
      grade += '<button class="' + classes.join(' ') + '" data-dia="' + iso + '" aria-label="' + esc(dataComSemana(iso)) + (noDia.length ? ', ' + noDia.length + ' viagem(ns)' : '') + '">' +
        '<span class="num">' + d.getDate() + '</span><span class="marcas">' + marcas + '</span></button>';
    }

    let html = '<div class="cal-cab"><h2>' + esc(MESES[mes] + ' ' + ano) + '</h2><div class="cal-nav">' +
      '<button id="cal-ant" aria-label="Mês anterior">‹</button><button id="cal-hoje" class="hoje-btn">Hoje</button><button id="cal-prox" aria-label="Próximo mês">›</button></div></div>' +
      '<div class="cal">' + grade + '</div>';

    if (doMes.length) {
      html += doMes.map(v => '<div class="mes-possivel" data-id="' + esc(v.id) + '" role="button">💭 <b>' + esc(v.destino) + '</b>: viagem neste mês, dia ainda não definido (' + STATUS[v.status].rotulo.toLowerCase() + ')</div>').join('');
    }
    html += '<div class="legenda">' + Object.keys(STATUS).map(k => '<span class="pilula st-' + k + '">' + STATUS[k].emoji + ' ' + STATUS[k].rotulo + '</span>').join('') + '</div>';

    if (estado.diaSel) {
      const sel = estado.diaSel;
      const lista = ordenar(comData.filter(v => { const [a, b] = intervalo(v); return a <= sel && sel <= b; }));
      html += '<h3 class="dia-sel-titulo">' + esc(maiuscula(dataComSemana(sel))) + '</h3>';
      html += lista.length ? lista.map(v => cartaoViagem(v, intervalo(v)[1] < hoje)).join('') : '<p class="suave" style="margin:0 4px 8px">Nenhuma viagem neste dia.</p>';
      html += '<button class="btn btn-sec" id="nova-no-dia">＋ Nova viagem neste dia</button>';
    } else {
      html += '<p class="suave" style="margin:14px 4px">Toque em um dia para ver as viagens dele.</p>';
    }

    el.innerHTML = html;
    ligarCartoes(el);
    $$('.mes-possivel', el).forEach(d => d.addEventListener('click', () => abrirDetalhe(d.dataset.id)));
    $$('.dia', el).forEach(b => b.addEventListener('click', () => {
      const iso = b.dataset.dia;
      estado.diaSel = estado.diaSel === iso ? null : iso;
      const d = dataDe(iso);
      if (d.getMonth() !== mes) estado.calMes = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendario();
    }));
    $('#cal-ant', el).addEventListener('click', () => { estado.calMes = new Date(ano, mes - 1, 1); estado.diaSel = null; renderCalendario(); });
    $('#cal-prox', el).addEventListener('click', () => { estado.calMes = new Date(ano, mes + 1, 1); estado.diaSel = null; renderCalendario(); });
    $('#cal-hoje', el).addEventListener('click', () => { const d = new Date(); estado.calMes = new Date(d.getFullYear(), d.getMonth(), 1); estado.diaSel = hojeISO(); renderCalendario(); });
    const nd = $('#nova-no-dia', el);
    if (nd) nd.addEventListener('click', () => abrirFormulario(null, { inicio: estado.diaSel }));
  }

  // ======================= Camadas (telas por cima) =======================
  // Cada camada entra no histórico, para o botão "voltar" do Android funcionar.
  const pilha = [];
  function abrirCamada(html, aoFechar) {
    const el = document.createElement('div');
    el.className = 'camada';
    el.innerHTML = html;
    $('#camadas').appendChild(el);
    pilha.push({ el, aoFechar });
    history.pushState({ camada: pilha.length }, '');
    document.body.style.overflow = 'hidden';
    return el;
  }
  function removerTopo() {
    const topo = pilha.pop();
    if (!topo) return;
    topo.el.remove();
    if (topo.aoFechar) topo.aoFechar();
    if (!pilha.length) document.body.style.overflow = '';
  }
  // `depois` roda quando a camada já saiu da tela.
  function fecharCamada(depois) {
    if (!pilha.length) return;
    if (typeof depois === 'function') pilha[pilha.length - 1].aoFechar = depois;
    history.back();
  }
  window.addEventListener('popstate', () => { if (pilha.length) removerTopo(); });

  function trocarCamada(html, aoFechar) {
    // Substitui a camada do topo sem mexer no histórico.
    const topo = pilha[pilha.length - 1];
    topo.el.innerHTML = html;
    topo.el.scrollTop = 0;
    if (aoFechar !== undefined) topo.aoFechar = aoFechar;
    return topo.el;
  }

  // ======================= Detalhe da viagem =======================
  function htmlDetalhe(v) {
    const st = STATUS[v.status] || STATUS.possivel;
    let h = '<div class="camada-topo"><button class="voltar" data-fechar>‹ Voltar</button><h2>' + esc(v.destino) + '</h2>' +
      '<button class="btn-peq" data-editar>✏️ Editar</button></div><div class="camada-corpo">';

    h += '<div class="bloco"><p class="destaque-destino">' + esc(v.destino) + '</p>' +
      '<div class="suave">📅 ' + esc(textoQuando(v)) + '</div>' +
      (v.pessoas && v.pessoas.length ? '<div class="suave" style="margin-top:4px">👥 ' + esc(v.pessoas.join(', ')) + '</div>' : '') +
      '<div class="rotulo" style="font-weight:700;margin:14px 0 8px">Situação <span class="opcional">(toque para mudar)</span></div>' +
      '<div class="chips">' + Object.keys(STATUS).map(k => '<button class="chip st-' + k + (k === v.status ? ' sel' : '') + '" data-status="' + k + '">' + STATUS[k].emoji + ' ' + STATUS[k].rotulo + '</button>').join('') + '</div></div>';

    // Voos
    h += '<div class="bloco"><h3>✈️ Voos</h3>';
    if (!(v.voos || []).length) {
      h += '<p class="suave" style="margin:0">Nenhum voo cadastrado. Toque em “Editar” para adicionar companhia, horário e localizador.</p>';
    }
    (v.voos || []).forEach(voo => {
      const parte = momentoVoo(voo);
      let checkin = '';
      if (parte && v.status !== 'concluida' && parte > new Date()) {
        const abre = new Date(parte.getTime() - horasCheckin(voo) * 3600000);
        checkin = abre <= new Date()
          ? '<div class="checkin">🎫 <b>Check-in aberto</b></div>'
          : '<div class="checkin suave">🎫 Check-in abre ' + esc(dataComSemana(isoDe(abre))) + ' às ' + horaDe(abre) + ' (aprox.)</div>';
      }
      const rota = voo.origem || voo.destino ? esc(voo.origem || '?') + ' → ' + esc(voo.destino || '?') : '';
      h += '<div class="voo" data-voo="' + esc(voo.id) + '">' +
        '<div class="voo-cab"><span class="voo-trecho">' + esc(voo.trecho || 'Voo') + (rota ? ' · ' + rota : '') + '</span><span class="voo-num">' + esc([voo.companhia, voo.numero].filter(Boolean).join(' ')) + '</span></div>' +
        '<div class="voo-grade">' +
          '<div><div class="rot">Data</div><div class="val">' + (voo.data ? esc(dataComSemana(voo.data)) : '—') + '</div></div>' +
          '<div><div class="rot">Horário</div><div class="val">' + esc(voo.horario || '—') + '</div></div>' +
          (voo.valor ? '<div><div class="rot">Valor pago</div><div class="val">R$ ' + esc(voo.valor) + '</div></div>' : '') +
        '</div>' +
        (voo.localizador ? '<div class="localizador"><div><div class="rot suave" style="font-size:13px;font-weight:600">LOCALIZADOR</div><span class="codigo">' + esc(voo.localizador) + '</span></div><button class="btn-peq" data-copiar="' + esc(voo.localizador) + '">Copiar</button></div>' : '') +
        checkin +
        htmlAnexos(voo.anexos) +
        '<button class="btn-anexar" data-anexar-voo="' + esc(voo.id) + '">📎 Anexar cartão de embarque</button>' +
      '</div>';
    });
    h += '</div>';

    // Lugares
    h += '<div class="bloco"><h3>📍 Lugares para ir</h3>';
    if (!(v.lugares || []).length) h += '<p class="suave" style="margin:0">Nenhum lugar ainda. Toque em “Editar” para adicionar restaurantes, passeios ou hotel.</p>';
    (v.lugares || []).forEach(l => {
      const t = TIPOS_LUGAR[l.tipo] || TIPOS_LUGAR.outro;
      h += '<div class="lugar"><span class="ic">' + t.emoji + '</span><div class="info"><b>' + esc(l.nome) + '</b>' +
        '<span class="suave" style="font-size:15px">' + esc([t.rotulo, l.data ? dataComSemana(l.data) : '', l.obs].filter(Boolean).join(' · ')) + '</span></div>' +
        '<a class="btn-peq" style="text-decoration:none;color:var(--azul)" href="' + esc(linkMaps(l, v)) + '" target="_blank" rel="noopener">🗺️ Mapa</a></div>';
    });
    h += '</div>';

    // Documentos gerais
    h += '<div class="bloco"><h3>📎 Outros documentos</h3><p class="suave" style="margin:0">Reserva de hotel, seguro viagem, ingressos…</p>' +
      htmlAnexos(v.anexos) +
      '<button class="btn-anexar" data-anexar-viagem>📎 Anexar documento</button></div>';

    if (v.obs) h += '<div class="bloco"><h3>📝 Observações</h3><div style="white-space:pre-wrap">' + esc(v.obs) + '</div></div>';

    h += '<div class="acoes-rodape"><button class="btn btn-sec" data-editar>✏️ Editar viagem</button><button class="btn btn-perigo" data-excluir>🗑️ Excluir viagem</button></div>';
    h += '<input type="file" id="arquivo" accept="image/*,application/pdf" hidden></div>';
    return h;
  }

  function htmlAnexos(lista) {
    if (!lista || !lista.length) return '';
    return '<div class="anexos">' + lista.map(a =>
      '<button class="anexo" data-anexo="' + esc(a.id) + '" aria-label="Abrir ' + esc(a.nome) + '">' +
        (a.mime === 'application/pdf' ? '<span class="pdf">📄</span><span class="nome">' + esc(a.nome) + '</span>' : '<span class="girando"></span>') +
      '</button>').join('') + '</div>';
  }

  function abrirDetalhe(id) {
    const v = viagemPorId(id);
    if (!v) return;
    const el = abrirCamada(htmlDetalhe(v));
    ligarDetalhe(el, id);
  }

  function atualizarDetalhe(id) {
    const v = viagemPorId(id);
    if (!v) { fecharCamada(); return; }
    const el = trocarCamada(htmlDetalhe(v));
    ligarDetalhe(el, id);
  }

  function ligarDetalhe(el, id) {
    const v = () => viagemPorId(id);
    $$('[data-fechar]', el).forEach(b => b.addEventListener('click', fecharCamada));
    $$('[data-editar]', el).forEach(b => b.addEventListener('click', () => abrirFormulario(v())));
    $$('[data-status]', el).forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.status === v().status) return;
      try {
        await salvarViagem(Object.assign({}, v(), { status: b.dataset.status }));
        atualizarDetalhe(id);
        toast('Situação: ' + STATUS[b.dataset.status].rotulo);
      } catch (e) { tratarErro(e); }
    }));
    $$('[data-copiar]', el).forEach(b => b.addEventListener('click', () => {
      const txt = b.dataset.copiar;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(() => toast('Localizador copiado: ' + txt))
        .catch(() => toast('Localizador: ' + txt, 4000));
    }));
    $('[data-excluir]', el).addEventListener('click', async () => {
      if (!confirm('Excluir a viagem para ' + v().destino + '? Os anexos também serão apagados.')) return;
      try {
        await Api.excluir(id);
        estado.viagens = estado.viagens.filter(x => x.id !== id);
        fecharCamada();
        render();
        toast('Viagem excluída');
      } catch (e) { tratarErro(e); }
    });

    // Anexos: miniaturas e envio
    $$('[data-anexo]', el).forEach(async b => {
      const anexo = todosAnexos(v()).find(a => a.id === b.dataset.anexo);
      b.addEventListener('click', () => abrirVisor(id, anexo));
      if (anexo && anexo.mime !== 'application/pdf') {
        try {
          const blob = await Api.pegarAnexo(anexo.id);
          b.innerHTML = '<img alt="" src="' + URL.createObjectURL(blob) + '">';
        } catch (e) { b.innerHTML = '<span class="pdf">🖼️</span><span class="nome">' + esc(anexo.nome) + '</span>'; }
      }
    });
    const entrada = $('#arquivo', el);
    let destinoAnexo = null;
    $$('[data-anexar-voo]', el).forEach(b => b.addEventListener('click', () => { destinoAnexo = b.dataset.anexarVoo; entrada.click(); }));
    $('[data-anexar-viagem]', el).addEventListener('click', () => { destinoAnexo = null; entrada.click(); });
    entrada.addEventListener('change', async () => {
      const arq = entrada.files[0];
      entrada.value = '';
      if (!arq) return;
      try {
        toast('Enviando anexo…', 60000);
        const pronto = await prepararArquivo(arq);
        const anexo = await Api.enviarAnexo(pronto.blob, pronto.nome);
        const copia = JSON.parse(JSON.stringify(v()));
        if (destinoAnexo) {
          const voo = copia.voos.find(x => x.id === destinoAnexo);
          voo.anexos = (voo.anexos || []).concat(anexo);
        } else {
          copia.anexos = (copia.anexos || []).concat(anexo);
        }
        await salvarViagem(copia);
        atualizarDetalhe(id);
        toast('Anexo salvo ✔');
      } catch (e) { tratarErro(e); }
    });
  }

  // Reduz fotos grandes (mantendo nitidez suficiente para o QR code) e valida PDFs.
  async function prepararArquivo(arq) {
    const LIMITE_PDF = 10 * 1024 * 1024;
    if (arq.type === 'application/pdf') {
      if (arq.size > LIMITE_PDF) throw new Error('PDF muito grande (máximo 10 MB).');
      return { blob: arq, nome: arq.name };
    }
    if (!/^image\//.test(arq.type)) throw new Error('Use uma foto, print ou PDF.');
    const url = URL.createObjectURL(arq);
    try {
      const img = await new Promise((ok, falha) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => falha(new Error('Não consegui abrir essa imagem.'));
        i.src = url;
      });
      const MAX = 2000;
      const escala = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * escala);
      c.height = Math.round(img.naturalHeight * escala);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.88));
      const nome = (arq.name || 'imagem').replace(/\.[^.]+$/, '') + '.jpg';
      return blob.size < arq.size || arq.type !== 'image/jpeg' ? { blob, nome } : { blob: arq, nome: arq.name };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ======================= Visualizador de anexo =======================
  async function abrirVisor(viagemId, anexo) {
    if (!anexo) return;
    const el = abrirCamada(
      '<div class="visor"><div class="camada-topo"><button class="voltar" data-fechar>‹ Voltar</button><h2>' + esc(anexo.nome) + '</h2>' +
      '<button class="btn-peq" data-remover style="color:var(--perigo)">Remover</button></div>' +
      '<div class="visor-img"><div class="carregando"><span class="girando"></span></div></div></div>'
    );
    $('[data-fechar]', el).addEventListener('click', fecharCamada);
    $('[data-remover]', el).addEventListener('click', async () => {
      if (!confirm('Remover este anexo?')) return;
      try {
        await Api.excluirAnexo(anexo.id);
        const copia = JSON.parse(JSON.stringify(viagemPorId(viagemId)));
        copia.anexos = (copia.anexos || []).filter(a => a.id !== anexo.id);
        (copia.voos || []).forEach(voo => { voo.anexos = (voo.anexos || []).filter(a => a.id !== anexo.id); });
        await salvarViagem(copia);
        fecharCamada(() => atualizarDetalhe(viagemId));
        toast('Anexo removido');
      } catch (e) { tratarErro(e); }
    });
    try {
      const blob = await Api.pegarAnexo(anexo.id);
      const url = URL.createObjectURL(blob);
      const area = $('.visor-img', el);
      if (anexo.mime === 'application/pdf') {
        area.innerHTML = '<div style="display:flex;flex-direction:column;width:100%;height:100%;gap:10px">' +
          '<iframe src="' + url + '" title="' + esc(anexo.nome) + '"></iframe>' +
          '<a class="btn btn-sec" style="text-align:center;text-decoration:none" href="' + url + '" target="_blank">Abrir PDF em tela cheia</a></div>';
      } else {
        area.innerHTML = '<img alt="' + esc(anexo.nome) + '" src="' + url + '">';
      }
    } catch (e) {
      $('.visor-img', el).innerHTML = '<p class="suave" style="padding:20px;text-align:center">Não foi possível abrir o anexo.<br>Verifique a internet e tente de novo.</p>';
    }
  }

  // ======================= Formulário =======================
  function viagemVazia(preset) {
    return Object.assign({
      id: '', destino: '', tipo: 'dia', inicio: '', fim: '', mes: '', status: 'falta_comprar',
      pessoas: [], voos: [], lugares: [], anexos: [], obs: ''
    }, preset || {});
  }

  function abrirFormulario(original, preset) {
    const v = JSON.parse(JSON.stringify(original || viagemVazia(preset)));
    if (!v.mes) { const d = new Date(); d.setMonth(d.getMonth() + 1); v.mes = isoDe(d).slice(0, 7); }
    const editando = !!original;
    const el = abrirCamada('');

    function desenhar() {
      const anoAtual = new Date().getFullYear();
      const [mesAno, mesNum] = v.mes.split('-');
      let h = '<div class="camada-topo"><button class="voltar" data-fechar>Cancelar</button><h2>' + (editando ? 'Editar viagem' : 'Nova viagem') + '</h2></div><div class="camada-corpo">';

      h += '<div class="bloco">' +
        '<div class="campo"><label for="f-destino">Para onde?</label><input id="f-destino" value="' + esc(v.destino) + '" placeholder="Ex.: Recife" autocomplete="off"></div>' +
        '<div class="campo"><span class="rotulo">Quando?</span><div class="chips">' +
          [['dia', 'Um dia'], ['periodo', 'Ida e volta'], ['mes', 'Só sei o mês']].map(t => '<button class="chip' + (v.tipo === t[0] ? ' sel' : '') + '" data-tipo="' + t[0] + '">' + t[1] + '</button>').join('') +
        '</div></div>';
      if (v.tipo === 'dia') {
        h += '<div class="campo"><label for="f-inicio">Data</label><input type="date" id="f-inicio" value="' + esc(v.inicio) + '"></div>';
      } else if (v.tipo === 'periodo') {
        h += '<div class="duas"><div class="campo"><label for="f-inicio">Ida</label><input type="date" id="f-inicio" value="' + esc(v.inicio) + '"></div>' +
          '<div class="campo"><label for="f-fim">Volta</label><input type="date" id="f-fim" value="' + esc(v.fim) + '"></div></div>';
      } else {
        h += '<div class="duas"><div class="campo"><label for="f-mes">Mês</label><select id="f-mes">' +
          MESES.map((m, i) => '<option value="' + String(i + 1).padStart(2, '0') + '"' + (Number(mesNum) === i + 1 ? ' selected' : '') + '>' + maiuscula(m) + '</option>').join('') +
          '</select></div><div class="campo"><label for="f-ano">Ano</label><select id="f-ano">' +
          [0, 1, 2, 3].map(k => anoAtual + k).map(a => '<option' + (Number(mesAno) === a ? ' selected' : '') + '>' + a + '</option>').join('') +
          '</select></div></div>';
      }
      h += '</div>';

      h += '<div class="bloco"><div class="campo" style="margin:0"><span class="rotulo">Situação</span><div class="chips">' +
        Object.keys(STATUS).map(k => '<button class="chip st-' + k + (v.status === k ? ' sel' : '') + '" data-st="' + k + '">' + STATUS[k].emoji + ' ' + STATUS[k].rotulo + '</button>').join('') +
        '</div></div></div>';

      h += '<div class="bloco"><div class="campo" style="margin:0"><span class="rotulo">Quem vai? <span class="opcional">(opcional)</span></span><div class="chips">' +
        estado.pessoas.map(p => '<button class="chip' + (v.pessoas.includes(p) ? ' sel' : '') + '" data-pessoa="' + esc(p) + '">' + esc(p) + '</button>').join('') +
        '</div></div></div>';

      // Voos
      h += '<div class="bloco"><h3>✈️ Voos <span class="opcional">(opcional)</span></h3>';
      v.voos.forEach((voo, i) => {
        h += '<div class="sub-bloco" data-i="' + i + '"><div class="sub-cab"><span>Voo ' + (i + 1) + '</span><button class="remover" data-rem-voo="' + i + '">Remover</button></div>' +
          '<div class="duas"><div class="campo"><label>Trecho</label><select data-c="trecho">' +
            ['Ida', 'Volta', 'Conexão'].map(t => '<option' + (voo.trecho === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
          '<div class="campo"><label>Companhia</label><input data-c="companhia" list="lista-cias" value="' + esc(voo.companhia) + '" placeholder="LATAM"></div></div>' +
          '<div class="duas"><div class="campo"><label>Data</label><input type="date" data-c="data" value="' + esc(voo.data) + '"></div>' +
          '<div class="campo"><label>Horário</label><input type="time" data-c="horario" value="' + esc(voo.horario) + '"></div></div>' +
          '<div class="duas"><div class="campo"><label>Nº do voo</label><input data-c="numero" value="' + esc(voo.numero) + '" placeholder="LA 3456" autocapitalize="characters"></div>' +
          '<div class="campo"><label>Localizador</label><input data-c="localizador" value="' + esc(voo.localizador) + '" placeholder="XKQ7TZ" autocapitalize="characters" autocomplete="off"></div></div>' +
          '<details class="mais-campos"><summary>＋ Mais detalhes (valor, aeroportos, check-in)</summary>' +
            '<div class="campo"><label>Valor pago (R$)</label><input data-c="valor" inputmode="decimal" value="' + esc(voo.valor) + '" placeholder="689,90"></div>' +
            '<div class="duas"><div class="campo"><label>De</label><input data-c="origem" value="' + esc(voo.origem) + '" placeholder="GRU" autocapitalize="characters"></div>' +
            '<div class="campo"><label>Para</label><input data-c="destino" value="' + esc(voo.destino) + '" placeholder="REC" autocapitalize="characters"></div></div>' +
            '<div class="campo"><label>Check-in abre quantas horas antes?</label><input data-c="checkinHoras" inputmode="numeric" value="' + esc(voo.checkinHoras || '') + '" placeholder="' + horasCheckin(voo) + '">' +
            '<div class="dica">Deixe vazio para usar o padrão (48h; Azul 72h).</div></div>' +
          '</details></div>';
      });
      h += '<button class="btn btn-sec" data-add-voo>＋ Adicionar voo</button></div>';

      // Lugares
      h += '<div class="bloco"><h3>📍 Lugares para ir <span class="opcional">(opcional)</span></h3>';
      v.lugares.forEach((l, i) => {
        h += '<div class="sub-bloco" data-l="' + i + '"><div class="sub-cab"><span>Lugar ' + (i + 1) + '</span><button class="remover" data-rem-lugar="' + i + '">Remover</button></div>' +
          '<div class="duas"><div class="campo"><label>Tipo</label><select data-c="tipo">' +
            Object.keys(TIPOS_LUGAR).map(k => '<option value="' + k + '"' + (l.tipo === k ? ' selected' : '') + '>' + TIPOS_LUGAR[k].emoji + ' ' + TIPOS_LUGAR[k].rotulo + '</option>').join('') + '</select></div>' +
          '<div class="campo"><label>Dia <span class="opcional">(opcional)</span></label><input type="date" data-c="data" value="' + esc(l.data) + '"></div></div>' +
          '<div class="campo"><label>Nome</label><input data-c="nome" value="' + esc(l.nome) + '" placeholder="Ex.: Restaurante Leite"></div>' +
          '<div class="campo"><label>Link do Google Maps <span class="opcional">(opcional)</span></label><input type="url" data-c="link" value="' + esc(l.link) + '" placeholder="Cole o link aqui">' +
          '<div class="dica">Sem link, o botão “Mapa” procura pelo nome.</div></div>' +
          '<div class="campo"><label>Observação <span class="opcional">(opcional)</span></label><input data-c="obs" value="' + esc(l.obs) + '" placeholder="Ex.: reservar mesa"></div></div>';
      });
      h += '<button class="btn btn-sec" data-add-lugar>＋ Adicionar lugar</button></div>';

      h += '<div class="bloco"><div class="campo" style="margin:0"><label for="f-obs">Observações <span class="opcional">(opcional)</span></label><textarea id="f-obs" placeholder="Qualquer coisa importante">' + esc(v.obs) + '</textarea></div></div>';

      h += '<datalist id="lista-cias">' + COMPANHIAS.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>';
      h += '<div class="acoes-rodape"><button class="btn btn-prim" data-salvar>Salvar viagem</button><button class="btn btn-sec" data-fechar>Cancelar</button></div></div>';
      return h;
    }

    // Copia o que está digitado na tela para o objeto, antes de redesenhar ou salvar.
    function lerCampos() {
      const val = sel => { const e = $(sel, el); return e ? e.value.trim() : null; };
      v.destino = val('#f-destino') || '';
      if (v.tipo === 'mes') { v.mes = val('#f-ano') + '-' + val('#f-mes'); }
      else {
        v.inicio = val('#f-inicio') || '';
        if (v.tipo === 'periodo') v.fim = val('#f-fim') || '';
      }
      v.obs = val('#f-obs') || '';
      $$('[data-i]', el).forEach(b => {
        const voo = v.voos[Number(b.dataset.i)];
        $$('[data-c]', b).forEach(inp => {
          let x = inp.value.trim();
          if (inp.dataset.c === 'localizador' || inp.dataset.c === 'numero' || inp.dataset.c === 'origem' || inp.dataset.c === 'destino') x = x.toUpperCase();
          voo[inp.dataset.c] = x;
        });
      });
      $$('[data-l]', el).forEach(b => {
        const l = v.lugares[Number(b.dataset.l)];
        $$('[data-c]', b).forEach(inp => { l[inp.dataset.c] = inp.value.trim(); });
      });
    }

    function redesenhar() {
      const y = el.scrollTop;
      el.innerHTML = desenhar();
      el.scrollTop = y;
      ligar();
    }

    function ligar() {
      $$('[data-fechar]', el).forEach(b => b.addEventListener('click', fecharCamada));
      $$('[data-tipo]', el).forEach(b => b.addEventListener('click', () => {
        lerCampos(); v.tipo = b.dataset.tipo;
        if (v.tipo === 'mes' && v.status === 'falta_comprar' && !editando) v.status = 'possivel';
        redesenhar();
      }));
      $$('[data-st]', el).forEach(b => b.addEventListener('click', () => { lerCampos(); v.status = b.dataset.st; redesenhar(); }));
      $$('[data-pessoa]', el).forEach(b => b.addEventListener('click', () => {
        lerCampos();
        const p = b.dataset.pessoa;
        v.pessoas = v.pessoas.includes(p) ? v.pessoas.filter(x => x !== p) : v.pessoas.concat(p);
        redesenhar();
      }));
      $('[data-add-voo]', el).addEventListener('click', () => {
        lerCampos();
        const anterior = v.voos[v.voos.length - 1];
        const ehVolta = anterior && anterior.trecho === 'Ida';
        v.voos.push({
          id: Api.novoId('voo'), trecho: v.voos.length ? (ehVolta ? 'Volta' : 'Conexão') : 'Ida',
          companhia: anterior ? anterior.companhia : '', numero: '',
          data: ehVolta && v.tipo === 'periodo' ? v.fim : (!v.voos.length ? v.inicio : ''),
          horario: '', localizador: anterior ? anterior.localizador : '', valor: '',
          origem: ehVolta ? anterior.destino : '', destino: ehVolta ? anterior.origem : '', anexos: []
        });
        redesenhar();
      });
      $$('[data-rem-voo]', el).forEach(b => b.addEventListener('click', () => {
        lerCampos();
        const voo = v.voos[Number(b.dataset.remVoo)];
        if ((voo.anexos || []).length && !confirm('Esse voo tem anexos. Remover mesmo assim?')) return;
        v.voos.splice(Number(b.dataset.remVoo), 1);
        redesenhar();
      }));
      $('[data-add-lugar]', el).addEventListener('click', () => {
        lerCampos();
        v.lugares.push({ id: Api.novoId('l'), tipo: 'restaurante', nome: '', data: '', link: '', obs: '' });
        redesenhar();
      });
      $$('[data-rem-lugar]', el).forEach(b => b.addEventListener('click', () => { lerCampos(); v.lugares.splice(Number(b.dataset.remLugar), 1); redesenhar(); }));
      $('[data-salvar]', el).addEventListener('click', salvar);
    }

    async function salvar() {
      lerCampos();
      if (!v.destino) { toast('Escreva para onde é a viagem.'); $('#f-destino', el).focus(); return; }
      if (v.tipo !== 'mes' && !v.inicio) { toast('Escolha a data da viagem.'); return; }
      if (v.tipo === 'periodo' && v.fim && v.fim < v.inicio) { toast('A volta está antes da ida. Confira as datas.'); return; }
      if (v.tipo === 'periodo' && !v.fim) v.tipo = 'dia';
      if (v.tipo === 'dia') v.fim = '';
      if (v.tipo === 'mes') { v.inicio = ''; v.fim = ''; } else { v.mes = ''; }
      v.lugares = v.lugares.filter(l => l.nome);
      // Anexos de voos removidos no formulário vão para o lixo também.
      const antes = original ? (original.voos || []).flatMap(x => x.anexos || []) : [];
      const depois = v.voos.flatMap(x => x.anexos || []).map(a => a.id);
      const botao = $('[data-salvar]', el);
      botao.disabled = true; botao.textContent = 'Salvando…';
      try {
        const salva = await salvarViagem(v);
        antes.filter(a => !depois.includes(a.id)).forEach(a => Api.excluirAnexo(a.id).catch(() => {}));
        fecharCamada(editando ? () => atualizarDetalhe(salva.id) : null);
        toast(editando ? 'Viagem atualizada ✔' : 'Viagem salva ✔');
      } catch (e) {
        botao.disabled = false; botao.textContent = 'Salvar viagem';
        tratarErro(e);
      }
    }

    el.innerHTML = desenhar();
    ligar();
    if (!editando) setTimeout(() => { const d = $('#f-destino', el); if (d) d.focus(); }, 250);
  }

  // ======================= Configurações =======================
  function abrirConfig() {
    const pessoas = estado.pessoas.slice();
    const el = abrirCamada('');
    function desenhar() {
      let h = '<div class="camada-topo"><button class="voltar" data-fechar>‹ Voltar</button><h2>Configurações</h2></div><div class="camada-corpo">';
      h += '<div class="bloco"><h3>👥 Pessoas da família</h3>' +
        pessoas.map((p, i) => '<div class="campo" style="display:flex;gap:8px;align-items:center"><input data-p="' + i + '" value="' + esc(p) + '"><button class="remover" data-rem-p="' + i + '">Remover</button></div>').join('') +
        '<button class="btn btn-sec" data-add-p style="margin-bottom:10px">＋ Adicionar pessoa</button>' +
        '<button class="btn btn-prim" data-salvar-p>Salvar nomes</button></div>';

      h += '<div class="bloco"><h3>📲 Instalar no celular</h3>' +
        '<p style="margin:0 0 8px"><b>iPhone (Safari):</b> toque no botão compartilhar (quadrado com seta ↑) e depois em <b>“Adicionar à Tela de Início”</b>.</p>' +
        '<p style="margin:0"><b>Android (Chrome):</b> toque no menu <b>⋮</b> e depois em <b>“Instalar app”</b> ou <b>“Adicionar à tela inicial”</b>.</p></div>';

      if (Api.modo === 'demo') {
        h += '<div class="bloco"><h3>🧪 Modo demonstração</h3><p class="suave" style="margin-top:0">Os dados ficam só neste aparelho. Quando o app for conectado à planilha do Google, todos da família verão as mesmas viagens.</p>' +
          '<button class="btn btn-perigo" data-restaurar>Apagar tudo e voltar aos exemplos</button></div>';
      } else {
        h += '<div class="bloco"><h3>🔒 Conexão</h3><p class="suave" style="margin-top:0">Conectado à planilha da família.</p>' +
          '<button class="btn btn-perigo" data-sair>Esquecer PIN neste aparelho</button></div>';
      }
      h += '</div>';
      return h;
    }
    function lerNomes() { $$('[data-p]', el).forEach(inp => { pessoas[Number(inp.dataset.p)] = inp.value.trim(); }); }
    function ligar() {
      $$('[data-fechar]', el).forEach(b => b.addEventListener('click', fecharCamada));
      $('[data-add-p]', el).addEventListener('click', () => { lerNomes(); pessoas.push(''); el.innerHTML = desenhar(); ligar(); const ult = $$('[data-p]', el).pop(); if (ult) ult.focus(); });
      $$('[data-rem-p]', el).forEach(b => b.addEventListener('click', () => { lerNomes(); pessoas.splice(Number(b.dataset.remP), 1); el.innerHTML = desenhar(); ligar(); }));
      $('[data-salvar-p]', el).addEventListener('click', async () => {
        lerNomes();
        const limpos = pessoas.filter(Boolean).filter((p, i, a) => a.indexOf(p) === i);
        try {
          await Api.salvarPessoas(limpos);
          estado.pessoas = limpos;
          toast('Nomes salvos ✔');
          fecharCamada();
        } catch (e) { tratarErro(e); }
      });
      const r = $('[data-restaurar]', el);
      if (r) r.addEventListener('click', async () => {
        if (!confirm('Apagar todas as viagens deste aparelho e voltar aos exemplos?')) return;
        await Api.restaurarExemplos();
        fecharCamada();
        carregar();
      });
      const s = $('[data-sair]', el);
      if (s) s.addEventListener('click', () => {
        if (!confirm('Esquecer o PIN? Será preciso digitar de novo para ver as viagens.')) return;
        Api.sair();
        location.reload();
      });
    }
    el.innerHTML = desenhar();
    ligar();
  }

  // ======================= PIN =======================
  function mostrarPin() {
    if ($('.pin-tela')) return;
    const el = document.createElement('div');
    el.className = 'camada';
    el.style.zIndex = 50;
    el.innerHTML = '<div class="pin-tela"><div class="grande">🔒</div><h2>Viagens da Família</h2>' +
      '<p class="suave" style="margin:0">Digite o PIN da família.<br>Você só precisa fazer isso uma vez neste celular.</p>' +
      '<input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off" aria-label="PIN">' +
      '<div class="pin-erro"></div><button class="btn btn-prim" style="max-width:280px">Entrar</button></div>';
    document.body.appendChild(el);
    const inp = $('.pin-input', el), erro = $('.pin-erro', el), btn = $('button', el);
    async function tentar() {
      const pin = inp.value.trim();
      if (!pin) { erro.textContent = 'Digite o PIN.'; return; }
      btn.disabled = true; btn.textContent = 'Conferindo…'; erro.textContent = '';
      try {
        await Api.entrar(pin);
        el.remove();
        carregar();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Entrar';
        erro.textContent = e.codigo === 'PIN' ? 'PIN errado. Tente de novo.'
          : e.codigo === 'BLOQUEADO' ? 'Muitas tentativas. Espere 15 minutos.'
          : e.codigo === 'OFFLINE' ? 'Sem internet.' : 'Erro: ' + e.message;
        inp.value = ''; inp.focus();
      }
    }
    btn.addEventListener('click', tentar);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') tentar(); });
    setTimeout(() => inp.focus(), 200);
  }

  // ======================= Início =======================
  $$('.aba').forEach(b => b.addEventListener('click', () => {
    estado.tela = b.dataset.tela;
    try { localStorage.setItem('viagens_tela', estado.tela); } catch (e) { /* ignora */ }
    render();
    window.scrollTo(0, 0);
  }));
  $('#btn-nova').addEventListener('click', () => abrirFormulario(null));
  $('#btn-config').addEventListener('click', abrirConfig);

  // Ao voltar para o app (ex.: depois de horas em segundo plano), recarrega para ver o que a família mudou.
  let ultimaCarga = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimaCarga > 5 * 60000 && !pilha.length) {
      ultimaCarga = Date.now();
      carregar();
    }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  carregar();
})();
