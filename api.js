// Camada de dados. Dois modos:
//  - demonstração (sem API_URL): tudo salvo neste aparelho, com viagens de exemplo;
//  - conectado: conversa com o Apps Script da planilha, protegido pelo PIN.
(function () {
  const API_URL = (window.APP_CONFIG && window.APP_CONFIG.API_URL || '').trim();
  const CHAVE_PIN = 'viagens_pin';
  const CHAVE_DEMO = 'viagens_demo_v1';
  const CHAVE_CACHE = 'viagens_cache_v1';

  // ---------- Armazém local de anexos (IndexedDB) ----------
  // No modo conectado serve de cópia offline; no modo demo é o próprio armazenamento.
  let dbPromessa = null;
  function abrirDb() {
    if (!dbPromessa) {
      dbPromessa = new Promise((ok, falha) => {
        const req = indexedDB.open('viagens', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('anexos');
        req.onsuccess = () => ok(req.result);
        req.onerror = () => falha(req.error);
      });
    }
    return dbPromessa;
  }
  async function idb(modo, fn) {
    const db = await abrirDb();
    return new Promise((ok, falha) => {
      const tx = db.transaction('anexos', modo);
      const req = fn(tx.objectStore('anexos'));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => falha(tx.error);
    });
  }
  const anexoLocal = {
    pegar: id => idb('readonly', s => s.get(id)).catch(() => null),
    guardar: (id, valor) => idb('readwrite', s => s.put(valor, id)).catch(() => {}),
    apagar: id => idb('readwrite', s => s.delete(id)).catch(() => {})
  };

  function lerJson(chave, padrao) {
    try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; }
  }
  function gravarJson(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* armazenamento cheio ou bloqueado */ }
  }

  function novoId(prefixo) {
    return (prefixo || 'v') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blobParaBase64(blob) {
    return new Promise((ok, falha) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = () => falha(r.error);
      r.readAsDataURL(blob);
    });
  }
  function base64ParaBlob(b64, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // ---------- Erros ----------
  class ErroApi extends Error {
    constructor(codigo, mensagem) { super(mensagem || codigo); this.codigo = codigo; }
  }

  // ---------- Modo conectado ----------
  async function chamar(acao, dados) {
    let resp;
    try {
      // Sem cabeçalho Content-Type: o navegador manda text/plain e o Google aceita sem bloqueio de CORS.
      resp = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(Object.assign({ acao, pin: localStorage.getItem(CHAVE_PIN) || '' }, dados || {}))
      });
    } catch (e) {
      throw new ErroApi('OFFLINE', 'Sem conexão com a internet.');
    }
    let json;
    try { json = await resp.json(); } catch (e) { throw new ErroApi('SERVIDOR', 'Resposta inesperada do Google.'); }
    if (!json.ok) throw new ErroApi(json.erro || 'SERVIDOR', json.mensagem);
    return json.dados;
  }

  const remoto = {
    async carregar() {
      try {
        const dados = await chamar('listar');
        gravarJson(CHAVE_CACHE, dados);
        return Object.assign({ offline: false }, dados);
      } catch (e) {
        if (e.codigo === 'OFFLINE') {
          const cache = lerJson(CHAVE_CACHE, null);
          if (cache) return Object.assign({ offline: true }, cache);
        }
        throw e;
      }
    },
    async entrar(pin) {
      localStorage.setItem(CHAVE_PIN, pin);
      try { await chamar('listar'); }
      catch (e) { if (e.codigo === 'PIN' || e.codigo === 'BLOQUEADO') localStorage.removeItem(CHAVE_PIN); throw e; }
    },
    salvar: viagem => chamar('salvar', { viagem }),
    excluir: id => chamar('excluir', { id }),
    salvarPessoas: pessoas => chamar('salvarPessoas', { pessoas }),
    async enviarAnexo(blob, nome) {
      const base64 = await blobParaBase64(blob);
      const r = await chamar('enviarAnexo', { nome, mime: blob.type, base64 });
      await anexoLocal.guardar(r.id, { mime: blob.type, blob });
      return { id: r.id, nome, mime: blob.type, tamanho: blob.size };
    },
    async pegarAnexo(id) {
      const local = await anexoLocal.pegar(id);
      if (local) return local.blob;
      const r = await chamar('pegarAnexo', { id });
      const blob = base64ParaBlob(r.base64, r.mime);
      await anexoLocal.guardar(id, { mime: r.mime, blob });
      return blob;
    },
    async excluirAnexo(id) {
      await anexoLocal.apagar(id);
      await chamar('excluirAnexo', { id });
    },
    sair() { localStorage.removeItem(CHAVE_PIN); localStorage.removeItem(CHAVE_CACHE); }
  };

  // ---------- Modo demonstração ----------
  const demo = {
    async carregar() {
      let dados = lerJson(CHAVE_DEMO, null);
      if (!dados) dados = await criarExemplos();
      return { viagens: dados.viagens, pessoas: dados.pessoas, offline: false };
    },
    async entrar() {},
    async salvar(viagem) {
      const dados = lerJson(CHAVE_DEMO, { viagens: [], pessoas: [] });
      viagem = Object.assign({}, viagem, { atualizadoEm: new Date().toISOString() });
      if (!viagem.id) viagem.id = novoId('v');
      const i = dados.viagens.findIndex(v => v.id === viagem.id);
      if (i >= 0) dados.viagens[i] = viagem; else dados.viagens.push(viagem);
      gravarJson(CHAVE_DEMO, dados);
      return viagem;
    },
    async excluir(id) {
      const dados = lerJson(CHAVE_DEMO, { viagens: [], pessoas: [] });
      const v = dados.viagens.find(x => x.id === id);
      if (v) (v.anexos || []).forEach(a => anexoLocal.apagar(a.id));
      dados.viagens = dados.viagens.filter(x => x.id !== id);
      gravarJson(CHAVE_DEMO, dados);
    },
    async salvarPessoas(pessoas) {
      const dados = lerJson(CHAVE_DEMO, { viagens: [], pessoas: [] });
      dados.pessoas = pessoas;
      gravarJson(CHAVE_DEMO, dados);
    },
    async enviarAnexo(blob, nome) {
      const id = novoId('a');
      await anexoLocal.guardar(id, { mime: blob.type, blob });
      return { id, nome, mime: blob.type, tamanho: blob.size };
    },
    async pegarAnexo(id) {
      const local = await anexoLocal.pegar(id);
      if (!local) throw new ErroApi('ANEXO', 'Anexo não encontrado neste aparelho.');
      return local.blob;
    },
    excluirAnexo: id => anexoLocal.apagar(id),
    sair() {},
    async restaurarExemplos() {
      localStorage.removeItem(CHAVE_DEMO);
      await criarExemplos();
    }
  };

  // ---------- Dados de exemplo (datas relativas a hoje) ----------
  function dataRel(dias) {
    const d = new Date(); d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mesRel(meses) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + meses);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // Desenha um cartão de embarque fictício para o exemplo.
  function cartaoEmbarqueFake(info) {
    return new Promise(ok => {
      const c = document.createElement('canvas');
      c.width = 900; c.height = 1300;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 900, 1300);
      g.fillStyle = '#1d4ed8'; g.fillRect(0, 0, 900, 190);
      g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.fillText('CARTÃO DE EMBARQUE', 50, 115);
      g.fillStyle = '#111'; g.font = 'bold 120px sans-serif';
      g.fillText(info.de, 50, 360); g.fillText(info.para, 560, 360);
      g.font = '70px sans-serif'; g.fillText('✈', 390, 345);
      const linhas = [['VOO', info.voo], ['DATA', info.data], ['EMBARQUE', info.hora], ['ASSENTO', info.assento], ['PASSAGEIRO', 'EXEMPLO / PASSAGEIRO']];
      g.font = '30px sans-serif';
      linhas.forEach((l, i) => {
        const y = 470 + i * 95;
        g.fillStyle = '#6b7280'; g.font = 'bold 26px sans-serif'; g.fillText(l[0], 50, y);
        g.fillStyle = '#111'; g.font = 'bold 44px sans-serif'; g.fillText(l[1], 50, y + 50);
      });
      // "QR code" de mentira
      let s = 7;
      const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const x0 = 520, y0 = 470, t = 11;
      for (let i = 0; i < 29; i++) for (let j = 0; j < 29; j++) {
        if (rnd() > 0.5) { g.fillStyle = '#111'; g.fillRect(x0 + i * t, y0 + j * t, t, t); }
      }
      [[0, 0], [22, 0], [0, 22]].forEach(([i, j]) => {
        g.fillStyle = '#111'; g.fillRect(x0 + i * t, y0 + j * t, 7 * t, 7 * t);
        g.fillStyle = '#fff'; g.fillRect(x0 + (i + 1) * t, y0 + (j + 1) * t, 5 * t, 5 * t);
        g.fillStyle = '#111'; g.fillRect(x0 + (i + 2) * t, y0 + (j + 2) * t, 3 * t, 3 * t);
      });
      g.fillStyle = '#b91c1c'; g.font = 'bold 40px sans-serif'; g.fillText('EXEMPLO — NÃO É REAL', 50, 1220);
      c.toBlob(b => ok(b), 'image/jpeg', 0.9);
    });
  }

  async function criarExemplos() {
    const pessoas = ['Eu', 'Mãe', 'Pessoa 3', 'Pessoa 4'];
    const fmt = iso => iso.split('-').reverse().slice(0, 2).join('/');
    const idaRecife = dataRel(5), voltaRecife = dataRel(10);

    const cartao = await cartaoEmbarqueFake({ de: 'GRU', para: 'REC', voo: 'LA 3456', data: fmt(idaRecife), hora: '07:35', assento: '14C' });
    const anexoCartao = await demo.enviarAnexo(cartao, 'Cartão de embarque - ida.jpg');

    const viagens = [
      {
        id: 'ex-recife', destino: 'Recife', tipo: 'periodo', inicio: idaRecife, fim: voltaRecife, mes: '',
        status: 'comprada', pessoas: ['Eu', 'Mãe'],
        voos: [
          { id: 'voo-ida', trecho: 'Ida', companhia: 'LATAM', numero: 'LA 3456', data: idaRecife, horario: '08:15', origem: 'GRU', destino: 'REC', localizador: 'XKQ7TZ', valor: '689,90', anexos: [anexoCartao] },
          { id: 'voo-volta', trecho: 'Volta', companhia: 'LATAM', numero: 'LA 3457', data: voltaRecife, horario: '18:40', origem: 'REC', destino: 'GRU', localizador: 'XKQ7TZ', valor: '', anexos: [] }
        ],
        lugares: [
          { id: 'l1', tipo: 'restaurante', nome: 'Restaurante Leite', data: dataRel(6), link: '', obs: 'Reservar mesa para o almoço' },
          { id: 'l2', tipo: 'passeio', nome: 'Instituto Ricardo Brennand', data: '', link: '', obs: '' },
          { id: 'l3', tipo: 'hotel', nome: 'Hotel em Boa Viagem', data: '', link: '', obs: 'Check-in a partir das 14h' }
        ],
        anexos: [], obs: 'Levar protetor solar!'
      },
      {
        id: 'ex-bh', destino: 'Belo Horizonte', tipo: 'dia', inicio: dataRel(19), fim: '', mes: '',
        status: 'falta_comprar', pessoas: ['Mãe'], voos: [], lugares: [], anexos: [],
        obs: 'Aniversário da tia. Ver preço de passagem.'
      },
      {
        id: 'ex-floripa', destino: 'Florianópolis', tipo: 'periodo', inicio: dataRel(33), fim: dataRel(37), mes: '',
        status: 'comprada', pessoas: ['Eu', 'Pessoa 3', 'Pessoa 4'],
        voos: [{ id: 'voo-f1', trecho: 'Ida', companhia: 'GOL', numero: 'G3 1240', data: dataRel(33), horario: '10:05', origem: 'CGH', destino: 'FLN', localizador: 'PLM4RD', valor: '412,00', anexos: [] }],
        lugares: [{ id: 'l4', tipo: 'restaurante', nome: 'Ostradamus', data: '', link: '', obs: '' }],
        anexos: [], obs: ''
      },
      {
        id: 'ex-dezembro', destino: 'Nordeste (a definir)', tipo: 'mes', inicio: '', fim: '', mes: mesRel(2),
        status: 'possivel', pessoas: ['Eu', 'Mãe', 'Pessoa 3', 'Pessoa 4'], voos: [], lugares: [], anexos: [],
        obs: 'Férias de fim de ano. Decidir destino.'
      },
      {
        id: 'ex-rio', destino: 'Rio de Janeiro', tipo: 'periodo', inicio: dataRel(-24), fim: dataRel(-21), mes: '',
        status: 'comprada', pessoas: ['Eu'], voos: [], lugares: [], anexos: [], obs: ''
      }
    ].map(v => Object.assign(v, { atualizadoEm: new Date().toISOString() }));

    const dados = { viagens, pessoas };
    gravarJson(CHAVE_DEMO, dados);
    return dados;
  }

  window.Api = Object.assign(API_URL ? remoto : demo, {
    modo: API_URL ? 'conectado' : 'demo',
    temPin: () => !!localStorage.getItem(CHAVE_PIN),
    novoId,
    ErroApi
  });
})();
