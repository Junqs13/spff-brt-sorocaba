
// ============================================================================
// 1. IMPORTAÇÕES
// ============================================================================
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
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

// ============================================================================
// 2. CONFIGURAÇÃO DE ÍCONES (Leaflet)
// ============================================================================
const IconeCentroLivre = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-onibus onibus-livre">🚌</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const IconeCentroAtrasado = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-onibus onibus-atrasado">🚌</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const IconeBairroLivre = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-onibus onibus-livre">🚍</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const IconeBairroAtrasado = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-onibus onibus-atrasado">🚍</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const IconeUsuario = L.divIcon({
  className: 'custom-div-icon',
  html: '<div class="icone-usuario usuario-gps">🙋‍♂️</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

// Ícone Unicode nativo para Estações BRT
const iconeEstacao = L.divIcon({
  className: 'custom-div-icon',
  html: '<div style="font-size: 28px; filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.8));">🚏</div>',
  iconSize: [35, 35],
  iconAnchor: [17, 35]
});

// ============================================================================
// 3. FUNÇÕES AUXILIARES E MATEMÁTICAS
// ============================================================================
function RecenterAutomatically({ lat, lon, seguirVeiculo }) {
  const map = useMap();

  useEffect(() => {
    if (seguirVeiculo && lat && lon) {
      map.flyTo([lat, lon], 14, {
        animate: true,
        duration: 1.5
      });
    }
  }, [lat, lon, map, seguirVeiculo]);

  return null;
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  const R = 6371;

  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// ============================================================================
// 4. COMPONENTE PRINCIPAL (APP)
// ============================================================================
function App() {
  // --- ESTADOS DO COMPONENTE ---
  const [rotaSelecionada, setRotaSelecionada] = useState("BRT_NORTE_ITAVUVU");

  const [posicaoCentro, setPosicaoCentro] = useState({
    lat: -23.4611,
    lon: -47.4796
  });

  const [frotaAtual, setFrotaAtual] = useState([]);
  const [seguirVeiculo, setSeguirVeiculo] = useState(true);
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [clima, setClima] = useState(null);
  const [posicaoUsuario, setPosicaoUsuario] = useState(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [alarmeAtivo, setAlarmeAtivo] = useState(false);
  const [distanciaMetros, setDistanciaMetros] = useState(null);
  const [alertaDisparado, setAlertaDisparado] = useState(false);
  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);
  const [tipoProblema, setTipoProblema] = useState("Lotação Máxima");
  const [comentarioReporte, setComentarioReporte] = useState("");

  // ESTADOS DE SEGURANÇA E LOGIN EXECUTIVO
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erroLogin, setErroLogin] = useState("");
  const [visaoGestao, setVisaoGestao] = useState(false);

  const [mapaCalor, setMapaCalor] = useState([]);
  const [dadosBI, setDadosBI] = useState([]);

  const rotaComLentidao = frotaAtual.some(
    onibus => onibus.atraso_previsto_minutos > 0
  );

  const corPrincipal = visaoGestao
    ? "#f97316"
    : (rotaComLentidao ? "#ff0055" : "#00ffcc");

  // --- DADOS ESTÁTICOS ---
  const cruzamentosInteligentes = [
    {
      id: "SEM_01",
      nome: "Av. Itavuvu (UPH Norte)",
      lat: -23.4760,
      lon: -47.4720
    },
    {
      id: "SEM_02",
      nome: "Praça da Bandeira (Gen. Carneiro)",
      lat: -23.5065,
      lon: -47.4665
    },
    {
      id: "SEM_03",
      nome: "Av. São Paulo (Santa Casa)",
      lat: -23.5028,
      lon: -47.4475
    },
    {
      id: "SEM_04",
      nome: "Campolim (Esplanada)",
      lat: -23.5340,
      lon: -47.4650
    }
  ];

  const estacoesBRT = [
    {
      id: "EST_01",
      nome: "Estação Itavuvu (Norte)",
      lat: -23.4730,
      lon: -47.4730
    },
    {
      id: "EST_02",
      nome: "Estação Gen. Carneiro (Oeste)",
      lat: -23.5100,
      lon: -47.4735
    },
    {
      id: "EST_03",
      nome: "Estação São Paulo (Leste)",
      lat: -23.5040,
      lon: -47.4380
    },
    {
      id: "EST_04",
      nome: "Estação Campolim (Sul)",
      lat: -23.5380,
      lon: -47.4670
    }
  ];

  // --- MÉTODOS DE CONTROLE E UI ---
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
      falarTexto(
        `Visão de gestão ativada. ${mapaCalor.length} ocorrências registradas pela comunidade.`
      );
      return;
    }

    if (frotaAtual.length === 0) {
      falarTexto("Nenhum veículo operando nesta rota no momento.");
      return;
    }

    const nomeRotaAmigavel = rotaSelecionada.split('_').pop();

    let texto = `Corredor ${nomeRotaAmigavel}. ${frotaAtual.length} veículos em operação. `;

    if (rotaComLentidao) {
      texto += "Atenção: A inteligência artificial detectou lentidão na via. ";
    } else {
      texto += "Fluxo otimizado. ";
    }

    falarTexto(texto);
  };

  const getIconeSemaforo = (precisaPrioridade) => {
    const corBrilho = precisaPrioridade
      ? 'rgba(16, 185, 129, 0.9)'
      : 'rgba(239, 68, 68, 0.8)';

    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="font-size: 24px; background-color: #1e293b; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px 5px ${corBrilho}; border: 1px solid rgba(255,255,255,0.3);">🚦</div>`,
      iconSize: [35, 35],
      iconAnchor: [17, 35]
    });
  };

  const getIconeOnibus = (onibus) => {
    if (onibus.sentido === "Centro") {
      return onibus.atraso_previsto_minutos > 0
        ? IconeCentroAtrasado
        : IconeCentroLivre;
    }

    return onibus.atraso_previsto_minutos > 0
      ? IconeBairroAtrasado
      : IconeBairroLivre;
  };

  // ============================================================================
  // EFEITOS
  // ============================================================================

  // Relógio
  useEffect(() => {
    const timer = setInterval(
      () => setHoraAtual(new Date()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  // Clima
  useEffect(() => {
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-23.5015&longitude=-47.4582&current_weather=true"
    )
      .then(res => res.json())
      .then(data => setClima(data.current_weather))
      .catch(console.error);
  }, []);

  // Troca de rota
  useEffect(() => {
    setFrotaAtual([]);
    setAlertaDisparado(false);
  }, [rotaSelecionada]);

  // Visão Gestão
  useEffect(() => {
    if (visaoGestao) {
      fetch(
        "https://api-cco-sorocaba.onrender.com/reportes"
      )
        .then(res => res.json())
        .then(data => setMapaCalor(data.ocorrencias || []))
        .catch(console.error);

      fetch(
        "https://api-cco-sorocaba.onrender.com/analytics/desempenho"
      )
        .then(res => res.json())
        .then(data => {
          if (
            data &&
            data.analytics &&
            data.analytics.length > 0
          ) {
            setDadosBI(data.analytics);
          } else {
            setDadosBI([]);
          }
        })
        .catch(() => setDadosBI([]));
    }
  }, [visaoGestao]);

  // Distância do usuário até o ônibus
  useEffect(() => {
    if (
      posicaoUsuario &&
      frotaAtual.length > 0 &&
      !visaoGestao
    ) {
      let menorDistancia = Infinity;

      frotaAtual.forEach(onibus => {
        const dist = calcularDistanciaMetros(
          posicaoUsuario.lat,
          posicaoUsuario.lon,
          onibus.latitude,
          onibus.longitude
        );

        if (dist < menorDistancia) {
          menorDistancia = dist;
        }
      });

      setDistanciaMetros(Math.round(menorDistancia));

      if (
        alarmeAtivo &&
        menorDistancia <= 1000 &&
        !alertaDisparado
      ) {
        setAlertaDisparado(true);

        falarTexto(
          "Atenção passageiro! O seu veículo está a menos de um quilômetro de distância."
        );

        setTimeout(() => {
          alert(
            "🚨 ATENÇÃO! O seu veículo BRT está a menos de 1 km de distância!"
          );
        }, 500);
      }
    }
  }, [
    posicaoUsuario,
    frotaAtual,
    alarmeAtivo,
    alertaDisparado,
    visaoGestao
  ]);

  // Busca da frota
  useEffect(() => {
    const buscarFrota = async () => {
      if (visaoGestao) return;

      try {
        const resposta = await fetch(
          `https://api-cco-sorocaba.onrender.com/veiculos/ativos/${rotaSelecionada}`
        );

        const dados = await resposta.json();

        if (
          dados &&
          dados.frota &&
          dados.frota.length > 0
        ) {
          setFrotaAtual(dados.frota);

          setPosicaoCentro({
            lat: dados.frota[0].latitude,
            lon: dados.frota[0].longitude
          });
        } else {
          setFrotaAtual([]);
        }
      } catch (erro) {
        console.error("Erro API:", erro);
      }
    };

    buscarFrota();

    const intervalo = setInterval(
      buscarFrota,
      3000
    );

    return () => clearInterval(intervalo);
  }, [rotaSelecionada, visaoGestao]);

  // ============================================================================
  // AÇÕES DO USUÁRIO
  // ============================================================================

  const handleLogin = (e) => {
    e.preventDefault();

    if (
      username === "admin" &&
      password === "spff2026"
    ) {
      setIsLoggedIn(true);
      setMostrarLogin(false);
      setVisaoGestao(true);
      setErroLogin("");
    } else {
      setErroLogin(
        "Acesso Negado: Credenciais inválidas."
      );
    }
  };

  const localizarUsuario = () => {
    setBuscandoGps(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPosicaoUsuario({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });

          setBuscandoGps(false);
          setSeguirVeiculo(false);
        },
        () => {
          alert("Permita o GPS.");
          setBuscandoGps(false);
        },
        {
          enableHighAccuracy: true
        }
      );
    } else {
      alert("Geolocalização não suportada neste navegador.");
      setBuscandoGps(false);
    }
  };

  const enviarReporte = async (e) => {
    e.preventDefault();

    const latReporte = posicaoUsuario
      ? posicaoUsuario.lat
      : posicaoCentro.lat;

    const lonReporte = posicaoUsuario
      ? posicaoUsuario.lon
      : posicaoCentro.lon;

    try {
      const resposta = await fetch(
        "https://api-cco-sorocaba.onrender.com/reportes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_rota: rotaSelecionada,
            tipo_problema: tipoProblema,
            latitude: latReporte,
            longitude: lonReporte,
            comentario: comentarioReporte
          })
        }
      );

      if (resposta.ok) {
        alert(
          "✅ Alerta enviado! Ele agora fará parte do Mapa de Calor da cidade."
        );

        setMostrarModalReporte(false);
        setComentarioReporte("");

        if (visaoGestao) {
          fetch(
            "https://api-cco-sorocaba.onrender.com/reportes"
          )
            .then(res => res.json())
            .then(data =>
              setMapaCalor(data.ocorrencias || [])
            )
            .catch(console.error);
        }
      } else {
        alert("Não foi possível enviar o alerta.");
      }
    } catch (erro) {
      console.error("Erro ao enviar reporte:", erro);
      alert("Erro de conexão.");
    }
  };

  // ============================================================================
  // 5. RENDERIZAÇÃO DA INTERFACE (JSX)
  // ============================================================================
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        backgroundColor: "#000"
      }}
    >

      {/* WIDGET DE CLIMA E HORA */}
      <div className="widget-clima">
        <div style={{ textAlign: "center" }}>
          <p
            className="titulo-widget"
            style={{
              margin: 0,
              fontSize: "0.7rem",
              color: "#94a3b8",
              textTransform: "uppercase"
            }}
          >
            Horário
          </p>

          <p
            className="valor-widget"
            style={{
              margin: 0,
              fontSize: "1.4rem",
              fontWeight: "bold",
              fontFamily: "monospace"
            }}
          >
            {horaAtual.toLocaleTimeString('pt-BR')}
          </p>
        </div>

        <div
          style={{
            width: "1px",
            height: "30px",
            backgroundColor: "rgba(255,255,255,0.2)"
          }}
        />

        <div style={{ textAlign: "center" }}>
          <p
            className="titulo-widget"
            style={{
              margin: 0,
              fontSize: "0.7rem",
              color: "#94a3b8",
              textTransform: "uppercase"
            }}
          >
            Sorocaba
          </p>

          <p
            className="valor-widget"
            style={{
              margin: 0,
              fontSize: "1.4rem",
              fontWeight: "bold",
              color: "#00ffcc"
            }}
          >
            {clima
              ? `${clima.temperature}°C`
              : "--°C"}
          </p>
        </div>
      </div>

      {/* PAINEL DE CONTROLE LATERAL */}
      <div
        className="painel-controle"
        style={{
          border: `1px solid rgba(${
            visaoGestao
              ? '249,115,22'
              : (rotaComLentidao
                ? '255,0,85'
                : '0,255,204')
          }, 0.3)`,

          boxShadow: `0 10px 40px rgba(0,0,0,0.8),
            inset 0 0 20px rgba(${
              visaoGestao
                ? '249,115,22'
                : (rotaComLentidao
                  ? '255,0,85'
                  : '0,255,204')
            }, 0.1)`,

          overflowY: "auto",
          maxHeight: "100vh"
        }}
      >

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px"
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: "300",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                backgroundColor: corPrincipal,
                borderRadius: "50%",
                boxShadow: `0 0 15px ${corPrincipal}`
              }}
            />

            SPFF |{" "}
            <b style={{ color: corPrincipal }}>
              CCO
            </b>
          </h2>

          <button
            onClick={lerStatusEmVoz}
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem"
            }}
            title="Ouvir Status (Acessibilidade)"
          >
            🔊
          </button>
        </div>

        {/* Botão Visão Gestão com Trava de Login */}
        <button
          onClick={() => {
            if (visaoGestao) {
              setVisaoGestao(false);
            } else {
              if (isLoggedIn) {
                setVisaoGestao(true);
              } else {
                setMostrarLogin(true);
              }
            }
          }}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "15px",
            cursor: "pointer",
            backgroundColor: visaoGestao
              ? "rgba(249, 115, 22, 0.3)"
              : "rgba(255,255,255,0.05)",
            color: visaoGestao
              ? "#f97316"
              : "#cbd5e1",
            border: `1px solid ${
              visaoGestao
                ? "#f97316"
                : "rgba(255,255,255,0.2)"
            }`,
            borderRadius: "8px",
            fontSize: "0.9rem",
            fontWeight: "bold",
            transition: "all 0.3s"
          }}
        >
          {visaoGestao
            ? "📊 SAIR DA VISÃO GESTÃO"
            : "📈 Ativar Visão Gestão (Restrito)"}
        </button>

        {/* Conteúdo: Visão de Operação Normal */}
        {!visaoGestao ? (
          <>
            <div style={{ marginBottom: "15px" }}>
              <select
                value={rotaSelecionada}
                onChange={(e) =>
                  setRotaSelecionada(e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${corPrincipal}`,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: corPrincipal,
                  fontSize: "1rem",
                  outline: "none",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                <option value="BRT_NORTE_ITAVUVU">
                  Av. Itavuvu (Norte)
                </option>

                <option value="BRT_NORTE_IPANEMA">
                  Av. Ipanema (Norte)
                </option>

                <option value="BRT_OESTE_GEN_CARNEIRO">
                  Av. Gen. Carneiro (Oeste)
                </option>

                <option value="BRT_OESTE_PANNUNZIO">
                  Av. A. Pannunzio (Oeste)
                </option>

                <option value="BRT_LESTE_SAO_PAULO">
                  Avenida São Paulo (Leste)
                </option>

                <option value="BRT_SUL_WASH_LUIS">
                  Av. Washington Luís (Sul)
                </option>

                <option value="BRT_SUL_COMITRE">
                  Av. A. C. Comitre (Sul)
                </option>
              </select>
            </div>

            {frotaAtual.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}
              >
                <div
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    backgroundColor: rotaComLentidao
                      ? "rgba(255, 0, 85, 0.15)"
                      : "rgba(0, 255, 204, 0.15)",
                    color: corPrincipal,
                    borderLeft: `4px solid ${corPrincipal}`,
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "1px"
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.65rem",
                      opacity: 0.8
                    }}
                  >
                    Status Geral (IA)
                  </p>

                  <p
                    style={{
                      margin: "2px 0 0 0",
                      fontSize: "1.1rem",
                      fontWeight: "900"
                    }}
                  >
                    {rotaComLentidao
                      ? "ALERTA DE LENTIDÃO"
                      : "FLUXO OTIMIZADO"}
                  </p>
                </div>

                <div
                  style={{
                    backgroundColor: "rgba(0,0,0,0.4)",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.05)"
                  }}
                >
                  <p
                    style={{
                      margin: "5px 0",
                      fontSize: "0.85rem",
                      color: "#cbd5e1"
                    }}
                  >
                    🚌 <b>Veículos operando:</b>{" "}
                    {frotaAtual.length}
                  </p>

                  {posicaoUsuario &&
                    distanciaMetros !== null && (
                      <p
                        style={{
                          margin: "6px 0 0 0",
                          fontSize: "0.85rem",
                          color: "#60a5fa",
                          display: "flex",
                          justifyContent: "space-between",
                          borderTop:
                            "1px solid rgba(255,255,255,0.1)",
                          paddingTop: "6px"
                        }}
                      >
                        <span>
                          📍 Distância do veículo:
                        </span>

                        <span
                          style={{
                            fontWeight: "bold"
                          }}
                        >
                          {distanciaMetros} metros
                        </span>
                      </p>
                    )}
                </div>

                {/* LEGENDA DO MAPA */}
                <div
                  style={{
                    padding: "10px",
                    backgroundColor: "rgba(0,0,0,0.3)",
                    border:
                      "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                    color: "#94a3b8"
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 5px 0",
                      fontWeight: "bold",
                      color: "#cbd5e1",
                      textTransform: "uppercase"
                    }}
                  >
                    Legenda do Mapa
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "4px"
                    }}
                  >
                    <span>🚌 Sentido Centro</span>
                    <span>🚍 Sentido Bairro</span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between"
                    }}
                  >
                    <span>
                      <span style={{ color: "#00ffcc" }}>
                        🟢
                      </span>{" "}
                      Fluxo Livre
                    </span>

                    <span>
                      <span style={{ color: "#ff0055" }}>
                        🔴
                      </span>{" "}
                      Atraso/Lentidão
                    </span>
                  </div>
                </div>

                {/* BOTÕES DE CONTROLE ESPACIAL */}
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "5px"
                  }}
                >
                  <button
                    onClick={() =>
                      setSeguirVeiculo(!seguirVeiculo)
                    }
                    style={{
                      padding: "10px",
                      flex: 1,
                      cursor: "pointer",
                      backgroundColor: seguirVeiculo
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(0,0,0,0.5)",
                      color: seguirVeiculo
                        ? "#fff"
                        : "#94a3b8",
                      border:
                        "1px solid rgba(255,255,255,0.2)",
                      borderRadius: "8px",
                      fontSize: "0.85rem"
                    }}
                  >
                    {seguirVeiculo
                      ? "🔒 Câmera"
                      : "🔓 Câmera"}
                  </button>

                  <button
                    onClick={localizarUsuario}
                    style={{
                      padding: "10px",
                      flex: 1,
                      cursor: "pointer",
                      backgroundColor:
                        "rgba(59, 130, 246, 0.2)",
                      color: "#60a5fa",
                      border:
                        "1px solid rgba(59, 130, 246, 0.5)",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      fontWeight: "bold"
                    }}
                  >
                    {buscandoGps
                      ? "📍 Buscando..."
                      : "📍 Onde estou?"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (!posicaoUsuario) {
                      alert(
                        "Ative a sua localização primeiro para usar o alarme!"
                      );
                      return;
                    }

                    setAlarmeAtivo(!alarmeAtivo);
                    setAlertaDisparado(false);
                  }}
                  style={{
                    padding: "10px",
                    width: "100%",
                    cursor: "pointer",
                    backgroundColor: alarmeAtivo
                      ? "rgba(239, 68, 68, 0.3)"
                      : "rgba(255, 255, 255, 0.05)",
                    color: alarmeAtivo
                      ? "#f87171"
                      : "#94a3b8",
                    border: `1px solid ${
                      alarmeAtivo
                        ? "#ef4444"
                        : "rgba(255,255,255,0.2)"
                    }`,
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: "bold"
                  }}
                >
                  {alarmeAtivo
                    ? "🔔 Alarme Ligado (< 1km)"
                    : "🔕 Ligar Alarme de Proximidade"}
                </button>

                <button
                  onClick={() =>
                    setMostrarModalReporte(true)
                  }
                  style={{
                    padding: "10px",
                    width: "100%",
                    cursor: "pointer",
                    backgroundColor:
                      "rgba(245, 158, 11, 0.2)",
                    color: "#fbbf24",
                    border:
                      "1px solid rgba(245, 158, 11, 0.5)",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    fontWeight: "bold"
                  }}
                >
                  ⚠️ Reportar Ocorrência na Rota
                </button>
              </div>
            ) : (
              <p
                style={{
                  textAlign: "center",
                  color: "#64748b",
                  fontStyle: "italic",
                  padding: "10px 0",
                  fontSize: "0.9rem"
                }}
              >
                Nenhum veículo nesta via.
              </p>
            )}
          </>
        ) : (
          /* Conteúdo: Visão de Gestão (Dashboard BI Nível Executivo) */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              padding: "10px 0"
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "#f97316",
                marginBottom: "15px"
              }}
            >
              <p
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  margin: "0 0 5px 0"
                }}
              >
                📊 Analytics & BI
              </p>

              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#cbd5e1"
                }}
              >
                Desempenho da Rede BRT (Últimos 15 min)
              </p>
            </div>

            {dadosBI.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "15px"
                }}
              >
                <div
                  style={{
                    flex: 1,
                    backgroundColor:
                      "rgba(249, 115, 22, 0.1)",
                    border:
                      "1px solid rgba(249, 115, 22, 0.3)",
                    borderRadius: "8px",
                    padding: "10px",
                    textAlign: "center"
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.7rem",
                      color: "#f97316",
                      textTransform: "uppercase"
                    }}
                  >
                    Lotação Média
                  </p>

                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#fff"
                    }}
                  >
                    {Math.round(
                      dadosBI.reduce(
                        (a, b) =>
                          a + Number(b.lotacao_media),
                        0
                      ) / dadosBI.length
                    )}
                    %
                  </p>
                </div>

                <div
                  style={{
                    flex: 1,
                    backgroundColor:
                      "rgba(0, 255, 204, 0.1)",
                    border:
                      "1px solid rgba(0, 255, 204, 0.3)",
                    borderRadius: "8px",
                    padding: "10px",
                    textAlign: "center"
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.7rem",
                      color: "#00ffcc",
                      textTransform: "uppercase"
                    }}
                  >
                    Velocidade Média
                  </p>

                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "1.2rem",
                      fontWeight: "bold",
                      color: "#fff"
                    }}
                  >
                    {Math.round(
                      dadosBI.reduce(
                        (a, b) =>
                          a + Number(b.vel_media),
                        0
                      ) / dadosBI.length
                    )}{" "}
                    km/h
                  </p>
                </div>
              </div>
            )}

            {dadosBI.length > 0 ? (
              <div
                style={{
                  height: "250px",
                  width: "100%",
                  backgroundColor: "rgba(0,0,0,0.4)",
                  borderRadius: "10px",
                  padding: "10px 10px 0 0"
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={dadosBI}
                    margin={{
                      top: 10,
                      right: 0,
                      left: -20,
                      bottom: 0
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="nome_amigavel"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickMargin={5}
                    />

                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                    />

                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        color: "#fff"
                      }}
                      itemStyle={{
                        fontWeight: "bold"
                      }}
                    />

                    <Bar
                      dataKey="lotacao_media"
                      name="Lotação (%)"
                      fill="#f97316"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />

                    <Bar
                      dataKey="vel_media"
                      name="Velocidade (km/h)"
                      fill="#00ffcc"
                      radius={[4, 4, 0, 0]}
                      barSize={12}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px 0",
                  color: "#64748b"
                }}
              >
                <span
                  style={{
                    fontSize: "2.5rem"
                  }}
                >
                  📡
                </span>

                <p
                  style={{
                    fontSize: "0.9rem",
                    marginTop: "15px"
                  }}
                >
                  Aguardando sincronização IoT...
                </p>
              </div>
            )}

            <div
              style={{
                marginTop: "auto",
                paddingTop: "15px"
              }}
            >
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#cbd5e1",
                  textAlign: "center",
                  marginBottom: "10px"
                }}
              >
                ⚠️ Ocorrências Ativas (Mapa):{" "}
                <b>{mapaCalor.length} áreas</b>
              </p>

              <button
                onClick={() =>
                  setMostrarModalReporte(true)
                }
                style={{
                  padding: "12px",
                  width: "100%",
                  cursor: "pointer",
                  backgroundColor:
                    "rgba(245, 158, 11, 0.2)",
                  color: "#fbbf24",
                  border:
                    "1px solid rgba(245, 158, 11, 0.5)",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: "bold",
                  textTransform: "uppercase"
                }}
              >
                🚨 Reportar Incidente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE ACESSO RESTRITO (LOGIN) */}
      {mostrarLogin && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(10px)",
            zIndex: 3000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              padding: "35px",
              borderRadius: "16px",
              border:
                "1px solid rgba(249, 115, 22, 0.4)",
              width: "90%",
              maxWidth: "380px",
              color: "#fff",
              boxShadow:
                "0 20px 60px rgba(249, 115, 22, 0.15)"
            }}
          >
            <div
              style={{
                textAlign: "center",
                marginBottom: "25px"
              }}
            >
              <span
                style={{
                  fontSize: "2.5rem"
                }}
              >
                🔒
              </span>

              <h2
                style={{
                  margin: "10px 0 5px 0",
                  color: "#f97316",
                  letterSpacing: "1px"
                }}
              >
                ACESSO RESTRITO
              </h2>

              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "#94a3b8"
                }}
              >
                Painel Executivo de Mobilidade
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "15px"
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    color: "#cbd5e1",
                    textTransform: "uppercase",
                    fontWeight: "bold"
                  }}
                >
                  Matrícula Governamental
                </label>

                <input
                  type="text"
                  value={username}
                  onChange={e =>
                    setUsername(e.target.value)
                  }
                  placeholder="Ex: admin"
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginTop: "5px",
                    borderRadius: "8px",
                    backgroundColor:
                      "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border:
                      "1px solid rgba(255,255,255,0.2)",
                    outline: "none",
                    fontSize: "1rem"
                  }}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    color: "#cbd5e1",
                    textTransform: "uppercase",
                    fontWeight: "bold"
                  }}
                >
                  Chave de Autenticação
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={e =>
                    setPassword(e.target.value)
                  }
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginTop: "5px",
                    borderRadius: "8px",
                    backgroundColor:
                      "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border:
                      "1px solid rgba(255,255,255,0.2)",
                    outline: "none",
                    fontSize: "1rem",
                    letterSpacing: "2px"
                  }}
                  required
                />
              </div>

              {erroLogin && (
                <div
                  style={{
                    backgroundColor:
                      "rgba(239, 68, 68, 0.2)",
                    padding: "10px",
                    borderRadius: "8px",
                    border:
                      "1px solid rgba(239, 68, 68, 0.5)",
                    textAlign: "center"
                  }}
                >
                  <p
                    style={{
                      color: "#fca5a5",
                      fontSize: "0.8rem",
                      margin: 0,
                      fontWeight: "bold"
                    }}
                  >
                    {erroLogin}
                  </p>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "15px"
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setMostrarLogin(false)
                  }
                  style={{
                    flex: 1,
                    padding: "12px",
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    border:
                      "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    transition: "0.3s"
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 2,
                    padding: "12px",
                    backgroundColor: "#f97316",
                    color: "#fff",
                    fontWeight: "bold",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    boxShadow:
                      "0 4px 15px rgba(249, 115, 22, 0.4)",
                    transition: "0.3s"
                  }}
                >
                  Autorizar Acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE REPORTE CIDADÃO */}
      {mostrarModalReporte && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(5px)",
            zIndex: 2000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              padding: "25px",
              borderRadius: "16px",
              border:
                "1px solid rgba(255,255,255,0.2)",
              width: "90%",
              maxWidth: "400px",
              color: "#fff",
              fontFamily: "'Segoe UI', sans-serif",
              boxShadow:
                "0 20px 50px rgba(0,0,0,0.8)"
            }}
          >
            <h3
              style={{
                margin: "0 0 15px 0",
                color: "#fbbf24"
              }}
            >
              ⚠️ Reportar Ocorrência
            </h3>

            <form
              onSubmit={enviarReporte}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    color: "#94a3b8"
                  }}
                >
                  Tipo de Problema:
                </label>

                <select
                  value={tipoProblema}
                  onChange={e =>
                    setTipoProblema(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    marginTop: "5px",
                    borderRadius: "8px",
                    backgroundColor:
                      "rgba(0,0,0,0.5)",
                    color: "#fff",
                    border:
                      "1px solid rgba(255,255,255,0.2)"
                  }}
                >
                  <option value="Lotação Máxima">
                    Lotação Máxima
                  </option>

                  <option value="Ar-condicionado Quebrado">
                    Ar-condicionado Quebrado
                  </option>

                  <option value="Acidente na Via">
                    Acidente na Via
                  </option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.8rem",
                    color: "#94a3b8"
                  }}
                >
                  Comentário Opcional:
                </label>

                <textarea
                  value={comentarioReporte}
                  onChange={e =>
                    setComentarioReporte(e.target.value)
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    marginTop: "5px",
                    borderRadius: "8px",
                    backgroundColor:
                      "rgba(0,0,0,0.5)",
                    color: "#fff",
                    border:
                      "1px solid rgba(255,255,255,0.2)",
                    height: "80px",
                    resize: "none"
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "10px"
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setMostrarModalReporte(false)
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor:
                      "rgba(255,255,255,0.1)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "#fbbf24",
                    color: "#000",
                    fontWeight: "bold",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer"
                  }}
                >
                  Enviar Alerta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MAPA E CAMADAS DE MARCADORES (React-Leaflet) */}
      <MapContainer
        center={[
          posicaoCentro.lat,
          posicaoCentro.lon
        ]}
        zoom={14}
        zoomControl={false}
        style={{
          height: "100%",
          width: "100%",
          zIndex: 1
        }}
      >
        <TileLayer
          className="map-tiles"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. MÓDULO DOS ÔNIBUS */}
        {!visaoGestao &&
          frotaAtual.map((onibus) => {
            const corLotacao =
              onibus.lotacao > 80
                ? '#ef4444'
                : (onibus.lotacao > 50
                  ? '#f59e0b'
                  : '#10b981');

            return (
              <Marker
                key={onibus.id_veiculo}
                position={[
                  onibus.latitude,
                  onibus.longitude
                ]}
                icon={getIconeOnibus(onibus)}
              >
                <Popup>
                  <b style={{ fontSize: "1.1rem" }}>
                    Veículo: {onibus.id_veiculo}
                  </b>

                  <br />

                  <hr
                    style={{
                      margin: "5px 0",
                      borderColor:
                        "rgba(0,0,0,0.1)"
                    }}
                  />

                  <b>Sentido:</b>{" "}
                  {onibus.sentido}

                  <br />

                  <b>Velocidade:</b>{" "}
                  {onibus.velocidade_atual_kmh} km/h

                  <br />

                  <div
                    style={{
                      marginTop: "5px",
                      padding: "5px",
                      backgroundColor: "#f1f5f9",
                      borderRadius: "5px"
                    }}
                  >
                    <b>Lotação:</b>{" "}
                    <span
                      style={{
                        color: corLotacao,
                        fontWeight: "bold"
                      }}
                    >
                      {onibus.lotacao || 0}% 👤
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: "5px",
                      padding: "5px",
                      backgroundColor:
                        onibus.atraso_previsto_minutos > 0
                          ? '#dcfce3'
                          : '#f1f5f9',
                      borderRadius: "5px"
                    }}
                  >
                    <b>
                      Onda Verde (Semáforo):
                    </b>{" "}

                    <span
                      style={{
                        color:
                          onibus.atraso_previsto_minutos > 0
                            ? '#10b981'
                            : '#64748b',
                        fontWeight: "bold"
                      }}
                    >
                      {onibus.atraso_previsto_minutos > 0
                        ? 'Transmitindo 📡'
                        : 'Desativado'}
                    </span>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        {visaoGestao && mapaCalor.map((reporte, index) => (
          <CircleMarker 
            key={index} 
            position={[reporte.latitude, reporte.longitude]} 
            radius={18} 
            pathOptions={{ 
              color: '#f97316', 
              fillColor: '#f97316', 
              fillOpacity: 0.7,
              weight: 2 
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'sans-serif' }}>
                <b style={{ fontSize: '1rem', color: '#f97316' }}>⚠️ Alerta da Comunidade</b><hr style={{ margin: '4px 0' }}/>
                <b>Tipo:</b> {reporte.tipo_problema}<br/>
                {reporte.comentario && <span><b>Obs:</b> {reporte.comentario}</span>}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* 2. MÓDULO ETA: Estações e Previsão de Chegada */}
        {!visaoGestao &&
          estacoesBRT.map((estacao) => {
            let onibusMaisProximo = null;
            let menorDistancia = Infinity;

            frotaAtual.forEach(onibus => {
              const distancia = calcularDistancia(
                estacao.lat,
                estacao.lon,
                onibus.latitude,
                onibus.longitude
              );

              if (distancia < menorDistancia) {
                menorDistancia = distancia;
                onibusMaisProximo = onibus;
              }
            });

            let tempoEstimado = "Sem previsão";
            let corEta = "#64748b";

            if (onibusMaisProximo) {
              const velocidade =
                onibusMaisProximo.velocidade_atual_kmh > 0
                  ? onibusMaisProximo.velocidade_atual_kmh
                  : 1;

              let minutos = Math.round(
                (menorDistancia / velocidade) * 60
              );

              minutos +=
                onibusMaisProximo.atraso_previsto_minutos;

              if (minutos === 0) {
                minutos = 1;
              }

              tempoEstimado = `${minutos} min`;

              corEta =
                minutos > 10
                  ? "#ef4444"
                  : (minutos > 5
                    ? "#f59e0b"
                    : "#10b981");
            }

            return (
              <Marker
                key={estacao.id}
                position={[
                  estacao.lat,
                  estacao.lon
                ]}
                icon={iconeEstacao}
              >
                <Popup>
                  <b style={{ fontSize: "1.1rem" }}>
                    🚏 {estacao.nome}
                  </b>

                  <br />

                  <hr
                    style={{
                      margin: "5px 0",
                      borderColor:
                        "rgba(0,0,0,0.1)"
                    }}
                  />

                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "5px",
                      textAlign: "center"
                    }}
                  >
                    <b>
                      Próximo veículo em:
                    </b>

                    <br />

                    <span
                      style={{
                        color: corEta,
                        fontWeight: "bold",
                        fontSize: "1.5rem"
                      }}
                    >
                      {tempoEstimado}
                    </span>
                  </div>

                  {onibusMaisProximo && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.85rem",
                        color: "#64748b"
                      }}
                    >
                      Veículo mais próximo:{" "}
                      <b>
                        {onibusMaisProximo.id_veiculo}
                      </b>

                      <br />

                      Distância real:{" "}
                      <b>
                        {(menorDistancia * 1000).toFixed(0)}
                        {" "}metros
                      </b>
                    </div>
                  )}
                </Popup>
              </Marker>
            );
          })}

        {/* 3. MÓDULO SEMÁFOROS: Inteligência de Cruzamentos */}
        {!visaoGestao &&
          cruzamentosInteligentes.map((semaforo) => {
            const prioridadeAtivada =
              frotaAtual.some(
                onibus =>
                  onibus.atraso_previsto_minutos > 0
              );

            const corTexto =
              prioridadeAtivada
                ? '#10b981'
                : '#ef4444';

            return (
              <Marker
                key={semaforo.id}
                position={[
                  semaforo.lat,
                  semaforo.lon
                ]}
                icon={getIconeSemaforo(
                  prioridadeAtivada
                )}
              >
                <Popup>
                  <b style={{ fontSize: "1.1rem" }}>
                    🚦 Semáforo IoT
                  </b>

                  <br />

                  <hr
                    style={{
                      margin: "5px 0",
                      borderColor:
                        "rgba(0,0,0,0.1)"
                    }}
                  />

                  <b>Local:</b>{" "}
                  {semaforo.nome}

                  <br />

                  <b>Sistema BRT:</b>{" "}
                  <span
                    style={{
                      color: corTexto,
                      fontWeight: "bold"
                    }}
                  >
                    {prioridadeAtivada
                      ? 'Onda Verde (Prioridade Aberta)'
                      : 'Ciclo Normal (Fechado)'}
                  </span>
                </Popup>
              </Marker>
            );
          })}

        {/* 4. MARCADOR DO USUÁRIO */}
        {posicaoUsuario &&
          !visaoGestao && (
            <Marker
              position={[
                posicaoUsuario.lat,
                posicaoUsuario.lon
              ]}
              icon={IconeUsuario}
            >
              <Popup>
                Você está aqui
              </Popup>
            </Marker>
          )}

        <RecenterAutomatically
          lat={
            posicaoUsuario && !seguirVeiculo
              ? posicaoUsuario.lat
              : posicaoCentro.lat
          }
          lon={
            posicaoUsuario && !seguirVeiculo
              ? posicaoUsuario.lon
              : posicaoCentro.lon
          }
          seguirVeiculo={
            seguirVeiculo && !visaoGestao
          }
        />
      </MapContainer>
    </div>
  );
}

export default App;
