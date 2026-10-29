import os
import time
import random
import requests
import threading
import hmac
import hashlib
import secrets
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import db_manager

# 🔒 Carrega as senhas e chaves do arquivo .env
load_dotenv()

app = FastAPI(title="API Mobilidade Urbana Autônoma", version="2.0")

# 🔒 SEGURANÇA CORS
ORIGENS_PERMITIDAS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://spff-brt-sorocaba.vercel.app",
    "https://spff-brt-sorocaba.vercel.app/"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_PERMITIDAS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ==========================================
# ⚙️ POSIÇÕES AO VIVO E HISTÓRICO
# As posições atuais ficam na memória da API: o mapa continua mostrando
# os ônibus mesmo se o banco estiver lento, cheio ou fora do ar.
# O banco guarda só um histórico amostrado, para os gráficos da gestão.
# ==========================================
HISTORICO_A_CADA_SEGUNDOS = int(os.getenv("HISTORICO_A_CADA_SEGUNDOS", "120"))
DIAS_RETENCAO = int(os.getenv("DIAS_RETENCAO", "7"))
POSICAO_VALIDA_SEGUNDOS = 5 * 60

posicoes_ao_vivo = {}      # id_veiculo -> última posição
ultimo_historico = {}      # id_veiculo -> momento da última gravação no banco
trava_posicoes = threading.Lock()

SQL_INSERIR_TELEMETRIA = (
    "INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, "
    "velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa, lotacao) "
    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
)

def registrar_posicao(dados: dict) -> bool:
    """Atualiza a posição ao vivo. Devolve True se está na hora de gravar no histórico."""
    agora = time.time()
    registro = dict(dados)
    registro["data_hora"] = datetime.now(timezone.utc).isoformat()
    registro["_ts"] = agora
    with trava_posicoes:
        posicoes_ao_vivo[dados["id_veiculo"]] = registro
        if agora - ultimo_historico.get(dados["id_veiculo"], 0) >= HISTORICO_A_CADA_SEGUNDOS:
            ultimo_historico[dados["id_veiculo"]] = agora
            return True
    return False

def linha_historico(d: dict) -> tuple:
    return (d["id_veiculo"], d["id_rota"], d["latitude"], d["longitude"], d["sentido"],
            d["velocidade_atual_kmh"], d["atraso_previsto_minutos"], d["acessibilidade_ativa"], d["lotacao"])

def gravar_historico(linhas: list):
    if not linhas:
        return
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany(SQL_INSERIR_TELEMETRIA, linhas)
        conn.commit()
        cursor.close()

# ==========================================
# 🔒 LOGIN DA ÁREA DE GESTÃO
# A senha fica só no servidor (variáveis de ambiente), nunca no site.
# Configure no Render: ADMIN_USUARIO, ADMIN_SENHA e TOKEN_SEGREDO.
# ==========================================
class LoginIn(BaseModel):
    usuario: str
    senha: str

TOKEN_VALIDADE_SEGUNDOS = 8 * 60 * 60
TOKEN_SEGREDO = os.getenv("TOKEN_SEGREDO") or secrets.token_hex(32)

def gerar_token(usuario: str) -> str:
    expira = int(time.time()) + TOKEN_VALIDADE_SEGUNDOS
    carga = f"{usuario}.{expira}"
    assinatura = hmac.new(TOKEN_SEGREDO.encode(), carga.encode(), hashlib.sha256).hexdigest()
    return f"{carga}.{assinatura}"

def token_valido(token: str) -> bool:
    try:
        usuario, expira, assinatura = token.rsplit(".", 2)
        esperada = hmac.new(TOKEN_SEGREDO.encode(), f"{usuario}.{expira}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(assinatura, esperada) and int(expira) > time.time()
    except Exception:
        return False

@app.post("/auth/login")
def login_gestao(dados: LoginIn):
    usuario_ok = os.getenv("ADMIN_USUARIO")
    senha_ok = os.getenv("ADMIN_SENHA")
    if not usuario_ok or not senha_ok:
        raise HTTPException(status_code=503, detail="Login de gestão não configurado no servidor.")
    usuario_certo = hmac.compare_digest(dados.usuario.encode(), usuario_ok.encode())
    senha_certa = hmac.compare_digest(dados.senha.encode(), senha_ok.encode())
    if not (usuario_certo and senha_certa):
        time.sleep(0.5)  # atrasa tentativas em sequência
        raise HTTPException(status_code=401, detail="Matrícula ou senha incorretas.")
    return {"token": gerar_token(dados.usuario)}

# ==========================================
# 1. ROTAS DA API (Para o Frontend ler)
# ==========================================
class TelemetriaIn(BaseModel):
    id_veiculo: str
    id_rota: str
    latitude: float
    longitude: float
    sentido: str = "Centro"
    velocidade_atual_kmh: int = 40
    atraso_previsto_minutos: int = 0
    acessibilidade_ativa: int = 1
    lotacao: int = 0

@app.get("/")
def rota_principal():
    try:
        # Usa o novo Context Manager seguro
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchall()
            cursor.close()
        return {"status": "Online", "mensagem": "API (Render) e Banco (Aiven) 100% Acordados!"}
    except Exception as erro:
        return {"status": "Recuperando", "mensagem": f"Reconectando ao Aiven: {str(erro)}"}

@app.post("/telemetria")
def receber_telemetria(dados: TelemetriaIn):
    if dados.lotacao == 0:
        dados.lotacao = random.randint(15, 95)
    registro = dados.model_dump()
    if registrar_posicao(registro):
        try:
            gravar_historico([linha_historico(registro)])
        except Exception as erro:
            # a posição ao vivo já foi atualizada; só o histórico ficou sem esse ponto
            print(f"⚠️ Histórico não gravado: {erro}")
    return {"status": "Sucesso"}

@app.get("/veiculos/ativos/{id_rota}")
def obter_posicoes_da_rota(id_rota: str):
    limite = time.time() - POSICAO_VALIDA_SEGUNDOS
    with trava_posicoes:
        frota = [
            {k: v for k, v in d.items() if k != "_ts"}
            for d in posicoes_ao_vivo.values()
            if d["id_rota"] == id_rota and d["_ts"] >= limite
        ]
    frota.sort(key=lambda d: d["id_veiculo"])
    return {"frota": frota}

class ReporteIn(BaseModel):
    id_rota: str
    tipo_problema: str
    latitude: float
    longitude: float
    comentario: str = None

@app.post("/reportes")
def criar_reporte(dados: ReporteIn):
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO reportes_comunidade (id_rota, tipo_problema, latitude, longitude, comentario) VALUES (%s, %s, %s, %s, %s)", 
                           (dados.id_rota, dados.tipo_problema, dados.latitude, dados.longitude, dados.comentario))
            conn.commit()
            cursor.close()
        return {"status": "Sucesso"}
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

@app.get("/reportes")
def listar_reportes():
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT tipo_problema, latitude, longitude FROM reportes_comunidade WHERE latitude IS NOT NULL")
            ocorrencias = cursor.fetchall()
            cursor.close()
        return {"ocorrencias": ocorrencias}
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

@app.get("/analytics/desempenho")
def obter_desempenho():
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            sql = """
                SELECT 
                    id_rota, 
                    ROUND(AVG(velocidade_atual_kmh), 1) as vel_media, 
                    ROUND(AVG(lotacao), 1) as lotacao_media
                FROM telemetria 
                WHERE data_hora >= NOW() - INTERVAL 24 HOUR
                GROUP BY id_rota;
            """
            cursor.execute(sql)
            dados = cursor.fetchall()
            
            if not dados:
                sql_fallback = """
                    SELECT 
                        id_rota, 
                        ROUND(AVG(velocidade_atual_kmh), 1) as vel_media, 
                        ROUND(AVG(lotacao), 1) as lotacao_media
                    FROM telemetria
                    GROUP BY id_rota
                    ORDER BY data_hora DESC;
                """
                cursor.execute(sql_fallback)
                dados = cursor.fetchall()

            cursor.close()
        
        for d in dados:
            d["nome_amigavel"] = d["id_rota"].split("_")[-1]
            
        return {"analytics": dados}
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

@app.get("/analytics/demanda")
def obter_curva_demanda():
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT ROUND(AVG(lotacao), 1) as lotacao_agora FROM telemetria WHERE data_hora >= NOW() - INTERVAL 15 MINUTE")
            real = cursor.fetchone()
            cursor.close()
        
        lotacao_real = real["lotacao_agora"] if real and real["lotacao_agora"] else 45.0

        horas_dia = ["06:00", "07:00", "08:00", "10:00", "12:00", "15:00", "17:00", "18:00", "19:00", "21:00", "23:00"]
        lotacao_historica = [30, 85, 75, 40, 60, 45, 70, 95, 80, 35, 15]
        
        curva_dados = []
        for i, hora in enumerate(horas_dia):
            curva_dados.append({
                "horario": hora, 
                "historico": lotacao_historica[i]
            })
        
        return {
            "tempo_real": lotacao_real,
            "curva": curva_dados
        }
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

@app.get("/analytics/clima-futuro")
def obter_previsao_clima():
    try:
        url = "https://api.open-meteo.com/v1/forecast?latitude=-23.5015&longitude=-47.4582&daily=temperature_2m_max,precipitation_probability_max&timezone=America%2FSao_Paulo"
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            dados = res.json().get("daily", {})
            previsao = []
            for i in range(5):
                previsao.append({
                    "data": dados["time"][i][-2:] + "/" + dados["time"][i][5:7], 
                    "temp_max": dados["temperature_2m_max"][i],
                    "chuva_probabilidade": dados["precipitation_probability_max"][i]
                })
            return {"previsao_5_dias": previsao}
        return {"previsao_5_dias": []}
    except Exception as erro:
        raise HTTPException(status_code=500, detail=str(erro))

# ==========================================
# 2. MOTOR IOT AUTÔNOMO (Roda em Segundo Plano)
# ==========================================
frotas_brt = {
    "BRT_NORTE_ITAVUVU": {
        "VEICULO_ITA_001": {"sentido": "Centro", "coords": [{"lat": -23.440141, "lon": -47.478301}, {"lat": -23.447297, "lon": -47.4795}, {"lat": -23.451701, "lon": -47.482464}, {"lat": -23.45848, "lon": -47.480295}, {"lat": -23.455423, "lon": -47.482369}, {"lat": -23.458476, "lon": -47.480296}, {"lat": -23.459233, "lon": -47.4801}, {"lat": -23.465995, "lon": -47.478704}, {"lat": -23.468341, "lon": -47.478179}, {"lat": -23.48866, "lon": -47.463552}]},
        "VEICULO_ITA_002": {"sentido": "Centro", "coords": [{"lat": -23.45848, "lon": -47.480295}, {"lat": -23.455423, "lon": -47.482369}, {"lat": -23.458476, "lon": -47.480296}, {"lat": -23.459233, "lon": -47.4801}, {"lat": -23.465995, "lon": -47.478704}, {"lat": -23.468341, "lon": -47.478179}, {"lat": -23.48866, "lon": -47.463552}, {"lat": -23.440141, "lon": -47.478301}, {"lat": -23.447297, "lon": -47.4795}, {"lat": -23.451701, "lon": -47.482464}]},
        "VEICULO_ITA_003": {"sentido": "Bairro", "coords": [{"lat": -23.495865, "lon": -47.459396}, {"lat": -23.493241, "lon": -47.458077}, {"lat": -23.486218, "lon": -47.465273}, {"lat": -23.484625, "lon": -47.468252}, {"lat": -23.48462, "lon": -47.468257}, {"lat": -23.483421, "lon": -47.471722}, {"lat": -23.463554, "lon": -47.479348}, {"lat": -23.450567, "lon": -47.480867}, {"lat": -23.440138, "lon": -47.478291}, {"lat": -23.436583, "lon": -47.473257}]},
        "VEICULO_ITA_004": {"sentido": "Bairro", "coords": [{"lat": -23.484625, "lon": -47.468252}, {"lat": -23.48462, "lon": -47.468257}, {"lat": -23.483421, "lon": -47.471722}, {"lat": -23.463554, "lon": -47.479348}, {"lat": -23.450567, "lon": -47.480867}, {"lat": -23.440138, "lon": -47.478291}, {"lat": -23.436583, "lon": -47.473257}, {"lat": -23.495865, "lon": -47.459396}, {"lat": -23.493241, "lon": -47.458077}, {"lat": -23.486218, "lon": -47.465273}]}
    },
    "BRT_NORTE_IPANEMA": {
        "VEICULO_IPA_001": {"sentido": "Centro", "coords": [{"lat": -23.456596, "lon": -47.503999}, {"lat": -23.456989, "lon": -47.503832}, {"lat": -23.461098, "lon": -47.499956}, {"lat": -23.462477, "lon": -47.498571}, {"lat": -23.467402, "lon": -47.494104}, {"lat": -23.470288, "lon": -47.491442}, {"lat": -23.477442, "lon": -47.484865}, {"lat": -23.480998, "lon": -47.479787}, {"lat": -23.488676, "lon": -47.463567}, {"lat": -23.493415, "lon": -47.459357}]},
        "VEICULO_IPA_002": {"sentido": "Centro", "coords": [{"lat": -23.462477, "lon": -47.498571}, {"lat": -23.467402, "lon": -47.494104}, {"lat": -23.470288, "lon": -47.491442}, {"lat": -23.477442, "lon": -47.484865}, {"lat": -23.480998, "lon": -47.479787}, {"lat": -23.488676, "lon": -47.463567}, {"lat": -23.493415, "lon": -47.459357}, {"lat": -23.456596, "lon": -47.503999}, {"lat": -23.456989, "lon": -47.503832}, {"lat": -23.461098, "lon": -47.499956}]},
        "VEICULO_IPA_003": {"sentido": "Bairro", "coords": [{"lat": -23.495947, "lon": -47.459263}, {"lat": -23.497462, "lon": -47.458654}, {"lat": -23.492776, "lon": -47.458478}, {"lat": -23.487765, "lon": -47.463146}, {"lat": -23.48457, "lon": -47.46963}, {"lat": -23.480877, "lon": -47.479693}, {"lat": -23.478489, "lon": -47.483623}, {"lat": -23.476751, "lon": -47.485221}, {"lat": -23.475182, "lon": -47.486682}, {"lat": -23.456791, "lon": -47.503678}]},
        "VEICULO_IPA_004": {"sentido": "Bairro", "coords": [{"lat": -23.487765, "lon": -47.463146}, {"lat": -23.48457, "lon": -47.46963}, {"lat": -23.480877, "lon": -47.479693}, {"lat": -23.478489, "lon": -47.483623}, {"lat": -23.476751, "lon": -47.485221}, {"lat": -23.475182, "lon": -47.486682}, {"lat": -23.456791, "lon": -47.503678}, {"lat": -23.495947, "lon": -47.459263}, {"lat": -23.497462, "lon": -47.458654}, {"lat": -23.492776, "lon": -47.458478}]}
    },
    "BRT_OESTE_GEN_CARNEIRO": {
        "VEICULO_GCA_001": {"sentido": "Centro", "coords": [{"lat": -23.504036, "lon": -47.476689}, {"lat": -23.504426, "lon": -47.472575}, {"lat": -23.503632, "lon": -47.470114}, {"lat": -23.503007, "lon": -47.468108}, {"lat": -23.503968, "lon": -47.466182}, {"lat": -23.504017, "lon": -47.463851}, {"lat": -23.502465, "lon": -47.461301}, {"lat": -23.499424, "lon": -47.461792}, {"lat": -23.497949, "lon": -47.461063}, {"lat": -23.495932, "lon": -47.459264}]},
        "VEICULO_GCA_002": {"sentido": "Centro", "coords": [{"lat": -23.503007, "lon": -47.468108}, {"lat": -23.503968, "lon": -47.466182}, {"lat": -23.504017, "lon": -47.463851}, {"lat": -23.502465, "lon": -47.461301}, {"lat": -23.499424, "lon": -47.461792}, {"lat": -23.497949, "lon": -47.461063}, {"lat": -23.495932, "lon": -47.459264}, {"lat": -23.504036, "lon": -47.476689}, {"lat": -23.504426, "lon": -47.472575}, {"lat": -23.503632, "lon": -47.470114}]},
        "VEICULO_GCA_003": {"sentido": "Bairro", "coords": [{"lat": -23.496147, "lon": -47.459551}, {"lat": -23.498319, "lon": -47.459267}, {"lat": -23.498798, "lon": -47.460073}, {"lat": -23.500692, "lon": -47.463824}, {"lat": -23.5027, "lon": -47.4684}, {"lat": -23.503072, "lon": -47.468845}, {"lat": -23.503603, "lon": -47.47016}, {"lat": -23.504306, "lon": -47.473008}, {"lat": -23.504356, "lon": -47.473001}, {"lat": -23.504037, "lon": -47.476688}]},
        "VEICULO_GCA_004": {"sentido": "Bairro", "coords": [{"lat": -23.500692, "lon": -47.463824}, {"lat": -23.5027, "lon": -47.4684}, {"lat": -23.503072, "lon": -47.468845}, {"lat": -23.503603, "lon": -47.47016}, {"lat": -23.504306, "lon": -47.473008}, {"lat": -23.504356, "lon": -47.473001}, {"lat": -23.504037, "lon": -47.476688}, {"lat": -23.496147, "lon": -47.459551}, {"lat": -23.498319, "lon": -47.459267}, {"lat": -23.498798, "lon": -47.460073}]}
    },
    "BRT_OESTE_PANNUNZIO": {
        "VEICULO_PAN_001": {"sentido": "Centro", "coords": [{"lat": -23.519876, "lon": -47.49049}, {"lat": -23.516305, "lon": -47.489505}, {"lat": -23.510082, "lon": -47.487736}, {"lat": -23.508958, "lon": -47.486005}, {"lat": -23.504784, "lon": -47.479771}, {"lat": -23.504451, "lon": -47.475795}, {"lat": -23.504427, "lon": -47.47258}, {"lat": -23.503973, "lon": -47.470794}, {"lat": -23.504014, "lon": -47.46385}, {"lat": -23.495927, "lon": -47.459261}]},
        "VEICULO_PAN_002": {"sentido": "Centro", "coords": [{"lat": -23.508958, "lon": -47.486005}, {"lat": -23.504784, "lon": -47.479771}, {"lat": -23.504451, "lon": -47.475795}, {"lat": -23.504427, "lon": -47.47258}, {"lat": -23.503973, "lon": -47.470794}, {"lat": -23.504014, "lon": -47.46385}, {"lat": -23.495927, "lon": -47.459261}, {"lat": -23.519876, "lon": -47.49049}, {"lat": -23.516305, "lon": -47.489505}, {"lat": -23.510082, "lon": -47.487736}]},
        "VEICULO_PAN_003": {"sentido": "Bairro", "coords": [{"lat": -23.495942, "lon": -47.459262}, {"lat": -23.500745, "lon": -47.463886}, {"lat": -23.5027, "lon": -47.468395}, {"lat": -23.50307, "lon": -47.468842}, {"lat": -23.504305, "lon": -47.473011}, {"lat": -23.504379, "lon": -47.477981}, {"lat": -23.506832, "lon": -47.483528}, {"lat": -23.5091, "lon": -47.486558}, {"lat": -23.512716, "lon": -47.489065}, {"lat": -23.519864, "lon": -47.49049}]},
        "VEICULO_PAN_004": {"sentido": "Bairro", "coords": [{"lat": -23.50307, "lon": -47.468842}, {"lat": -23.504305, "lon": -47.473011}, {"lat": -23.504379, "lon": -47.477981}, {"lat": -23.506832, "lon": -47.483528}, {"lat": -23.5091, "lon": -47.486558}, {"lat": -23.512716, "lon": -47.489065}, {"lat": -23.519864, "lon": -47.49049}, {"lat": -23.495942, "lon": -47.459262}, {"lat": -23.500745, "lon": -47.463886}, {"lat": -23.5027, "lon": -47.468395}]}
    },
    "BRT_LESTE_SAO_PAULO": {
        "VEICULO_SPA_001": {"sentido": "Centro", "coords": [{"lat": -23.490247, "lon": -47.429592}, {"lat": -23.491082, "lon": -47.432243}, {"lat": -23.492427, "lon": -47.434737}, {"lat": -23.493479, "lon": -47.436145}, {"lat": -23.4953, "lon": -47.438304}, {"lat": -23.496448, "lon": -47.439684}, {"lat": -23.497399, "lon": -47.440698}, {"lat": -23.498564, "lon": -47.444219}, {"lat": -23.500454, "lon": -47.449477}, {"lat": -23.495934, "lon": -47.459264}]},
        "VEICULO_SPA_002": {"sentido": "Centro", "coords": [{"lat": -23.493479, "lon": -47.436145}, {"lat": -23.4953, "lon": -47.438304}, {"lat": -23.496448, "lon": -47.439684}, {"lat": -23.497399, "lon": -47.440698}, {"lat": -23.498564, "lon": -47.444219}, {"lat": -23.500454, "lon": -47.449477}, {"lat": -23.495934, "lon": -47.459264}, {"lat": -23.490247, "lon": -47.429592}, {"lat": -23.491082, "lon": -47.432243}, {"lat": -23.492427, "lon": -47.434737}]},
        "VEICULO_SPA_003": {"sentido": "Bairro", "coords": [{"lat": -23.489688, "lon": -47.427934}, {"lat": -23.491056, "lon": -47.431951}, {"lat": -23.497499, "lon": -47.440663}, {"lat": -23.49807, "lon": -47.442021}, {"lat": -23.498643, "lon": -47.44389}, {"lat": -23.499348, "lon": -47.446056}, {"lat": -23.501095, "lon": -47.450377}, {"lat": -23.501527, "lon": -47.45247}, {"lat": -23.497206, "lon": -47.454797}, {"lat": -23.495944, "lon": -47.459262}]},
        "VEICULO_SPA_004": {"sentido": "Bairro", "coords": [{"lat": -23.49807, "lon": -47.442021}, {"lat": -23.498643, "lon": -47.44389}, {"lat": -23.499348, "lon": -47.446056}, {"lat": -23.501095, "lon": -47.450377}, {"lat": -23.501527, "lon": -47.45247}, {"lat": -23.497206, "lon": -47.454797}, {"lat": -23.495944, "lon": -47.459262}, {"lat": -23.489688, "lon": -47.427934}, {"lat": -23.491056, "lon": -47.431951}, {"lat": -23.497499, "lon": -47.440663}]}
    },
    "BRT_SUL_WASH_LUIS": {
        "VEICULO_WSL_001": {"sentido": "Centro", "coords": [{"lat": -23.515259, "lon": -47.464674}, {"lat": -23.514301, "lon": -47.464596}, {"lat": -23.510725, "lon": -47.462801}, {"lat": -23.509496, "lon": -47.46188}, {"lat": -23.507334, "lon": -47.462368}, {"lat": -23.502747, "lon": -47.467858}, {"lat": -23.499466, "lon": -47.468674}, {"lat": -23.497924, "lon": -47.468896}, {"lat": -23.496663, "lon": -47.465877}, {"lat": -23.495935, "lon": -47.459262}]},
        "VEICULO_WSL_002": {"sentido": "Centro", "coords": [{"lat": -23.509496, "lon": -47.46188}, {"lat": -23.507334, "lon": -47.462368}, {"lat": -23.502747, "lon": -47.467858}, {"lat": -23.499466, "lon": -47.468674}, {"lat": -23.497924, "lon": -47.468896}, {"lat": -23.496663, "lon": -47.465877}, {"lat": -23.495935, "lon": -47.459262}, {"lat": -23.515259, "lon": -47.464674}, {"lat": -23.514301, "lon": -47.464596}, {"lat": -23.510725, "lon": -47.462801}]},
        "VEICULO_WSL_003": {"sentido": "Bairro", "coords": [{"lat": -23.495929, "lon": -47.459262}, {"lat": -23.495292, "lon": -47.459943}, {"lat": -23.49615, "lon": -47.464812}, {"lat": -23.497718, "lon": -47.469047}, {"lat": -23.4995, "lon": -47.468783}, {"lat": -23.501982, "lon": -47.468409}, {"lat": -23.504053, "lon": -47.465948}, {"lat": -23.507784, "lon": -47.462124}, {"lat": -23.510735, "lon": -47.462983}, {"lat": -23.515248, "lon": -47.464675}]},
        "VEICULO_WSL_004": {"sentido": "Bairro", "coords": [{"lat": -23.497718, "lon": -47.469047}, {"lat": -23.4995, "lon": -47.468783}, {"lat": -23.501982, "lon": -47.468409}, {"lat": -23.504053, "lon": -47.465948}, {"lat": -23.507784, "lon": -47.462124}, {"lat": -23.510735, "lon": -47.462983}, {"lat": -23.515248, "lon": -47.464675}, {"lat": -23.495929, "lon": -47.459262}, {"lat": -23.495292, "lon": -47.459943}, {"lat": -23.49615, "lon": -47.464812}]}
    },
    "BRT_SUL_COMITRE": {
        "VEICULO_COM_001": {"sentido": "Centro", "coords": [{"lat": -23.522625, "lon": -47.464952}, {"lat": -23.519666, "lon": -47.464478}, {"lat": -23.51439, "lon": -47.465571}, {"lat": -23.510739, "lon": -47.46281}, {"lat": -23.507736, "lon": -47.462075}, {"lat": -23.506449, "lon": -47.463038}, {"lat": -23.504881, "lon": -47.463758}, {"lat": -23.503454, "lon": -47.466708}, {"lat": -23.497608, "lon": -47.468773}, {"lat": -23.495933, "lon": -47.459263}]},
        "VEICULO_COM_002": {"sentido": "Centro", "coords": [{"lat": -23.510739, "lon": -47.46281}, {"lat": -23.507736, "lon": -47.462075}, {"lat": -23.506449, "lon": -47.463038}, {"lat": -23.504881, "lon": -47.463758}, {"lat": -23.503454, "lon": -47.466708}, {"lat": -23.497608, "lon": -47.468773}, {"lat": -23.495933, "lon": -47.459263}, {"lat": -23.522625, "lon": -47.464952}, {"lat": -23.519666, "lon": -47.464478}, {"lat": -23.51439, "lon": -47.465571}]},
        "VEICULO_COM_003": {"sentido": "Bairro", "coords": [{"lat": -23.495948, "lon": -47.459262}, {"lat": -23.497295, "lon": -47.458245}, {"lat": -23.49899, "lon": -47.460316}, {"lat": -23.5013, "lon": -47.458777}, {"lat": -23.508116, "lon": -47.455771}, {"lat": -23.51179, "lon": -47.456325}, {"lat": -23.515851, "lon": -47.465812}, {"lat": -23.518653, "lon": -47.464396}, {"lat": -23.5198, "lon": -47.464637}, {"lat": -23.521065, "lon": -47.464949}]},
        "VEICULO_COM_004": {"sentido": "Bairro", "coords": [{"lat": -23.5013, "lon": -47.458777}, {"lat": -23.508116, "lon": -47.455771}, {"lat": -23.51179, "lon": -47.456325}, {"lat": -23.515851, "lon": -47.465812}, {"lat": -23.518653, "lon": -47.464396}, {"lat": -23.5198, "lon": -47.464637}, {"lat": -23.521065, "lon": -47.464949}, {"lat": -23.495948, "lon": -47.459262}, {"lat": -23.497295, "lon": -47.458245}, {"lat": -23.49899, "lon": -47.460316}]}
    }
}

cache_transito = {}

def consultar_transito_tomtom(lat, lon):
    chave_api = os.getenv("TOMTOM_API_KEY")
    if not chave_api or chave_api == "sua_chave_real_da_tomtom_aqui": return random.randint(35, 50), 0
    chave = f"{lat:.4f},{lon:.4f}"
    if chave in cache_transito: return cache_transito[chave]
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={chave_api}"
    try:
        resposta = requests.get(url, timeout=3)
        if resposta.status_code == 200:
            dados = resposta.json().get("flowSegmentData", {})
            vel_atual = dados.get("currentSpeed", 40)
            vel_livre = dados.get("freeFlowSpeed", 50)
            atraso = max(1, int((vel_livre - vel_atual) / 3)) if vel_atual < (vel_livre * 0.75) else 0
            cache_transito[chave] = (vel_atual, atraso)
            return vel_atual, atraso
    except: pass
    return random.randint(30, 45), 0

def rodar_simulador_background():
    time.sleep(5)
    passo_atual = 0
    while True:
        para_historico = []
        try:
            for nome_rota, veiculos in frotas_brt.items():
                for id_veiculo, dados_veiculo in veiculos.items():
                    ponto = dados_veiculo["coords"][passo_atual]
                    vel_real, atraso_real = consultar_transito_tomtom(ponto["lat"], ponto["lon"])
                    registro = {
                        "id_veiculo": id_veiculo,
                        "id_rota": nome_rota,
                        "latitude": ponto["lat"],
                        "longitude": ponto["lon"],
                        "sentido": dados_veiculo["sentido"],
                        "velocidade_atual_kmh": vel_real,
                        "atraso_previsto_minutos": atraso_real,
                        "acessibilidade_ativa": 1,
                        "lotacao": random.randint(15, 95),
                    }
                    if registrar_posicao(registro):
                        para_historico.append(linha_historico(registro))
        except Exception as e:
            print(f"Erro no Simulador Nuvem: {e}")

        # o banco é só histórico: se falhar, o mapa continua funcionando
        try:
            gravar_historico(para_historico)
        except Exception as e:
            print(f"⚠️ Histórico não gravado ({len(para_historico)} pontos): {e}")

        passo_atual = (passo_atual + 1) % 10
        time.sleep(8)

def preparar_banco():
    """Cria o índice por data, que deixa a limpeza e os gráficos rápidos."""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema = DATABASE() AND table_name = 'telemetria' "
                "AND index_name = 'idx_telemetria_data_hora'"
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute("CREATE INDEX idx_telemetria_data_hora ON telemetria (data_hora)")
                print("✅ Índice por data criado na telemetria.")
            cursor.close()
    except Exception as e:
        print(f"⚠️ Não foi possível criar o índice por data: {e}")

def limpar_dados_antigos():
    """Apaga o que passou de DIAS_RETENCAO dias, em lotes pequenos para não travar o banco."""
    lote = 5000
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        for tabela in ("telemetria", "reportes_comunidade"):
            total = 0
            while True:
                cursor.execute(
                    f"DELETE FROM {tabela} WHERE data_hora < NOW() - INTERVAL %s DAY LIMIT {lote}",
                    (DIAS_RETENCAO,),
                )
                conn.commit()
                total += cursor.rowcount
                if cursor.rowcount < lote:
                    break
                time.sleep(1)
            print(f"🧹 {tabela}: {total} registros com mais de {DIAS_RETENCAO} dias apagados.")
        cursor.close()

def rotina_limpeza_banco():
    """Prepara o banco e, a cada hora, apaga o que passou do prazo de retenção."""
    time.sleep(60)  # espera a API ligar completamente
    preparar_banco()
    while True:
        try:
            limpar_dados_antigos()
        except Exception as e:
            print(f"❌ Erro na rotina de limpeza: {e}")
        time.sleep(3600)

@app.on_event("startup")
def ligar_motores():
    print("🚀 Ligando Simulador Autônomo em Background...")
    thread_simulador = threading.Thread(target=rodar_simulador_background, daemon=True)
    thread_simulador.start()
    
    print("🧹 Ligando Rotina de Limpeza Automática do Banco...")
    thread_limpeza = threading.Thread(target=rotina_limpeza_banco, daemon=True)
    thread_limpeza.start()