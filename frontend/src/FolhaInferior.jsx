// ============================================================================
// FOLHA INFERIOR (celular)
// Painel que sobe de baixo com três alturas: recolhida, média e aberta.
// Acompanha o dedo 1:1, escolhe a altura final pela inércia do gesto,
// resiste nas bordas e pode ser agarrada no meio da animação.
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { criarMola, projetar, elastico, criarMedidorVelocidade } from './fisica';

const LIMIAR_ARRASTE = 8; // px antes de decidir que é arraste e não toque
const ALTURA_ALCA = 22;

export default function FolhaInferior({ cabecalho, children, aoMudarAltura }) {
  const folhaRef = useRef(null);
  const cabecalhoRef = useRef(null);
  const corpoRef = useRef(null);

  const [alturaTela, setAlturaTela] = useState(() => window.innerHeight);
  const [alturaCabecalho, setAlturaCabecalho] = useState(180);

  const alturaFolha = Math.round(alturaTela * 0.9);

  // alturas visíveis de cada parada (px)
  const paradas = useMemo(() => {
    const recolhida = Math.min(alturaCabecalho, alturaFolha - 120);
    const media = Math.max(recolhida + 120, Math.round(alturaTela * 0.55));
    return [recolhida, Math.min(media, alturaFolha - 60), alturaFolha];
  }, [alturaCabecalho, alturaFolha, alturaTela]);

  // posição (translateY) de cada parada
  const posicoes = useMemo(() => paradas.map((p) => alturaFolha - p), [paradas, alturaFolha]);

  const indiceRef = useRef(0);
  const [indice, setIndice] = useState(0);
  const posicoesRef = useRef(posicoes);
  posicoesRef.current = posicoes;

  const aoMudarAlturaRef = useRef(aoMudarAltura);
  aoMudarAlturaRef.current = aoMudarAltura;

  const molaRef = useRef(null);
  if (!molaRef.current) {
    molaRef.current = criarMola(alturaFolha, (y) => {
      if (folhaRef.current) {
        folhaRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    });
  }
  const mola = molaRef.current;

  const arraste = useRef({ ativo: false, iniciado: false, inicioY: 0, inicioValor: 0 });
  const arrastou = useRef(false);
  const medidor = useRef(criarMedidorVelocidade()).current;

  const aoRepousar = useCallback(() => {
    const y = mola.valor;
    // deixa o fim do conteúdo alcançável com a rolagem em qualquer altura
    if (corpoRef.current) corpoRef.current.style.paddingBottom = `${Math.max(16, y + 16)}px`;
    if (aoMudarAlturaRef.current) aoMudarAlturaRef.current(alturaFolha - y);
  }, [mola, alturaFolha]);

  const irPara = useCallback(
    (i, opcoes = {}) => {
      const alvo = Math.max(0, Math.min(posicoesRef.current.length - 1, i));
      indiceRef.current = alvo;
      setIndice(alvo);
      mola.animarPara(
        posicoesRef.current[alvo],
        { damping: opcoes.damping ?? 1, response: 0.3, velocidade: opcoes.velocidade },
        aoRepousar
      );
    },
    [mola, aoRepousar]
  );

  // mede o cabeçalho para definir a altura recolhida
  useLayoutEffect(() => {
    const el = cabecalhoRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.offsetHeight + 8);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const aoRedimensionar = () => setAlturaTela(window.innerHeight);
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  // quando as medidas mudam, volta para a parada atual
  useLayoutEffect(() => {
    if (!arraste.current.ativo) irPara(indiceRef.current);
  }, [posicoes, irPara]);

  // ----- gesto -----

  const aoApertar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    mola.parar(); // agarra a folha onde ela estiver, mesmo no meio da animação
    arraste.current = {
      ativo: true,
      iniciado: false,
      inicioY: e.clientY,
      inicioValor: mola.valor
    };
    arrastou.current = false;
    medidor.limpar();
    medidor.registrar(mola.valor);
    ouvirGesto();
  };

  const aoMover = (e) => {
    const a = arraste.current;
    if (!a.ativo) return;
    if (!a.iniciado) {
      if (Math.abs(e.clientY - a.inicioY) < LIMIAR_ARRASTE) return;
      a.iniciado = true;
      arrastou.current = true;
      a.inicioY = e.clientY; // sem salto: começa a contar daqui
    }
    const min = posicoesRef.current[posicoesRef.current.length - 1];
    const max = posicoesRef.current[0];
    let y = a.inicioValor + (e.clientY - a.inicioY);
    if (y < min) y = min - elastico(min - y, alturaTela);
    if (y > max) y = max + elastico(y - max, alturaTela);
    mola.definir(y);
    medidor.registrar(y);
  };

  const aoSoltar = (e) => {
    const a = arraste.current;
    if (!a.ativo) return;
    a.ativo = false;

    if (!a.iniciado) {
      // foi um toque: a alça cuida disso no onClick; o resto só retoma a parada
      if (!e.target.closest('.folha-alca')) irPara(indiceRef.current);
      return;
    }

    const v = medidor.velocidade();
    const projetado = mola.valor + projetar(v);
    let melhor = 0;
    posicoesRef.current.forEach((p, i) => {
      if (Math.abs(p - projetado) < Math.abs(posicoesRef.current[melhor] - projetado)) melhor = i;
    });
    // só quica se o gesto trouxe inércia
    irPara(melhor, { velocidade: v, damping: Math.abs(v) > 400 ? 0.8 : 1 });
  };

  const aoMoverRef = useRef(aoMover);
  aoMoverRef.current = aoMover;
  const aoSoltarRef = useRef(aoSoltar);
  aoSoltarRef.current = aoSoltar;

  // acompanha o dedo pela janela inteira, mesmo se ele sair da área de arraste
  const ouvirGesto = () => {
    const mover = (ev) => aoMoverRef.current(ev);
    const soltar = (ev) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      aoSoltarRef.current(ev);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  };

  const aoTocarAlca = () => {
    if (arrastou.current) {
      arrastou.current = false;
      return;
    }
    const proximo = indiceRef.current >= posicoesRef.current.length - 1 ? 0 : indiceRef.current + 1;
    irPara(proximo);
  };

  const rotuloAlca = ['Abrir mais o painel', 'Abrir o painel inteiro', 'Recolher o painel'][indice];

  return (
    <section
      ref={folhaRef}
      className="folha"
      style={{ height: alturaFolha, transform: `translate3d(0, ${alturaFolha}px, 0)` }}
      aria-label="Painel da linha"
    >
      <div
        ref={cabecalhoRef}
        className="folha-cabecalho"
        onPointerDown={aoApertar}
      >
        <button
          type="button"
          className="folha-alca"
          aria-label={rotuloAlca}
          onClick={aoTocarAlca}
          style={{ height: ALTURA_ALCA }}
        >
          <span />
        </button>
        {cabecalho}
      </div>

      <div ref={corpoRef} className="folha-corpo">
        {children}
      </div>
    </section>
  );
}
