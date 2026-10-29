// ============================================================================
// FÍSICA DE INTERFACE: mola, projeção de inércia, resistência na borda
// Baseado em "Designing Fluid Interfaces" (WWDC 2018).
// ============================================================================

export const movimentoReduzido = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mola com os dois parâmetros da Apple: damping (0 a 1) e response (segundos).
// Sempre parte do valor atual e herda a velocidade atual, então pode ser
// interrompida e redirecionada a qualquer momento sem salto.
export function criarMola(inicial, aoAtualizar) {
  let valor = inicial;
  let velocidade = 0;
  let alvo = inicial;
  let params = { damping: 1, response: 0.4 };
  let raf = null;
  let ultimo = 0;
  let aoParar = null;

  const passo = (t) => {
    const dt = Math.min(0.064, (t - ultimo) / 1000);
    ultimo = t;
    const k = Math.pow((2 * Math.PI) / params.response, 2);
    const c = (4 * Math.PI * params.damping) / params.response;
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const a = -k * (valor - alvo) - c * velocidade;
      velocidade += a * h;
      valor += velocidade * h;
    }
    if (Math.abs(velocidade) < 1 && Math.abs(valor - alvo) < 0.5) {
      valor = alvo;
      velocidade = 0;
      raf = null;
      aoAtualizar(valor);
      const fim = aoParar;
      aoParar = null;
      if (fim) fim();
      return;
    }
    aoAtualizar(valor);
    raf = requestAnimationFrame(passo);
  };

  const parar = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  };

  return {
    get valor() { return valor; },
    get alvo() { return alvo; },
    get animando() { return raf !== null; },
    parar,
    definir(v) {
      parar();
      valor = v;
      alvo = v;
      velocidade = 0;
      aoAtualizar(v);
    },
    animarPara(destino, opcoes = {}, aoTerminar) {
      alvo = destino;
      params = {
        damping: opcoes.damping ?? 1,
        response: opcoes.response ?? 0.4
      };
      if (opcoes.velocidade !== undefined) velocidade = opcoes.velocidade;
      aoParar = aoTerminar || null;
      if (movimentoReduzido()) {
        parar();
        valor = destino;
        velocidade = 0;
        aoAtualizar(valor);
        if (aoTerminar) aoTerminar();
        return;
      }
      if (!raf) {
        ultimo = performance.now();
        raf = requestAnimationFrame(passo);
      }
    }
  };
}

// Onde o elemento pararia se continuasse com a inércia do dedo
// (mesma função da amostra de código da Apple).
export function projetar(velocidade, desaceleracao = 0.998) {
  return ((velocidade / 1000) * desaceleracao) / (1 - desaceleracao);
}

// Quanto mais passa da borda, menos o elemento acompanha o dedo.
export function elastico(excesso, dimensao, constante = 0.55) {
  return (excesso * dimensao * constante) / (dimensao + constante * Math.abs(excesso));
}

// Guarda as últimas posições do ponteiro para medir a velocidade ao soltar.
export function criarMedidorVelocidade() {
  let amostras = [];
  return {
    limpar() { amostras = []; },
    registrar(pos) {
      const t = performance.now();
      amostras.push({ pos, t });
      amostras = amostras.filter((a) => t - a.t < 100);
    },
    velocidade() {
      if (amostras.length < 2) return 0;
      // dedo parado antes de soltar = sem inércia
      if (performance.now() - amostras[amostras.length - 1].t > 80) return 0;
      const a = amostras[0];
      const b = amostras[amostras.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt > 0 ? (b.pos - a.pos) / dt : 0;
    }
  };
}
