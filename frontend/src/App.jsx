import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ÍCONES DIFERENTES (Centro Livre/Atrasado e Bairro Livre/Atrasado)
const IconeCentroLivre = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-livre">🚌</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
const IconeCentroAtrasado = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-atrasado">🚌</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
const IconeBairroLivre = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-livre">🚍</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
const IconeBairroAtrasado = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-atrasado">🚍</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

const IconeUsuario = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-usuario usuario-gps">🙋‍♂️</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

function RecenterAutomatically({ lat, lon, seguirVeiculo }) {
  const map = useMap();
  useEffect(() => {
    if (seguirVeiculo && lat && lon) {
      map.flyTo([lat, lon], 14, { animate: true, duration: 1.5 });
    }
  }, [lat, lon, map, seguirVeiculo]);
  return null;
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function App() {
  const [rotaSelecionada, setRotaSelecionada] = useState("BRT_NORTE_ITAVUVU");
  const [posicaoCentro, setPosicaoCentro] = useState({ lat: -23.4611, lon: -47.4796 }); 
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

  const [visaoGestao, setVisaoGestao] = useState(false);
  const [mapaCalor, setMapaCalor] = useState([]);

  const rotaComLentidao = frotaAtual.some(onibus => onibus.atraso_previsto_minutos > 0);
  const corPrincipal = visaoGestao ? "#f97316" : (rotaComLentidao ? "#ff0055" : "#00ffcc");

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
      falarTexto(`Visão de gestão ativada. ${mapaCalor.length} ocorrências registradas pela comunidade no mapa.`);
      return;
    }
    if (frotaAtual.length === 0) {
      falarTexto("Nenhum veículo operando nesta rota no momento.");
      return;
    }
    const nomeRotaAmigavel = rotaSelecionada.split('_').pop();
    let texto = `Corredor ${nomeRotaAmigavel}. ${frotaAtual.length} veículos em operação. `;
    if (rotaComLentidao) texto += "Atenção: A inteligência artificial detectou lentidão na via. ";
    else texto += "Fluxo otimizado. ";
    falarTexto(texto);
  };

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.5015&longitude=-47.4582&current_weather=true")
      .then(res => res.json())
      .then(data => setClima(data.current_weather))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setFrotaAtual([]);
    setAlertaDisparado(false);
  }, [rotaSelecionada]);

  useEffect(() => {
    if (visaoGestao) {
      fetch("https://api-cco-sorocaba.onrender.com/reportes")
        .then(res => res.json())
        .then(data => setMapaCalor(data.ocorrencias))
        .catch(console.error);
    }
  }, [visaoGestao]);

  useEffect(() => {
    if (posicaoUsuario && frotaAtual.length > 0 && !visaoGestao) {
      let menorDistancia = Infinity;
      frotaAtual.forEach(onibus => {
        const dist = calcularDistanciaMetros(posicaoUsuario.lat, posicaoUsuario.lon, onibus.latitude, onibus.longitude);
        if (dist < menorDistancia) menorDistancia = dist;
      });
      setDistanciaMetros(Math.round(menorDistancia));

      if (alarmeAtivo && menorDistancia <= 1000 && !alertaDisparado) {
        setAlertaDisparado(true);
        falarTexto("Atenção passageiro! O seu veículo está a menos de um quilômetro de distância. Prepare-se para o embarque.");
        setTimeout(() => { alert("🚨 ATENÇÃO! O seu veículo BRT está a menos de 1 km de distância!"); }, 500);
      }
    }
  }, [posicaoUsuario, frotaAtual, alarmeAtivo, alertaDisparado, visaoGestao]);

  useEffect(() => {
    const buscarFrota = async () => {
      if (visaoGestao) return;
      try {
        const resposta = await fetch(`https://api-cco-sorocaba.onrender.com/veiculos/ativos/${rotaSelecionada}`);
        const dados = await resposta.json();
        if (dados && dados.frota && dados.frota.length > 0) {
          setFrotaAtual(dados.frota);
          setPosicaoCentro({ lat: dados.frota[0].latitude, lon: dados.frota[0].longitude });
        } else {
            setFrotaAtual([]);
        }
      } catch (erro) { console.error("Erro API:", erro); }
    };
    buscarFrota();
    const intervalo = setInterval(buscarFrota, 3000);
    return () => clearInterval(intervalo);
  }, [rotaSelecionada, visaoGestao]);

  const localizarUsuario = () => {
    setBuscandoGps(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPosicaoUsuario({ lat: position.coords.latitude, lon: position.coords.longitude });
          setBuscandoGps(false);
          setSeguirVeiculo(false);
        },
        () => { alert("Permita o GPS."); setBuscandoGps(false); },
        { enableHighAccuracy: true }
      );
    }
  };

  const enviarReporte = async (e) => {
    e.preventDefault();
    const latReporte = posicaoUsuario ? posicaoUsuario.lat : posicaoCentro.lat;
    const lonReporte = posicaoUsuario ? posicaoUsuario.lon : posicaoCentro.lon;

    try {
      const resposta = await fetch("https://api-cco-sorocaba.onrender.com/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id_rota: rotaSelecionada, 
          tipo_problema: tipoProblema, 
          latitude: latReporte,
          longitude: lonReporte,
          comentario: comentarioReporte 
        })
      });
      if (resposta.ok) {
        alert("✅ Alerta enviado! Ele agora fará parte do Mapa de Calor da cidade.");
        setMostrarModalReporte(false);
        setComentarioReporte("");
        if (visaoGestao) { 
            fetch("https://api-cco-sorocaba.onrender.com/reportes").then(res=>res.json()).then(data=>setMapaCalor(data.ocorrencias));
        }
      }
    } catch (erro) { alert("Erro de conexão."); }
  };

  // FUNÇÃO PARA ESCOLHER O ÍCONE CORRETO BASEADO NO SENTIDO E ATRASO
  const getIconeOnibus = (onibus) => {
    if (onibus.sentido === "Centro") {
        return onibus.atraso_previsto_minutos > 0 ? IconeCentroAtrasado : IconeCentroLivre;
    } else {
        return onibus.atraso_previsto_minutos > 0 ? IconeBairroAtrasado : IconeBairroLivre;
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw", backgroundColor: "#000" }}>
      
      <div className="widget-clima">
        <div style={{ textAlign: "center" }}>
            <p className="titulo-widget" style={{ margin: 0, fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>Horário</p>
            <p className="valor-widget" style={{ margin: 0, fontSize: "1.4rem", fontWeight: "bold", fontFamily: "monospace" }}>{horaAtual.toLocaleTimeString('pt-BR')}</p>
        </div>
        <div style={{ width: "1px", height: "30px", backgroundColor: "rgba(255,255,255,0.2)" }}></div>
        <div style={{ textAlign: "center" }}>
            <p className="titulo-widget" style={{ margin: 0, fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" }}>Sorocaba</p>
            <p className="valor-widget" style={{ margin: 0, fontSize: "1.4rem", fontWeight: "bold", color: "#00ffcc" }}>{clima ? `${clima.temperature}°C` : "--°C"}</p>
        </div>
      </div>

      <div className="painel-controle" style={{ border: `1px solid rgba(${visaoGestao ? '249,115,22' : (rotaComLentidao ? '255,0,85' : '0,255,204')}, 0.3)`, boxShadow: `0 10px 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(${visaoGestao ? '249,115,22' : (rotaComLentidao ? '255,0,85' : '0,255,204')}, 0.1)` }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "300", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: corPrincipal, borderRadius: "50%", boxShadow: `0 0 15px ${corPrincipal}` }}></span>
            SPFF | <b style={{ color: corPrincipal }}>CCO</b>
          </h2>
          <button onClick={lerStatusEmVoz} style={{ backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }} title="Ouvir Status (Acessibilidade)">🔊</button>
        </div>
        
        <button 
          onClick={() => setVisaoGestao(!visaoGestao)}
          style={{
            width: "100%", padding: "12px", marginBottom: "15px", cursor: "pointer",
            backgroundColor: visaoGestao ? "rgba(249, 115, 22, 0.3)" : "rgba(255,255,255,0.05)",
            color: visaoGestao ? "#f97316" : "#cbd5e1",
            border: `1px solid ${visaoGestao ? "#f97316" : "rgba(255,255,255,0.2)"}`,
            borderRadius: "8px", fontSize: "0.9rem", fontWeight: "bold", transition: "all 0.3s"
          }}
        >
          {visaoGestao ? "📊 SAIR DA VISÃO GESTÃO" : "📈 Ativar Visão Gestão (Mapa de Calor)"}
        </button>

        {!visaoGestao ? (
            <>
                <div style={{ marginBottom: "15px" }}>
                    <select value={rotaSelecionada} onChange={(e) => setRotaSelecionada(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: `1px solid ${corPrincipal}`, backgroundColor: "rgba(0,0,0,0.6)", color: corPrincipal, fontSize: "1rem", outline: "none", cursor: "pointer", fontWeight: "bold" }}>
                        <option value="BRT_NORTE_ITAVUVU">Av. Itavuvu (Norte)</option>
                        <option value="BRT_NORTE_IPANEMA">Av. Ipanema (Norte)</option>
                        <option value="BRT_OESTE_GEN_CARNEIRO">Av. Gen. Carneiro (Oeste)</option>
                        <option value="BRT_OESTE_PANNUNZIO">Av. A. Pannunzio (Oeste)</option>
                        <option value="BRT_LESTE_SAO_PAULO">Avenida São Paulo (Leste)</option>
                        <option value="BRT_SUL_WASH_LUIS">Av. Washington Luís (Sul)</option>
                        <option value="BRT_SUL_COMITRE">Av. A. C. Comitre (Sul)</option>
                    </select>
                </div>
                
                {frotaAtual.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ padding: "10px", borderRadius: "8px", backgroundColor: rotaComLentidao ? "rgba(255, 0, 85, 0.15)" : "rgba(0, 255, 204, 0.15)", color: corPrincipal, borderLeft: `4px solid ${corPrincipal}`, textAlign: "center", textTransform: "uppercase", letterSpacing: "1px" }}>
                    <p style={{ margin: 0, fontSize: "0.65rem", opacity: 0.8 }}>Status Geral (IA)</p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "1.1rem", fontWeight: "900" }}>{rotaComLentidao ? `ALERTA DE LENTIDÃO` : "FLUXO OTIMIZADO"}</p>
                    </div>
                    
                    <div style={{ backgroundColor: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p style={{ margin: "5px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>🚌 <b>Veículos operando:</b> {frotaAtual.length}</p>
                    {posicaoUsuario && distanciaMetros !== null && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "0.85rem", color: "#60a5fa", display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px" }}>
                        <span>📍 Distância do veículo:</span> <span style={{ fontWeight: "bold" }}>{distanciaMetros} metros</span>
                        </p>
                    )}
                    </div>

                    {/* LEGENDA DO MAPA */}
                    <div style={{ padding: "10px", backgroundColor: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "0.75rem", color: "#94a3b8" }}>
                        <p style={{ margin: "0 0 5px 0", fontWeight: "bold", color: "#cbd5e1", textTransform: "uppercase" }}>Legenda do Mapa</p>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <span>🚌 Sentido Centro</span>
                            <span>🚍 Sentido Bairro</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span><span style={{color: "#00ffcc"}}>🟢</span> Fluxo Livre</span>
                            <span><span style={{color: "#ff0055"}}>🔴</span> Atraso/Lentidão</span>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                    <button onClick={() => setSeguirVeiculo(!seguirVeiculo)} style={{ padding: "10px", flex: 1, cursor: "pointer", backgroundColor: seguirVeiculo ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.5)", color: seguirVeiculo ? "#fff" : "#94a3b8", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", fontSize: "0.85rem" }}>
                        {seguirVeiculo ? "🔒 Câmera" : "🔓 Câmera"}
                    </button>
                    <button onClick={localizarUsuario} style={{ padding: "10px", flex: 1, cursor: "pointer", backgroundColor: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.5)", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "bold" }}>
                        {buscandoGps ? "📍 Buscando..." : "📍 Onde estou?"}
                    </button>
                    </div>

                    <button onClick={() => {
                        if (!posicaoUsuario) { alert("Ative a sua localização primeiro para usar o alarme!"); return; }
                        setAlarmeAtivo(!alarmeAtivo); setAlertaDisparado(false);
                    }}
                    style={{ padding: "10px", width: "100%", cursor: "pointer", backgroundColor: alarmeAtivo ? "rgba(239, 68, 68, 0.3)" : "rgba(255, 255, 255, 0.05)", color: alarmeAtivo ? "#f87171" : "#94a3b8", border: `1px solid ${alarmeAtivo ? "#ef4444" : "rgba(255,255,255,0.2)"}`, borderRadius: "8px", fontSize: "0.85rem", fontWeight: "bold" }}
                    >
                    {alarmeAtivo ? "🔔 Alarme Ligado (< 1km)" : "🔕 Ligar Alarme de Proximidade"}
                    </button>

                    <button onClick={() => setMostrarModalReporte(true)} style={{ padding: "10px", width: "100%", cursor: "pointer", backgroundColor: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "bold" }}>
                    ⚠️ Reportar Ocorrência na Rota
                    </button>
                </div>
                ) : (
                <p style={{ textAlign: "center", color: "#64748b", fontStyle: "italic", padding: "10px 0", fontSize: "0.9rem" }}>Nenhum veículo nesta via.</p>
                )}
            </>
        ) : (
            <div style={{ textAlign: "center", color: "#f97316", padding: "20px 0" }}>
                <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "0 0 10px 0" }}>Dashboard Municipal</p>
                <p style={{ fontSize: "0.9rem", color: "#cbd5e1" }}>Exibindo {mapaCalor.length} áreas com alta concentração de ocorrências pela cidade.</p>
                <button onClick={() => setMostrarModalReporte(true)} style={{ marginTop: "20px", padding: "10px", width: "100%", cursor: "pointer", backgroundColor: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.5)", borderRadius: "8px", fontSize: "0.85rem", fontWeight: "bold" }}>
                    ⚠️ Criar Nova Ocorrência Teste
                </button>
            </div>
        )}
      </div>

      {mostrarModalReporte && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(5px)", zIndex: 2000, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ backgroundColor: "#0f172a", padding: "25px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.2)", width: "90%", maxWidth: "400px", color: "#fff", fontFamily: "'Segoe UI', sans-serif", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
            <h3 style={{ margin: "0 0 15px 0", color: "#fbbf24" }}>⚠️ Reportar Ocorrência</h3>
            <form onSubmit={enviarReporte} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Tipo de Problema:</label>
                <select value={tipoProblema} onChange={(e) => setTipoProblema(e.target.value)} style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <option value="Lotação Máxima">Lotação Máxima</option>
                  <option value="Ar-condicionado Quebrado">Ar-condicionado Quebrado</option>
                  <option value="Acidente na Via">Acidente na Via</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Comentário Opcional:</label>
                <textarea value={comentarioReporte} onChange={(e) => setComentarioReporte(e.target.value)} style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", height: "80px", resize: "none" }} />
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setMostrarModalReporte(false)} style={{ flex: 1, padding: "10px", backgroundColor: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>Cancelar</button>
                <button type="submit" style={{ flex: 1, padding: "10px", backgroundColor: "#fbbf24", color: "#000", fontWeight: "bold", border: "none", borderRadius: "8px", cursor: "pointer" }}>Enviar Alerta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MapContainer center={[posicaoCentro.lat, posicaoCentro.lon]} zoom={14} zoomControl={false} style={{ height: "100%", width: "100%", zIndex: 1 }}>
        <TileLayer className="map-tiles" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {/* RENDERIZA ÔNIBUS COM OS ÍCONES DE DIREÇÃO */}
        {!visaoGestao && frotaAtual.map((onibus) => {
        const corLotacao = onibus.lotacao > 80 ? '#ef4444' : (onibus.lotacao > 50 ? '#f59e0b' : '#10b981');
        
        return (
          <Marker key={onibus.id_veiculo} position={[onibus.latitude, onibus.longitude]} icon={getIconeOnibus(onibus)}>
            <Popup>
              <b style={{fontSize: "1.1rem"}}>Veículo: {onibus.id_veiculo}</b><br/>
              <hr style={{margin: "5px 0", borderColor: "rgba(0,0,0,0.1)"}} />
              <b>Sentido:</b> {onibus.sentido} <br/>
              <b>Velocidade:</b> {onibus.velocidade_atual_kmh} km/h <br/>
              <div style={{ marginTop: "5px", padding: "5px", backgroundColor: "#f1f5f9", borderRadius: "5px" }}>
                  <b>Lotação:</b> <span style={{ color: corLotacao, fontWeight: "bold" }}>{onibus.lotacao || 0}% 👤</span>
              </div>
            </Popup>
          </Marker>
        );
    })}

        {posicaoUsuario && !visaoGestao && (
          <Marker position={[posicaoUsuario.lat, posicaoUsuario.lon]} icon={IconeUsuario}>
            <Popup>Você está aqui</Popup>
          </Marker>
        )}
        
        <RecenterAutomatically lat={posicaoUsuario && !seguirVeiculo ? posicaoUsuario.lat : posicaoCentro.lat} lon={posicaoUsuario && !seguirVeiculo ? posicaoUsuario.lon : posicaoCentro.lon} seguirVeiculo={seguirVeiculo && !visaoGestao} />
      </MapContainer>
    </div>
  );
}

export default App;