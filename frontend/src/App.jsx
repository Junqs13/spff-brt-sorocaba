// ============================================================================
// 1. IMPORTAÇÕES
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  CircleMarker,
  AttributionControl
} from 'react-leaflet';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import FolhaInferior from './FolhaInferior';
import Janela from './Janela';
import { movimentoReduzido } from './fisica';

const API = 'https://api-cco-sorocaba.onrender.com';

const ROTAS = [
  { id: 'BRT_NORTE_ITAVUVU', nome: 'Av. Itavuvu (Norte)' },
  { id: 'BRT_NORTE_IPANEMA', nome: 'Av. Ipanema (Norte)' },
  { id: 'BRT_OESTE_GEN_CARNEIRO', nome: 'Av. Gen. Carneiro (Oeste)' },
  { id: 'BRT_OESTE_PANNUNZIO', nome: 'Av. A. Pannunzio (Oeste)' },
  { id: 'BRT_LESTE_SAO_PAULO', nome: 'Av. São Paulo (Leste)' },
  { id: 'BRT_SUL_WASH_LUIS', nome: 'Av. Washington Luís (Sul)' },
  { id: 'BRT_SUL_COMITRE', nome: 'Av. A. C. Comitre (Sul)' }
];

const CRUZAMENTOS = [
  { id: 'SEM_01', nome: 'Av. Itavuvu (UPH Norte)', lat: -23.476, lon: -47.472 },
  { id: 'SEM_02', nome: 'Praça da Bandeira (Gen. Carneiro)', lat: -23.5065, lon: -47.4665 },
  { id: 'SEM_03', nome: 'Av. São Paulo (Santa Casa)', lat: -23.5028, lon: -47.4475 },
  { id: 'SEM_04', nome: 'Campolim (Esplanada)', lat: -23.534, lon: -47.465 }
];

const ESTACOES = [
  { id: 'EST_01', nome: 'Estação Itavuvu (Norte)', lat: -23.473, lon: -47.473 },
  { id: 'EST_02', nome: 'Estação Gen. Carneiro (Oeste)', lat: -23.51, lon: -47.4735 },
  { id: 'EST_03', nome: 'Estação São Paulo (Leste)', lat: -23.504, lon: -47.438 },
  { id: 'EST_04', nome: 'Estação Campolim (Sul)', lat: -23.538, lon: -47.467 }
];

// ============================================================================
// 2. ÍCONES DO MAPA (Leaflet)
// ============================================================================
function iconeOnibus(onibus) {
  const atrasado = onibus.atraso_previsto_minutos > 0;
  const emoji = onibus.sentido === 'Centro' ? '🚌' : '🚍';
  // atraso também aparece em texto, não só na cor
  const selo = atrasado
    ? `<span class="selo-atraso">+${onibus.atraso_previsto_minutos}</span>`
    : '';
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="icone-onibus ${atrasado ? 'onibus-atrasado' : 'onibus-livre'}">${emoji}${selo}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

const IconeUsuario = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-usuario usuario-gps">🙋‍♂️</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

function iconeEstacao(escolhida) {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="icone-estacao ${escolhida ? 'estacao-escolhida' : ''}">🚏</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34]
  });
}

function iconeSemaforo(prioridade) {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="icone-semaforo ${prioridade ? 'semaforo-prioridade' : 'semaforo-normal'}">🚦</div>`,
    iconSize: [35, 35],
    iconAnchor: [17, 35]
  });
}

// ============================================================================
// 3. FUNÇÕES AUXILIARES
// ============================================================================
function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// Próximo ônibus de uma estação, com o tempo estimado de chegada
function calcularChegada(estacao, frota) {
  if (!estacao || frota.length === 0) return null;
  let maisPerto = null;
  let menor = Infinity;
  frota.forEach((onibus) => {
    const d = distanciaMetros(estacao.lat, estacao.lon, onibus.latitude, onibus.longitude);
    if (d < menor) {
      menor = d;
      maisPerto = onibus;
    }
  });
  const velocidade = maisPerto.velocidade_atual_kmh > 0 ? maisPerto.velocidade_atual_kmh : 1;
  let minutos = Math.round((menor / 1000 / velocidade) * 60) + (maisPerto.atraso_previsto_minutos || 0);
  if (minutos < 1) minutos = 1;
  return { onibus: maisPerto, distancia: menor, minutos, atraso: maisPerto.atraso_previsto_minutos || 0 };
}

function estacaoMaisProxima(lat, lon) {
  let melhor = ESTACOES[0];
  let menor = Infinity;
  ESTACOES.forEach((e) => {
    const d = distanciaMetros(lat, lon, e.lat, e.lon);
    if (d < menor) {
      menor = d;
      melhor = e;
    }
  });
  return melhor;
}

function useEhCelular() {
  const consulta = '(max-width: 767px)';
  const [celular, setCelular] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const mudar = () => setCelular(mq.matches);
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, []);
  return celular;
}

// Dá acesso ao mapa e avisa quando a pessoa arrasta o mapa com o dedo
function ControleMapa({ aoPronto, aoArrastar }) {
  const mapa = useMap();
  useEffect(() => {
    aoPronto(mapa);
  }, [mapa, aoPronto]);
  useMapEvents({ dragstart: aoArrastar });
  return null;
}

// ============================================================================
// 4. COMPONENTE PRINCIPAL (APP)
// ============================================================================
function App() {
  const celular = useEhCelular();

  // --- estado da operação ---
  const [rotaSelecionada, setRotaSelecionada] = useState('BRT_NORTE_ITAVUVU');
  const [frotaAtual, setFrotaAtual] = useState([]);
  const [carregandoFrota, setCarregandoFrota] = useState(true);
  const [falhaFrota, setFalhaFrota] = useState(false);
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [clima, setClima] = useState(null);

  // --- mapa e câmera ---
  const [mapa, setMapa] = useState(null);
  const [seguirOnibus, setSeguirOnibus] = useState(true);
  const [alturaFolha, setAlturaFolha] = useState(0);

  // --- passageiro ---
  const [posicaoUsuario, setPosicaoUsuario] = useState(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [alarmeAtivo, setAlarmeAtivo] = useState(false);
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const [estacaoEscolhidaId, setEstacaoEscolhidaId] = useState(null);

  // --- reporte ---
  const [janelaReporte, setJanelaReporte] = useState(null); // null ou DOMRect do botão
  const [tipoProblema, setTipoProblema] = useState('Lotação máxima');
  const [comentarioReporte, setComentarioReporte] = useState('');
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const [erroReporte, setErroReporte] = useState('');

  // --- gestão (acesso validado no servidor) ---
  const [token, setToken] = useState(null);
  const [janelaLogin, setJanelaLogin] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [visaoGestao, setVisaoGestao] = useState(false);
  const [mapaCalor, setMapaCalor] = useState([]);
  const [dadosBI, setDadosBI] = useState([]);

  // --- aviso na tela (substitui o alert do navegador) ---
  const [aviso, setAviso] = useState(null);
  const temporizadorAviso = useRef(null);
  const mostrarAviso = useCallback((texto, tipo = 'info') => {
    clearTimeout(temporizadorAviso.current);
    setAviso({ texto, tipo, id: Date.now() });
    temporizadorAviso.current = setTimeout(() => setAviso(null), 5000);
  }, []);

  const rotaComLentidao = frotaAtual.some((o) => o.atraso_previsto_minutos > 0);
  const onibusSeguido = frotaAtual[0] || null;

  const estacaoAtual = useMemo(() => {
    if (estacaoEscolhidaId) return ESTACOES.find((e) => e.id === estacaoEscolhidaId);
    if (posicaoUsuario) return estacaoMaisProxima(posicaoUsuario.lat, posicaoUsuario.lon);
    if (onibusSeguido) return estacaoMaisProxima(onibusSeguido.latitude, onibusSeguido.longitude);
    return ESTACOES[0];
  }, [estacaoEscolhidaId, posicaoUsuario, onibusSeguido]);

  const chegada = useMemo(() => calcularChegada(estacaoAtual, frotaAtual), [estacaoAtual, frotaAtual]);

  const distanciaUsuario = useMemo(() => {
    if (!posicaoUsuario || frotaAtual.length === 0) return null;
    return Math.min(
      ...frotaAtual.map((o) => distanciaMetros(posicaoUsuario.lat, posicaoUsuario.lon, o.latitude, o.longitude))
    );
  }, [posicaoUsuario, frotaAtual]);

  // --- voz ---
  const falarTexto = (texto) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const mensagem = new SpeechSynthesisUtterance(texto);
      mensagem.lang = 'pt-BR';
      mensagem.rate = 1.1;
      window.speechSynthesis.speak(mensagem);
    }
  };

  const lerStatusEmVoz = () => {
    if (visaoGestao) {
      falarTexto(`Área de gestão. ${mapaCalor.length} ocorrências registradas pela comunidade.`);
      return;
    }
    if (frotaAtual.length === 0) {
      falarTexto('Nenhum ônibus nesta linha agora.');
      return;
    }
    let texto = '';
    if (chegada) {
      texto += `Próximo ônibus na ${estacaoAtual.nome} em ${chegada.minutos} minutos. `;
      texto += chegada.atraso > 0 ? `Atrasado ${chegada.atraso} minutos. ` : 'No horário. ';
    }
    texto += `${frotaAtual.length} ônibus na linha. `;
    texto += rotaComLentidao ? 'Há lentidão na via.' : 'Trânsito normal na via.';
    falarTexto(texto);
  };

  // ============================================================================
  // EFEITOS
  // ============================================================================

  // Relógio (minuto basta, segundos correndo são ruído)
  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Clima
  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-23.5015&longitude=-47.4582&current_weather=true')
      .then((res) => res.json())
      .then((data) => setClima(data.current_weather))
      .catch(console.error);
  }, []);

  // Troca de rota
  useEffect(() => {
    setFrotaAtual([]);
    setCarregandoFrota(true);
    setAlertaDisparado(false);
    setSeguirOnibus(true);
  }, [rotaSelecionada]);

  // Dados da gestão
  const carregarGestao = useCallback(() => {
    const cabecalhos = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API}/reportes`, { headers: cabecalhos })
      .then((res) => res.json())
      .then((data) => setMapaCalor(data.ocorrencias || []))
      .catch(console.error);
    fetch(`${API}/analytics/desempenho`, { headers: cabecalhos })
      .then((res) => res.json())
      .then((data) => setDadosBI(data?.analytics?.length > 0 ? data.analytics : []))
      .catch(() => setDadosBI([]));
  }, [token]);

  useEffect(() => {
    if (visaoGestao) carregarGestao();
  }, [visaoGestao, carregarGestao]);

  // Alarme de proximidade: voz, vibração e aviso no mesmo instante
  useEffect(() => {
    if (!alarmeAtivo || alertaDisparado || distanciaUsuario === null || visaoGestao) return;
    if (distanciaUsuario <= 1000) {
      setAlertaDisparado(true);
      const texto = `Seu ônibus está a ${formatarDistancia(distanciaUsuario)} de você.`;
      mostrarAviso(texto, 'alerta');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      falarTexto(`Atenção. ${texto}`);
    }
  }, [alarmeAtivo, alertaDisparado, distanciaUsuario, visaoGestao, mostrarAviso]);

  // Busca da frota
  useEffect(() => {
    if (visaoGestao) return undefined;
    let ativo = true;
    const buscarFrota = async () => {
      try {
        const resposta = await fetch(`${API}/veiculos/ativos/${rotaSelecionada}`);
        const dados = await resposta.json();
        if (!ativo) return;
        setFrotaAtual(dados?.frota?.length > 0 ? dados.frota : []);
        setFalhaFrota(false);
      } catch (erro) {
        console.error('Erro API:', erro);
        if (ativo) setFalhaFrota(true);
      } finally {
        if (ativo) setCarregandoFrota(false);
      }
    };
    buscarFrota();
    const intervalo = setInterval(buscarFrota, 3000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [rotaSelecionada, visaoGestao]);

  // ============================================================================
  // CÂMERA DO MAPA
  // ============================================================================

  // Centraliza um ponto na parte do mapa que não está coberta pelo painel
  const centralizar = useCallback(
    (lat, lon, { voar = false, zoom } = {}) => {
      if (!mapa) return;
      const z = zoom ?? mapa.getZoom();
      const deslocX = celular ? 0 : -190; // painel lateral à esquerda
      const deslocY = celular ? alturaFolha / 2 : 0; // folha embaixo
      const ponto = mapa.project([lat, lon], z).add([deslocX, deslocY]);
      const centro = mapa.unproject(ponto, z);
      const reduzido = movimentoReduzido();
      if (voar && !reduzido) mapa.flyTo(centro, z, { duration: 0.8 });
      else mapa.panTo(centro, { animate: !reduzido, duration: 0.6 });
    },
    [mapa, celular, alturaFolha]
  );

  // Segue o ônibus só enquanto a pessoa não mexe no mapa
  const latSeguido = onibusSeguido?.latitude;
  const lonSeguido = onibusSeguido?.longitude;
  useEffect(() => {
    if (!seguirOnibus || visaoGestao || latSeguido === undefined) return;
    centralizar(latSeguido, lonSeguido);
  }, [seguirOnibus, visaoGestao, latSeguido, lonSeguido, centralizar]);

  const aoArrastarMapa = useCallback(() => setSeguirOnibus(false), []);

  const voltarAoOnibus = () => {
    setSeguirOnibus(true);
    if (onibusSeguido && mapa) {
      centralizar(onibusSeguido.latitude, onibusSeguido.longitude, {
        voar: true,
        zoom: Math.max(mapa.getZoom(), 14)
      });
    }
  };

  // ============================================================================
  // AÇÕES DO USUÁRIO
  // ============================================================================

  const localizarUsuario = () =>
    new Promise((resolver) => {
      if (!('geolocation' in navigator)) {
        mostrarAviso('Este navegador não informa a localização.', 'erro');
        resolver(null);
        return;
      }
      setBuscandoGps(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = { lat: position.coords.latitude, lon: position.coords.longitude };
          setPosicaoUsuario(pos);
          setBuscandoGps(false);
          resolver(pos);
        },
        () => {
          setBuscandoGps(false);
          mostrarAviso('Não foi possível ver sua localização. Libere o GPS para este site nas configurações do navegador.', 'erro');
          resolver(null);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });

  const ondeEstou = async () => {
    const pos = await localizarUsuario();
    if (pos) {
      setSeguirOnibus(false);
      centralizar(pos.lat, pos.lon, { voar: true, zoom: 15 });
    }
  };

  const alternarAlarme = async () => {
    if (alarmeAtivo) {
      setAlarmeAtivo(false);
      return;
    }
    // sem GPS, o próprio botão pede a localização
    const pos = posicaoUsuario || (await localizarUsuario());
    if (!pos) return;
    setAlertaDisparado(false);
    setAlarmeAtivo(true);
    mostrarAviso('Pronto. Você será avisado quando o ônibus estiver a 1 km.', 'sucesso');
  };

  const abrirLogin = (e) => {
    if (token) {
      setVisaoGestao(true);
      return;
    }
    setErroLogin('');
    setJanelaLogin(e.currentTarget.getBoundingClientRect());
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setEntrando(true);
    setErroLogin('');
    try {
      const resposta = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });
      if (resposta.ok) {
        const dados = await resposta.json();
        setToken(dados.token);
        setSenha('');
        setJanelaLogin(null);
        setVisaoGestao(true);
      } else if (resposta.status === 401) {
        setErroLogin('Matrícula ou senha incorretas.');
      } else {
        setErroLogin('O servidor não respondeu como esperado. Tente de novo em instantes.');
      }
    } catch {
      setErroLogin('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setEntrando(false);
    }
  };

  const abrirReporte = (e) => {
    setErroReporte('');
    setJanelaReporte(e.currentTarget.getBoundingClientRect());
  };

  const localReporte = () => {
    if (posicaoUsuario) return { ...posicaoUsuario, origem: 'gps' };
    if (mapa) {
      const c = mapa.getCenter();
      return { lat: c.lat, lon: c.lng, origem: 'mapa' };
    }
    return null;
  };

  const enviarReporte = async (e) => {
    e.preventDefault();
    const local = localReporte();
    if (!local) {
      setErroReporte('Não foi possível definir o local da ocorrência.');
      return;
    }
    setEnviandoReporte(true);
    setErroReporte('');
    try {
      const resposta = await fetch(`${API}/reportes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_rota: rotaSelecionada,
          tipo_problema: tipoProblema,
          latitude: local.lat,
          longitude: local.lon,
          comentario: comentarioReporte
        })
      });
      if (resposta.ok) {
        setJanelaReporte(null);
        setComentarioReporte('');
        mostrarAviso('Ocorrência enviada. Obrigado por avisar.', 'sucesso');
        if (visaoGestao) carregarGestao();
      } else {
        setErroReporte('O servidor não aceitou o envio. Tente de novo.');
      }
    } catch (erro) {
      console.error('Erro ao enviar reporte:', erro);
      setErroReporte('Sem conexão. Verifique a internet e tente de novo.');
    } finally {
      setEnviandoReporte(false);
    }
  };

  // ============================================================================
  // 5. CONTEÚDO DO PAINEL
  // ============================================================================

  const cabecalhoPassageiro = (
    <div className="painel-cabecalho">
      <div className="linha-rota">
        <label htmlFor="rota" className="so-leitor">Linha</label>
        <select
          id="rota"
          className="seletor-rota"
          value={rotaSelecionada}
          onChange={(e) => setRotaSelecionada(e.target.value)}
        >
          {ROTAS.map((r) => (
            <option key={r.id} value={r.id}>{r.nome}</option>
          ))}
        </select>
        <button type="button" className="botao-icone" onClick={lerStatusEmVoz} aria-label="Ouvir a situação da linha">
          🔊
        </button>
      </div>

      <div className="chegada" aria-live="polite">
        <div className="chegada-estacao">
          <label htmlFor="estacao" className="so-leitor">Estação</label>
          <select
            id="estacao"
            className="seletor-estacao"
            value={estacaoAtual.id}
            onChange={(e) => setEstacaoEscolhidaId(e.target.value)}
          >
            {ESTACOES.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>

        {carregandoFrota ? (
          <p className="chegada-vazia">Procurando ônibus nesta linha…</p>
        ) : falhaFrota && frotaAtual.length === 0 ? (
          <p className="chegada-vazia">Sem conexão com o servidor. Tentando de novo…</p>
        ) : !chegada ? (
          <p className="chegada-vazia">Nenhum ônibus nesta linha agora.</p>
        ) : (
          <div className="chegada-linha">
            <p className="chegada-tempo">
              <span className="chegada-rotulo">Próximo ônibus em</span>
              <span className="chegada-minutos">{chegada.minutos} min</span>
            </p>
            <span className={`selo ${chegada.atraso > 0 ? 'selo-ruim' : 'selo-bom'}`}>
              <span aria-hidden="true">{chegada.atraso > 0 ? '!' : '✓'}</span>
              {chegada.atraso > 0 ? `Atrasado ${chegada.atraso} min` : 'No horário'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const corpoPassageiro = (
    <div className="painel-corpo">
      {frotaAtual.length > 0 && (
        <div className="situacao">
          <p className={`situacao-via ${rotaComLentidao ? 'via-lenta' : 'via-normal'}`}>
            <span aria-hidden="true">{rotaComLentidao ? '▲' : '●'}</span>
            {rotaComLentidao ? 'Lentidão na via' : 'Trânsito normal na via'}
          </p>
          <p className="situacao-detalhe">
            {frotaAtual.length} ônibus na linha
            {distanciaUsuario !== null && (
              <> · o mais perto está a {formatarDistancia(distanciaUsuario)} de você</>
            )}
          </p>
        </div>
      )}

      <div className="acoes">
        <button type="button" className="botao botao-azul" onClick={ondeEstou} disabled={buscandoGps}>
          📍 {buscandoGps ? 'Localizando…' : 'Onde estou?'}
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={alarmeAtivo}
          className={`interruptor ${alarmeAtivo ? 'ligado' : ''}`}
          onClick={alternarAlarme}
        >
          <span className="interruptor-texto">
            <span>Avisar quando o ônibus estiver perto</span>
            <small>{alarmeAtivo ? 'Ligado: aviso a 1 km de você' : 'Usa sua localização'}</small>
          </span>
          <span className="interruptor-trilho" aria-hidden="true"><span /></span>
        </button>

        <button type="button" className="botao botao-amarelo" onClick={abrirReporte}>
          ⚠️ Reportar ocorrência
        </button>
      </div>

      <div className="legenda">
        <p className="legenda-titulo">Legenda</p>
        <ul>
          <li><span aria-hidden="true">🚌</span> Indo para o Centro</li>
          <li><span aria-hidden="true">🚍</span> Indo para o bairro</li>
          <li><span className="amostra amostra-boa" aria-hidden="true" /> No horário</li>
          <li><span className="amostra amostra-ruim" aria-hidden="true">+3</span> Atrasado (min)</li>
        </ul>
      </div>

      <button type="button" className="link-gestao" onClick={abrirLogin}>
        Área de gestão
      </button>
    </div>
  );

  const cabecalhoGestao = (
    <div className="painel-cabecalho">
      <div className="linha-rota">
        <h1 className="titulo-gestao">Área de gestão</h1>
        <button type="button" className="botao botao-discreto" onClick={() => setVisaoGestao(false)}>
          Sair
        </button>
      </div>
      <p className="subtitulo-gestao">Desempenho da rede BRT nos últimos 15 minutos</p>
    </div>
  );

  const mediaBI = (campo) =>
    Math.round(dadosBI.reduce((a, b) => a + Number(b[campo]), 0) / dadosBI.length);

  const corpoGestao = (
    <div className="painel-corpo">
      {dadosBI.length > 0 ? (
        <>
          <div className="indicadores">
            <div className="indicador">
              <p className="indicador-rotulo">Lotação média</p>
              <p className="indicador-valor">{mediaBI('lotacao_media')}%</p>
            </div>
            <div className="indicador">
              <p className="indicador-rotulo">Velocidade média</p>
              <p className="indicador-valor">{mediaBI('vel_media')} km/h</p>
            </div>
          </div>
          <div className="grafico">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosBI} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="nome_amigavel" stroke="#94a3b8" fontSize={11} tickMargin={5} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#fff' }}
                  itemStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="lotacao_media" name="Lotação (%)" fill="#f97316" radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="vel_media" name="Velocidade (km/h)" fill="#2dd4bf" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="chegada-vazia">Aguardando dados dos sensores…</p>
      )}

      <p className="situacao-detalhe ocorrencias">
        Ocorrências ativas no mapa: <strong>{mapaCalor.length}</strong>
      </p>
      <button type="button" className="botao botao-amarelo" onClick={abrirReporte}>
        ⚠️ Reportar ocorrência
      </button>
    </div>
  );

  const cabecalho = visaoGestao ? cabecalhoGestao : cabecalhoPassageiro;
  const corpo = visaoGestao ? corpoGestao : corpoPassageiro;
  const mostrarVoltar = !seguirOnibus && !visaoGestao && frotaAtual.length > 0;
  const local = janelaReporte ? localReporte() : null;

  // ============================================================================
  // 6. RENDERIZAÇÃO
  // ============================================================================
  return (
    <div className={`app ${visaoGestao ? 'modo-gestao' : ''}`}>
      {/* Marca, hora e clima */}
      <div className="pilula-topo">
        <span className="pilula-marca">BRT Sorocaba</span>
        <span className="pilula-sep" aria-hidden="true" />
        <span>{horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="pilula-sep" aria-hidden="true" />
        <span>{clima ? `${Math.round(clima.temperature)} °C` : '-- °C'}</span>
      </div>

      {/* Aviso na tela */}
      <div className="area-aviso" role="status" aria-live="polite">
        {aviso && (
          <div key={aviso.id} className={`aviso aviso-${aviso.tipo}`}>
            <span>{aviso.texto}</span>
            <button type="button" className="aviso-fechar" aria-label="Fechar aviso" onClick={() => setAviso(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      {/* Painel: folha arrastável no celular, coluna fixa no computador */}
      {celular ? (
        <FolhaInferior cabecalho={cabecalho} aoMudarAltura={setAlturaFolha}>
          {corpo}
        </FolhaInferior>
      ) : (
        <aside className="painel-lateral" aria-label="Painel da linha">
          {cabecalho}
          {corpo}
        </aside>
      )}

      {mostrarVoltar && (
        <button
          type="button"
          className="botao-voltar"
          onClick={voltarAoOnibus}
          style={celular ? { bottom: alturaFolha + 12 } : undefined}
        >
          🚌 Voltar ao ônibus
        </button>
      )}

      {/* Janela de acesso à gestão */}
      <Janela
        aberta={!!janelaLogin}
        origem={janelaLogin}
        celular={celular}
        aoFechar={() => setJanelaLogin(null)}
        titulo="Área de gestão"
        destaque="laranja"
      >
        <p className="janela-texto">Entre com a sua matrícula para ver o painel de gestão.</p>
        <form onSubmit={handleLogin} className="formulario">
          <label>
            Matrícula
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {erroLogin && <p className="erro-formulario" role="alert">{erroLogin}</p>}
          <div className="botoes-formulario">
            <button type="button" className="botao botao-discreto" onClick={() => setJanelaLogin(null)}>
              Cancelar
            </button>
            <button type="submit" className="botao botao-laranja" disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </Janela>

      {/* Janela de reporte */}
      <Janela
        aberta={!!janelaReporte}
        origem={janelaReporte}
        celular={celular}
        aoFechar={() => setJanelaReporte(null)}
        titulo="Reportar ocorrência"
        destaque="amarelo"
      >
        <form onSubmit={enviarReporte} className="formulario">
          <label>
            O que está acontecendo?
            <select value={tipoProblema} onChange={(e) => setTipoProblema(e.target.value)}>
              <option value="Lotação máxima">Ônibus lotado</option>
              <option value="Ar-condicionado quebrado">Ar-condicionado quebrado</option>
              <option value="Acidente na via">Acidente na via</option>
            </select>
          </label>
          <label>
            Comentário (opcional)
            <textarea
              value={comentarioReporte}
              onChange={(e) => setComentarioReporte(e.target.value)}
              rows={3}
            />
          </label>

          <div className="local-reporte">
            {local?.origem === 'gps' ? (
              <p>📍 Local: sua localização atual.</p>
            ) : (
              <>
                <p>📍 Local: o ponto no centro do mapa, porque sua localização está desligada.</p>
                <button type="button" className="botao botao-discreto" onClick={localizarUsuario} disabled={buscandoGps}>
                  {buscandoGps ? 'Localizando…' : 'Usar minha localização'}
                </button>
              </>
            )}
          </div>

          {erroReporte && <p className="erro-formulario" role="alert">{erroReporte}</p>}
          <div className="botoes-formulario">
            <button type="button" className="botao botao-discreto" onClick={() => setJanelaReporte(null)}>
              Cancelar
            </button>
            <button type="submit" className="botao botao-amarelo-cheio" disabled={enviandoReporte}>
              {enviandoReporte ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      </Janela>

      {/* MAPA */}
      <MapContainer
        center={[-23.4611, -47.4796]}
        zoom={14}
        zoomControl={false}
        attributionControl={false}
        className="mapa"
      >
        <AttributionControl position="topright" prefix={false} />
        <TileLayer
          className="map-tiles"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ControleMapa aoPronto={setMapa} aoArrastar={aoArrastarMapa} />

        {/* Ônibus */}
        {!visaoGestao &&
          frotaAtual.map((onibus) => {
            const lotacao = onibus.lotacao || 0;
            const textoLotacao = lotacao > 80 ? 'Cheio' : lotacao > 50 ? 'Moderado' : 'Vazio';
            const atrasado = onibus.atraso_previsto_minutos > 0;
            return (
              <Marker key={onibus.id_veiculo} position={[onibus.latitude, onibus.longitude]} icon={iconeOnibus(onibus)}>
                <Popup>
                  <div className="popup">
                    <p className="popup-titulo">Ônibus {onibus.id_veiculo}</p>
                    <p>Indo para: <b>{onibus.sentido === 'Centro' ? 'Centro' : 'bairro'}</b></p>
                    <p>Velocidade: <b>{onibus.velocidade_atual_kmh} km/h</b></p>
                    <p>Lotação: <b>{lotacao}% ({textoLotacao})</b></p>
                    <p className={`popup-selo ${atrasado ? 'popup-ruim' : 'popup-bom'}`}>
                      {atrasado ? `Atrasado ${onibus.atraso_previsto_minutos} min` : 'No horário'}
                    </p>
                    {atrasado && <p className="popup-nota">Pedindo prioridade nos semáforos para recuperar o atraso.</p>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Ocorrências (gestão) */}
        {visaoGestao &&
          mapaCalor.map((reporte, index) => (
            <CircleMarker
              key={index}
              center={[reporte.latitude, reporte.longitude]}
              radius={18}
              pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.7, weight: 2 }}
            >
              <Popup>
                <div className="popup">
                  <p className="popup-titulo">Alerta da comunidade</p>
                  <p>Tipo: <b>{reporte.tipo_problema}</b></p>
                  {reporte.comentario && <p>Obs.: {reporte.comentario}</p>}
                </div>
              </Popup>
            </CircleMarker>
          ))}

        {/* Estações */}
        {!visaoGestao &&
          ESTACOES.map((estacao) => {
            const c = calcularChegada(estacao, frotaAtual);
            const escolhida = estacao.id === estacaoAtual.id;
            return (
              <Marker
                key={estacao.id}
                position={[estacao.lat, estacao.lon]}
                icon={iconeEstacao(escolhida)}
                eventHandlers={{ click: () => setEstacaoEscolhidaId(estacao.id) }}
              >
                <Popup>
                  <div className="popup">
                    <p className="popup-titulo">{estacao.nome}</p>
                    {c ? (
                      <>
                        <p>Próximo ônibus em <b className="popup-grande">{c.minutos} min</b></p>
                        <p className={`popup-selo ${c.atraso > 0 ? 'popup-ruim' : 'popup-bom'}`}>
                          {c.atraso > 0 ? `Atrasado ${c.atraso} min` : 'No horário'}
                        </p>
                        <p className="popup-nota">
                          Ônibus {c.onibus.id_veiculo}, a {formatarDistancia(c.distancia)} da estação
                        </p>
                      </>
                    ) : (
                      <p>Sem previsão no momento.</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Semáforos */}
        {!visaoGestao &&
          CRUZAMENTOS.map((semaforo) => (
            <Marker
              key={semaforo.id}
              position={[semaforo.lat, semaforo.lon]}
              icon={iconeSemaforo(rotaComLentidao)}
            >
              <Popup>
                <div className="popup">
                  <p className="popup-titulo">Semáforo {semaforo.nome}</p>
                  <p>
                    {rotaComLentidao
                      ? 'Prioridade para o BRT ligada: o verde fica mais tempo aberto para o ônibus passar.'
                      : 'Ciclo normal, sem prioridade para o BRT agora.'}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Usuário */}
        {posicaoUsuario && !visaoGestao && (
          <Marker position={[posicaoUsuario.lat, posicaoUsuario.lon]} icon={IconeUsuario}>
            <Popup>Você está aqui</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default App;
