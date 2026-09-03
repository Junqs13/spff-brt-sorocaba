import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import db_manager

# 🔒 Carrega as senhas e chaves do arquivo .env
load_dotenv()

app = FastAPI(title="API Mobilidade Urbana (MySQL)", version="1.0")

# 🔒 SEGURANÇA CORS: Permite apenas o localhost (React) e, no futuro, o link da Vercel
ORIGENS_PERMITIDAS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # "https://seu-projeto.vercel.app" <- Descomentaremos no deploy final
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENS_PERMITIDAS,
    allow_credentials=True,
    allow_methods=["GET", "POST"], # 🔒 Bloqueia DELETE e PUT não autorizados
    allow_headers=["*"],
)

class TelemetriaIn(BaseModel):
    id_veiculo: str
    id_rota: str
    latitude: float
    longitude: float
    sentido: str = "Centro"
    velocidade_atual_kmh: int = 40
    atraso_previsto_minutos: int = 0
    acessibilidade_ativa: int = 1

@app.get("/")
def rota_principal():
    return {"mensagem": "API rodando e conectada ao MySQL!"}

@app.post("/telemetria")
def receber_telemetria(dados: TelemetriaIn):
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        sql = """
            INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, sentido, velocidade_atual_kmh, atraso_previsto_minutos, acessibilidade_ativa)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        valores = (dados.id_veiculo, dados.id_rota, dados.latitude, dados.longitude, dados.sentido, dados.velocidade_atual_kmh, dados.atraso_previsto_minutos, dados.acessibilidade_ativa)
        cursor.execute(sql, valores)
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
        
        # FILTRO ANTI-FANTASMA: Apenas veículos que comunicaram nos últimos 5 minutos
        sql = """
            SELECT t1.id_veiculo, t1.id_rota, t1.latitude, t1.longitude, t1.sentido, t1.velocidade_atual_kmh, t1.atraso_previsto_minutos, t1.acessibilidade_ativa, t1.data_hora
            FROM telemetria t1
            INNER JOIN (
                SELECT id_veiculo, MAX(id) as max_id
                FROM telemetria
                WHERE id_rota = %s AND data_hora >= NOW() - INTERVAL 5 MINUTE
                GROUP BY id_veiculo
            ) t2 ON t1.id_veiculo = t2.id_veiculo AND t1.id = t2.max_id;
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