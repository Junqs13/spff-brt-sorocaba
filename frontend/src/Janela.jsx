// ============================================================================
// JANELA (modal)
// No celular sobe de baixo e fecha arrastando para baixo.
// No computador cresce a partir do botão que a abriu e volta para ele.
// Fecha com Esc, tocando fora ou no botão de cancelar.
// ============================================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { criarMola, projetar, elastico, criarMedidorVelocidade } from './fisica';

export default function Janela({ aberta, aoFechar, titulo, origem, celular, children, destaque }) {
  const [montada, setMontada] = useState(aberta);
  const cartaoRef = useRef(null);
  const fundoRef = useRef(null);
  const alturaRef = useRef(400);
  const idTitulo = useRef(`janela-${Math.random().toString(36).slice(2, 8)}`).current;

  // celular: valor = deslocamento em px (0 = aberta). computador: valor = progresso 0..1
  const molaRef = useRef(null);
  if (!molaRef.current) {
    molaRef.current = criarMola(celular ? 2000 : 0, (v) => desenhar(v));
  }
  const mola = molaRef.current;

  function desenhar(v) {
    const cartao = cartaoRef.current;
    const fundo = fundoRef.current;
    if (!cartao || !fundo) return;
    if (celular) {
      const h = alturaRef.current || 1;
      cartao.style.transform = `translate3d(0, ${v}px, 0)`;
      fundo.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h)));
    } else {
      cartao.style.opacity = String(Math.max(0, Math.min(1, v)));
      cartao.style.transform = `scale(${0.92 + 0.08 * v})`;
      fundo.style.opacity = String(Math.max(0, Math.min(1, v)));
    }
  }

  useEffect(() => {
    if (aberta) setMontada(true);
  }, [aberta]);

  // entrada e saída
  useLayoutEffect(() => {
    if (!montada) return;
    const cartao = cartaoRef.current;
    if (aberta) {
      alturaRef.current = cartao.offsetHeight;
      if (celular) {
        if (!mola.animando && mola.valor >= alturaRef.current) mola.definir(alturaRef.current);
        mola.animarPara(0, { damping: 1, response: 0.35 });
      } else {
        // cresce a partir do botão que abriu
        if (origem) {
          const r = cartao.getBoundingClientRect();
          const ox = origem.left + origem.width / 2 - r.left;
          const oy = origem.top + origem.height / 2 - r.top;
          cartao.style.transformOrigin = `${ox}px ${oy}px`;
        }
        mola.animarPara(1, { damping: 1, response: 0.3 });
        const primeiro = cartao.querySelector('input, select, textarea');
        if (primeiro) primeiro.focus();
      }
    } else {
      const destino = celular ? alturaRef.current : 0;
      mola.animarPara(destino, { damping: 1, response: 0.3 }, () => setMontada(false));
    }
  }, [aberta, montada, celular, origem, mola]);

  // Esc fecha
  useEffect(() => {
    if (!montada || !aberta) return;
    const tecla = (e) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [montada, aberta, aoFechar]);

  // ----- arrastar para fechar (celular) -----
  const arraste = useRef({ ativo: false, iniciado: false, inicioY: 0, inicioValor: 0 });
  const medidor = useRef(criarMedidorVelocidade()).current;

  const aoApertar = (e) => {
    if (!celular) return;
    mola.parar();
    arraste.current = { ativo: true, iniciado: false, inicioY: e.clientY, inicioValor: mola.valor };
    medidor.limpar();
    medidor.registrar(mola.valor);
    ouvirGesto();
  };
  const aoMover = (e) => {
    const a = arraste.current;
    if (!a.ativo) return;
    if (!a.iniciado) {
      if (Math.abs(e.clientY - a.inicioY) < 8) return;
      a.iniciado = true;
      a.inicioY = e.clientY;
    }
    let y = a.inicioValor + (e.clientY - a.inicioY);
    if (y < 0) y = -elastico(-y, alturaRef.current);
    mola.definir(y);
    medidor.registrar(y);
  };
  const aoSoltar = () => {
    const a = arraste.current;
    if (!a.ativo) return;
    a.ativo = false;
    if (!a.iniciado) {
      if (aberta) mola.animarPara(0, { damping: 1, response: 0.35 });
      return;
    }
    const v = medidor.velocidade();
    const projetado = mola.valor + projetar(v);
    if (projetado > alturaRef.current * 0.45) {
      mola.animarPara(alturaRef.current, { damping: 1, response: 0.3, velocidade: v });
      aoFechar();
    } else {
      mola.animarPara(0, { damping: Math.abs(v) > 400 ? 0.8 : 1, response: 0.3, velocidade: v });
    }
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

  if (!montada) return null;

  return (
    <div className={`janela-camada ${celular ? 'janela-celular' : 'janela-computador'}`}>
      <div ref={fundoRef} className="janela-fundo" onClick={aoFechar} style={{ opacity: 0 }} />
      <div
        ref={cartaoRef}
        className={`janela-cartao ${destaque ? `janela-${destaque}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        style={celular ? { transform: 'translate3d(0, 100%, 0)' } : { opacity: 0 }}
      >
        <div
          className="janela-topo"
          onPointerDown={aoApertar}
        >
          {celular && <span className="janela-alca" aria-hidden="true" />}
          <h2 id={idTitulo}>{titulo}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
