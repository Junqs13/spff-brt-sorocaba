import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const IconeLivre = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-livre">🚌</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
const IconeAtrasado = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-onibus onibus-atrasado">🚌</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
const IconeUsuario = L.divIcon({ className: 'custom-div-icon', html: '<div class="icone-usuario usuario-gps">🙋‍♂️</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

function RecenterAutomatically({ lat, lon, seguirVeiculo }) {
  const map = useMap();
  useEffect(() => {
    if (seguirVeiculo && lat && lon) {
      map.flyTo([lat, lon], 14, { animate: true, duration: 1.5 }); // Zoom 14 para ver a frota toda
    }
  }, [lat, lon, map, seguirVeiculo]);
  return null;
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function App() {
  const [rotaSelecionada, setRotaSelecionada] = useState("BRT_NORTE_ITAVUVU");
  const [posicaoCentro, setPosicaoCentro] = useState({ lat: -23.4611, lon: -47.4796 }); 
  
  // ESTADO ALTERADO: Agora é uma LISTA de ônibus (frota)
  const [frotaAtual, setFrotaAtual] = useState([]); 
  
  const [seguirVeiculo, setSeguirVeiculo] = useState(true);
  
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [clima, setClima] = useState(null);
  
  const [posicaoUsuario, setPosicaoUsuario] = useState(null);
  const [buscandoGps, setBuscandoGps] = useState(false);

  const [alarmeAtivo, setAlarmeAtivo] = useState(false);
  const [distanciaMetros, setDistanciaMetros] = useState(null);
  const [alertaDisparado, setAlertaDisparado] = useState(false);

  // Estados do Modal
  const [mostrarModalReporte, setMostrarModalReporte] = useState(false);
  const [tipoProblema, setTipoProblema] = useState("Lotação Máxima");
  const [comentarioReporte, setComentarioReporte] = useState("");

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

  // Alarme de proximidade adaptado para olhar para a frota inteira
  useEffect(() => {
    if (posicaoUsuario && frotaAtual.length > 0) {
      // Encontra a distância do ônibus mais próximo
      let menorDistancia = Infinity;
      
      frotaAtual.forEach(onibus => {
        const dist = calcularDistanciaMetros(
            posicaoUsuario.lat, posicaoUsuario.lon,
            onibus.latitude, onibus.longitude
        );
        if (dist < menorDistancia) menorDistancia = dist;
      });

      setDistanciaMetros(Math.round(menorDistancia));

      if (alarmeAtivo && menorDistancia <= 1000 && !alertaDisparado) {
        setAlertaDisparado(true);
        alert("🚨 ATENÇÃO! O seu veículo BRT está a menos de 1 km de distância!");
      }
    }
  }, [posicaoUsuario, frotaAtual, alarmeAtivo, alertaDisparado]);

  useEffect(() => {
    const buscarFrota = async () => {
      try {
        const resposta = await fetch(`http://127.0.0.1:8000/veiculos/ativos/${rotaSelecionada}`);
        const dados = await resposta.json();
        
        if (dados && dados.frota && dados.frota.length > 0) {
          setFrotaAtual(dados.frota);
          setPosicaoCentro({ lat: dados.frota[0].latitude, lon: dados.frota[0].longitude });
        } else {
            setFrotaAtual([]);
        }
      } catch (erro) {
        console.error("Erro API:", erro);
      }
    };

    buscarFrota();
    const intervalo = setInterval(buscarFrota, 3000);
    return () => clearInterval(intervalo);
  }, [rotaSelecionada]);

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
    try {
      const resposta = await fetch("http://127.0.0.1:8000/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_rota: rotaSelecionada,
          tipo_problema: tipoProblema,
          comentario: comentarioReporte
        })
      });

      if (resposta.ok) {
        alert("✅ Alerta enviado com sucesso! Obrigado por colaborar com a comunidade.");
        setMostrarModalReporte(false);
        setComentarioReporte("");
      } else {
        alert("Erro ao enviar reporte.");
      }
    } catch (erro) {
      console.error("Erro:", erro);
      alert("Erro de conexão com o servidor.");
    }
  };

  const rotaComLentidao = frotaAtual.some(onibus => onibus.atraso_previsto_minutos > 0);
  const corPrincipal = rotaComLentidao ? "#ff0055" : "#00ffcc";

  return (
    <div style={{ height: "100vh", width: "100vw", backgroundColor: "#000" }}>
      
      <div className="widget-clima">
        <div style={{ textAlign: "center" }}>
            <p className="titulo-widget" style={{ margin: 0, fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>Horário</p>
            <p className="valor-widget" style={{ margin: 0, fontSize: "1.4rem", fontWeight: "bold", fontFamily: "monospace" }}>{horaAtual.toLocaleTimeString('pt-BR')}</p>
        </div>
        <div style={{ width: "1px", height: "30px", backgroundColor: "rgba(255,255,255,0.2)" }}></div>
        <div style={{ textAlign: "center" }}>
            <p className="titulo-widget" style={{ margin: 0, fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>Sorocaba</p>
            <p className="valor-widget" style={{ margin: 0, fontSize: "1.4rem", fontWeight: "bold", color: "#00ffcc" }}>{clima ? `${clima.temperature}°C` : "--°C"}</p>
        </div>
      </div>

      <div className="painel-controle" style={{ 
        border: `1px solid rgba(${rotaComLentidao ? '255,0,85' : '0,255,204'}, 0.3)`,
        boxShadow: `0 10px 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(${rotaComLentidao ? '255,0,85' : '0,255,204'}, 0.1)`
      }}>
        <h2 style={{ margin: "0 0 15px 0", fontSize: "1.5rem", fontWeight: "300", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: corPrincipal, borderRadius: "50%", boxShadow: `0 0 15px ${corPrincipal}` }}></span>
          SPFF | <b style={{ color: corPrincipal }}>CCO Sorocaba</b>
        </h2>
        
        <div style={{ marginBottom: "15px" }}>
        <select 
            value={rotaSelecionada} 
            onChange={(e) => setRotaSelecionada(e.target.value)}
            style={{ 
              width: "100%", padding: "12px", marginTop: "5px", borderRadius: "8px", 
              border: `1px solid ${corPrincipal}`, backgroundColor: "rgba(0,0,0,0.6)", 
              color: corPrincipal, fontSize: "1rem", outline: "none", cursor: "pointer", fontWeight: "bold"
            }}
        >
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
            
            <div style={{ 
              padding: "10px", borderRadius: "8px",
              backgroundColor: rotaComLentidao ? "rgba(255, 0, 85, 0.15)" : "rgba(0, 255, 204, 0.15)",
              color: corPrincipal, borderLeft: `4px solid ${corPrincipal}`,
              textAlign: "center", textTransform: "uppercase", letterSpacing: "1px"
            }}>
              <p style={{ margin: 0, fontSize: "0.65rem", opacity: 0.8 }}>Status Geral (IA)</p>
              <p style={{ margin: "2px 0 0 0", fontSize: "1.1rem", fontWeight: "900" }}>
                {rotaComLentidao ? `ALERTA DE LENTIDÃO` : "FLUXO OTIMIZADO"}
              </p>
            </div>
            
            <div style={{ backgroundColor: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ margin: "5px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>
                🚌 <b>Veículos operando na via:</b> {frotaAtual.length}
              </p>
              
              {posicaoUsuario && distanciaMetros !== null && (
                <p style={{ margin: "6px 0 0 0", fontSize: "0.85rem", color: "#60a5fa", display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "6px" }}>
                  <span>📍 Veículo mais próximo:</span> <span style={{ fontWeight: "bold" }}>{distanciaMetros} metros</span>
                </p>
              )}
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
                if (!posicaoUsuario) { alert("Ative a sua localização ('Onde estou?') primeiro para usar o alarme!"); return; }
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
                  <option value="Veículo com Atraso Real">Veículo com Atraso Real</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Comentário Opcional:</label>
                <textarea value={comentarioReporte} onChange={(e) => setComentarioReporte(e.target.value)} placeholder="Ex: Lotação absurda no ponto central..." style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", height: "80px", resize: "none", boxSizing: "border-box" }} />
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
        
        {frotaAtual.map((onibus) => (
            <Marker key={onibus.id_veiculo} position={[onibus.latitude, onibus.longitude]} icon={onibus.atraso_previsto_minutos > 0 ? IconeAtrasado : IconeLivre}>
              <Popup>
                <b>Veículo: {onibus.id_veiculo}</b><br/>
                Velocidade: {onibus.velocidade_atual_kmh} km/h <br/>
                Status: {onibus.atraso_previsto_minutos > 0 ? `Atraso: ${onibus.atraso_previsto_minutos} min` : "No horário"}<br/>
                Acessibilidade: {onibus.acessibilidade_ativa ? "OK" : "Indisponível"}
              </Popup>
            </Marker>
        ))}

        {posicaoUsuario && (
          <Marker position={[posicaoUsuario.lat, posicaoUsuario.lon]} icon={IconeUsuario}>
            <Popup>Você está aqui</Popup>
          </Marker>
        )}
        
        <RecenterAutomatically lat={posicaoUsuario && !seguirVeiculo ? posicaoUsuario.lat : posicaoCentro.lat} lon={posicaoUsuario && !seguirVeiculo ? posicaoUsuario.lon : posicaoCentro.lon} seguirVeiculo={seguirVeiculo} />
      </MapContainer>
    </div>
  );
}

export default App;