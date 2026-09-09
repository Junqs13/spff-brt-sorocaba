import os
import time
import random
import requests
import threading
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
        # Força uma consulta inútil apenas para manter a conexão do Aiven viva
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchall()
        cursor.close()
        return {"status": "Online", "mensagem": "API (Render) e Banco (Aiven) 100% Acordados!"}
    except Exception as erro:
        # Se o banco dormiu, a API tenta religar
        return {"status": "Recuperando", "mensagem": f"Reconectando ao Aiven: {str(erro)}"}

@app.post("/telemetria")
def receber_telemetria(dados: TelemetriaIn):
    try:
        # 🛡️ ESCUDO: Força a lotação caso um simulador antigo do PC envie 0
        if dados.lotacao == 0:
            dados.lotacao = random.randint(15, 95)

        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        sql = "INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa, lotacao) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.execute(sql, (dados.id_veiculo, dados.id_rota, dados.latitude, dados.longitude, dados.sentido, dados.velocidade_atual_kmh, dados.atraso_previsto_minutos, dados.acessibilidade_ativa, dados.lotacao))
        conn.commit()
        cursor.close()
        return {"status": "Sucesso"}
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

@app.get("/veiculos/ativos/{id_rota}")
def obter_posicoes_da_rota(id_rota: str):
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        # O t1.lotacao garante que o React receba os dados
        sql = """
            SELECT t1.id_veiculo, t1.id_rota, t1.latitude, t1.longitude, t1.sentido, t1.velocidade_atual_kmh, t1.atraso_previsto_minutos, t1.acessibilidade_ativa, t1.lotacao, t1.data_hora
            FROM telemetria t1
            INNER JOIN (SELECT id_veiculo, MAX(id) as max_id FROM telemetria WHERE id_rota = %s AND data_hora >= NOW() - INTERVAL 5 MINUTE GROUP BY id_veiculo) t2 
            ON t1.id_veiculo = t2.id_veiculo AND t1.id = t2.max_id;
        """
        cursor.execute(sql, (id_rota,))
        veiculos = cursor.fetchall() 
        cursor.close()
        return {"frota": veiculos} if veiculos else {"frota": []}
    except Exception as erro: 
        raise HTTPException(status_code=500, detail=str(erro))

class ReporteIn(BaseModel):
    id_rota: str
    tipo_problema: str
    latitude: float
    longitude: float
    comentario: str = None

@app.post("/reportes")
def criar_reporte(dados: ReporteIn):
    try:
        conn = db_manager.get_mysql_connection()
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
        conn = db_manager.get_mysql_connection()
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
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        # Média de Lotação e Velocidade para o Gráfico de BI
        sql = """
            SELECT 
                id_rota, 
                ROUND(AVG(velocidade_atual_kmh), 1) as vel_media, 
                ROUND(AVG(lotacao), 1) as lotacao_media
            FROM telemetria 
            WHERE data_hora >= NOW() - INTERVAL 15 MINUTE
            GROUP BY id_rota;
        """
        cursor.execute(sql)
        dados = cursor.fetchall()
        cursor.close()
        
        for d in dados:
            d["nome_amigavel"] = d["id_rota"].split("_")[-1]
            
        return {"analytics": dados}
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
        try:
            conn = db_manager.get_mysql_connection()
            cursor = conn.cursor()
            for nome_rota, veiculos in frotas_brt.items():
                for id_veiculo, dados_veiculo in veiculos.items():
                    ponto = dados_veiculo["coords"][passo_atual]
                    vel_real, atraso_real = consultar_transito_tomtom(ponto["lat"], ponto["lon"])
                    
                    # 🛡️ Sorteio robusto de lotação no motor da nuvem
                    lotacao_simulada = random.randint(15, 95) 
                    
                    sql = "INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa, lotacao) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
                    cursor.execute(sql, (id_veiculo, nome_rota, ponto["lat"], ponto["lon"], dados_veiculo["sentido"], vel_real, atraso_real, 1, lotacao_simulada))
            conn.commit()
            cursor.close()
            conn.close()
            
            passo_atual = (passo_atual + 1) % 10 
            time.sleep(8) 
        except Exception as e:
            print(f"Erro no Simulador Nuvem: {e}")
            time.sleep(10)

@app.on_event("startup")
def ligar_motores():
    print("🚀 Ligando Simulador Autônomo em Background...")
    thread = threading.Thread(target=rodar_simulador_background, daemon=True)
    thread.start()