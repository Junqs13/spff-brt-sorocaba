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
    return {"mensagem": "API e Motor IoT rodando na Nuvem!"}

@app.post("/telemetria")
def receber_telemetria(dados: TelemetriaIn):
    try:
        # 🛡️ ESCUDO: Se um simulador antigo mandar 0, nós forçamos um valor real!
        if dados.lotacao == 0:
            dados.lotacao = random.randint(10, 100)

        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        sql = "INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa, lotacao) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
        cursor.execute(sql, (dados.id_veiculo, dados.id_rota, dados.latitude, dados.longitude, dados.sentido, dados.velocidade_atual_kmh, dados.atraso_previsto_minutos, dados.acessibilidade_ativa, dados.lotacao))
        conn.commit()
        cursor.close()
        return {"status": "Sucesso"}
    except Exception as erro: raise HTTPException(status_code=500, detail=str(erro))

@app.get("/veiculos/ativos/{id_rota}")
def obter_posicoes_da_rota(id_rota: str):
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        # ATENÇÃO AQUI: t1.lotacao foi adicionado no SELECT!
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
    except Exception as erro: raise HTTPException(status_code=500, detail=str(erro))

@app.get("/reportes")
def listar_reportes():
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT tipo_problema, latitude, longitude FROM reportes_comunidade WHERE latitude IS NOT NULL")
        ocorrencias = cursor.fetchall()
        cursor.close()
        return {"ocorrencias": ocorrencias}
    except Exception as erro: raise HTTPException(status_code=500, detail=str(erro))

@app.get("/analytics/desempenho")
def obter_desempenho():
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        # Busca a média de lotação por rota nos últimos 15 minutos
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
        
        # Deixa o nome da rota mais curto e bonito pro gráfico (ex: "BRT_NORTE_ITAVUVU" vira "ITAVUVU")
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
        "VEICULO_ITA_001": {"sentido": "Centro", "coords": [{"lat": -23.4800, "lon": -47.4691}, {"lat": -23.4780, "lon": -47.4705}, {"lat": -23.4760, "lon": -47.4720}]},
        "VEICULO_ITA_002": {"sentido": "Centro", "coords": [{"lat": -23.4735, "lon": -47.4737}, {"lat": -23.4710, "lon": -47.4750}, {"lat": -23.4680, "lon": -47.4765}]},
        "VEICULO_ITA_003": {"sentido": "Bairro", "coords": [{"lat": -23.4610, "lon": -47.4810}, {"lat": -23.4630, "lon": -47.4795}, {"lat": -23.4651, "lon": -47.4782}]},
        "VEICULO_ITA_004": {"sentido": "Bairro", "coords": [{"lat": -23.4542, "lon": -47.4845}, {"lat": -23.4560, "lon": -47.4820}, {"lat": -23.4580, "lon": -47.4800}]}
    },
    "BRT_NORTE_IPANEMA": {
        "VEICULO_IPA_001": {"sentido": "Centro", "coords": [{"lat": -23.4842, "lon": -47.4715}, {"lat": -23.4810, "lon": -47.4745}, {"lat": -23.4780, "lon": -47.4780}]},
        "VEICULO_IPA_002": {"sentido": "Centro", "coords": [{"lat": -23.4750, "lon": -47.4815}, {"lat": -23.4720, "lon": -47.4845}, {"lat": -23.4690, "lon": -47.4875}]},
        "VEICULO_IPA_003": {"sentido": "Bairro", "coords": [{"lat": -23.4600, "lon": -47.4935}, {"lat": -23.4630, "lon": -47.4915}, {"lat": -23.4650, "lon": -47.4895}]},
        "VEICULO_IPA_004": {"sentido": "Bairro", "coords": [{"lat": -23.4550, "lon": -47.4980}, {"lat": -23.4570, "lon": -47.4960}, {"lat": -23.4590, "lon": -47.4940}]}
    },
    "BRT_OESTE_GEN_CARNEIRO": {
        "VEICULO_GCA_001": {"sentido": "Centro", "coords": [{"lat": -23.5065, "lon": -47.4665}, {"lat": -23.5075, "lon": -47.4690}, {"lat": -23.5085, "lon": -47.4710}]},
        "VEICULO_GCA_002": {"sentido": "Centro", "coords": [{"lat": -23.5098, "lon": -47.4735}, {"lat": -23.5105, "lon": -47.4760}, {"lat": -23.5115, "lon": -47.4785}]},
        "VEICULO_GCA_003": {"sentido": "Bairro", "coords": [{"lat": -23.5130, "lon": -47.4815}, {"lat": -23.5120, "lon": -47.4795}, {"lat": -23.5110, "lon": -47.4775}]},
        "VEICULO_GCA_004": {"sentido": "Bairro", "coords": [{"lat": -23.5160, "lon": -47.4870}, {"lat": -23.5150, "lon": -47.4850}, {"lat": -23.5140, "lon": -47.4830}]}
    },
    "BRT_OESTE_PANNUNZIO": {
        "VEICULO_PAN_001": {"sentido": "Centro", "coords": [{"lat": -23.5186, "lon": -47.4855}, {"lat": -23.5200, "lon": -47.4870}, {"lat": -23.5215, "lon": -47.4890}]},
        "VEICULO_PAN_002": {"sentido": "Centro", "coords": [{"lat": -23.5236, "lon": -47.4915}, {"lat": -23.5250, "lon": -47.4930}, {"lat": -23.5265, "lon": -47.4950}]},
        "VEICULO_PAN_003": {"sentido": "Bairro", "coords": [{"lat": -23.5300, "lon": -47.5000}, {"lat": -23.5285, "lon": -47.4980}, {"lat": -23.5270, "lon": -47.4960}]},
        "VEICULO_PAN_004": {"sentido": "Bairro", "coords": [{"lat": -23.5345, "lon": -47.5065}, {"lat": -23.5330, "lon": -47.5045}, {"lat": -23.5315, "lon": -47.5025}]}
    },
    "BRT_LESTE_SAO_PAULO": {
        "VEICULO_SPA_001": {"sentido": "Centro", "coords": [{"lat": -23.5028, "lon": -47.4475}, {"lat": -23.5030, "lon": -47.4450}, {"lat": -23.5032, "lon": -47.4420}]},
        "VEICULO_SPA_002": {"sentido": "Centro", "coords": [{"lat": -23.5036, "lon": -47.4385}, {"lat": -23.5045, "lon": -47.4350}, {"lat": -23.5056, "lon": -47.4310}]},
        "VEICULO_SPA_003": {"sentido": "Bairro", "coords": [{"lat": -23.5065, "lon": -47.4250}, {"lat": -23.5055, "lon": -47.4280}, {"lat": -23.5045, "lon": -47.4320}]},
        "VEICULO_SPA_004": {"sentido": "Bairro", "coords": [{"lat": -23.5080, "lon": -47.4180}, {"lat": -23.5075, "lon": -47.4210}, {"lat": -23.5070, "lon": -47.4230}]}
    },
    "BRT_SUL_WASH_LUIS": {
        "VEICULO_WSL_001": {"sentido": "Centro", "coords": [{"lat": -23.5100, "lon": -47.4600}, {"lat": -23.5125, "lon": -47.4602}, {"lat": -23.5150, "lon": -47.4605}]},
        "VEICULO_WSL_002": {"sentido": "Centro", "coords": [{"lat": -23.5175, "lon": -47.4607}, {"lat": -23.5190, "lon": -47.4609}, {"lat": -23.5205, "lon": -47.4612}]},
        "VEICULO_WSL_003": {"sentido": "Bairro", "coords": [{"lat": -23.5250, "lon": -47.4620}, {"lat": -23.5235, "lon": -47.4617}, {"lat": -23.5220, "lon": -47.4615}]},
        "VEICULO_WSL_004": {"sentido": "Bairro", "coords": [{"lat": -23.5300, "lon": -47.4628}, {"lat": -23.5285, "lon": -47.4625}, {"lat": -23.5265, "lon": -47.4622}]}
    },
    "BRT_SUL_COMITRE": {
        "VEICULO_COM_001": {"sentido": "Centro", "coords": [{"lat": -23.5282, "lon": -47.4619}, {"lat": -23.5300, "lon": -47.4630}, {"lat": -23.5320, "lon": -47.4640}]},
        "VEICULO_COM_002": {"sentido": "Centro", "coords": [{"lat": -23.5340, "lon": -47.4650}, {"lat": -23.5360, "lon": -47.4665}, {"lat": -23.5382, "lon": -47.4679}]},
        "VEICULO_COM_003": {"sentido": "Bairro", "coords": [{"lat": -23.5420, "lon": -47.4695}, {"lat": -23.5400, "lon": -47.4685}, {"lat": -23.5380, "lon": -47.4675}]},
        "VEICULO_COM_004": {"sentido": "Bairro", "coords": [{"lat": -23.5470, "lon": -47.4720}, {"lat": -23.5450, "lon": -47.4710}, {"lat": -23.5430, "lon": -47.4700}]}
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
    time.sleep(5) # Espera a API ligar
    passo_atual = 0
    while True:
        try:
            conn = db_manager.get_mysql_connection()
            cursor = conn.cursor()
            for nome_rota, veiculos in frotas_brt.items():
                for id_veiculo, dados_veiculo in veiculos.items():
                    ponto = dados_veiculo["coords"][passo_atual]
                    vel_real, atraso_real = consultar_transito_tomtom(ponto["lat"], ponto["lon"])
                    lotacao_simulada = random.randint(10, 100) # Sorteia a lotação de 10% a 100%
                    sql = "INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa, lotacao) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
                    cursor.execute(sql, (id_veiculo, nome_rota, ponto["lat"], ponto["lon"], dados_veiculo["sentido"], vel_real, atraso_real, 1, lotacao_simulada))
            conn.commit()
            cursor.close()
            conn.close()
            
            passo_atual = (passo_atual + 1) % 3 # Fica rodando nas coordenadas infinitamente
            time.sleep(8) # Aguarda 8s para o próximo passo
        except Exception as e:
            print(f"Erro no Simulador Nuvem: {e}")
            time.sleep(10)

# O "gatilho" que liga o motor quando a API sobe no Render
@app.on_event("startup")
def ligar_motores():
    print("🚀 Ligando Simulador Autônomo em Background...")
    thread = threading.Thread(target=rodar_simulador_background, daemon=True)
    thread.start()