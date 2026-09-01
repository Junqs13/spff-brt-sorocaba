import os
import requests
import joblib # NOVA IMPORTAÇÃO para ler o modelo de IA
import pandas as pd # NOVA IMPORTAÇÃO para preparar os dados para a IA
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import db_manager

app = FastAPI(title="API Mobilidade Urbana (MySQL)", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. CARREGANDO A INTELIGÊNCIA ARTIFICIAL NA MEMÓRIA
try:
    # Carrega o arquivo que criamos no passo anterior
    modelo_ia = joblib.load('modelo_preditivo.pkl')
    print("Modelo de IA carregado com sucesso!")
except Exception as e:
    print(f"Aviso: Não foi possível carregar o modelo de IA. Erro: {e}")
    modelo_ia = None

class TelemetriaIn(BaseModel):
    id_veiculo: str
    id_rota: str
    latitude: float
    longitude: float

@app.get("/")
def rota_principal():
    return {"mensagem": "API rodando e conectada ao MySQL!"}

@app.post("/telemetria")
def receber_telemetria(dados: TelemetriaIn):
    tomtom_key = os.getenv("TOMTOM_API_KEY")
    velocidade_atual = 0
    velocidade_via_livre = 0
    
    # Faz requisição para a TomTom
    if tomtom_key and tomtom_key != "sua_chave_tomtom_aqui":
        url_tomtom = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={dados.latitude},{dados.longitude}&key={tomtom_key}"
        try:
            resposta = requests.get(url_tomtom)
            if resposta.status_code == 200:
                dados_transito = resposta.json()
                flow = dados_transito.get("flowSegmentData", {})
                velocidade_atual = flow.get("currentSpeed", 0)
                velocidade_via_livre = flow.get("freeFlowSpeed", 0)
        except Exception as e:
            print(f"Erro ao consultar TomTom: {e}")

    # 2. PREVISÃO DE ATRASO (MACHINE LEARNING)
    previsao_atraso = 0
    if modelo_ia is not None and velocidade_via_livre > 0:
        # Prepara os dados do mesmo jeito que a IA foi treinada
        dados_para_previsao = pd.DataFrame({
            'velocidade_via_livre': [velocidade_via_livre],
            'velocidade_atual': [velocidade_atual]
        })
        
        # Pede para a IA adivinhar o atraso
        previsao_array = modelo_ia.predict(dados_para_previsao)
        # Como a IA devolve uma lista de resultados, pegamos o primeiro [0]
        # Usamos round() para deixar o número bonitinho (ex: 2.3 vira 2)
        previsao_atraso = round(float(previsao_array[0]))

    # Salva no MySQL
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        
        # Alteramos o SQL para inserir o atraso também!
        sql = """
            INSERT INTO telemetria (id_veiculo, id_rota, latitude, longitude, velocidade_atual_kmh, velocidade_via_livre_kmh, atraso_previsto_minutos)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        valores = (dados.id_veiculo, dados.id_rota, dados.latitude, dados.longitude, velocidade_atual, velocidade_via_livre, previsao_atraso)
        
        cursor.execute(sql, valores)
        conn.commit()
        cursor.close()
        
        return {
            "status": "Sucesso", 
            "mensagem": "Telemetria e previsão salvas!",
            "atraso_minutos": previsao_atraso
        }
    except Exception as erro:
        raise HTTPException(status_code=500, detail=f"Erro no banco MySQL: {erro}")


@app.get("/veiculos/ativos/{id_rota}")
def obter_posicoes_da_rota(id_rota: str):
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Consulta SQL avançada: Busca a ÚLTIMA leitura (id máximo) para CADA id_veiculo dentro da rota selecionada.
        sql = """
            SELECT t1.id_veiculo, t1.id_rota, t1.latitude, t1.longitude, t1.velocidade_atual_kmh, t1.atraso_previsto_minutos, t1.acessibilidade_ativa, t1.data_hora
            FROM telemetria t1
            INNER JOIN (
                SELECT id_veiculo, MAX(id) as max_id
                FROM telemetria
                WHERE id_rota = %s
                GROUP BY id_veiculo
            ) t2 ON t1.id_veiculo = t2.id_veiculo AND t1.id = t2.max_id;
        """
        
        cursor.execute(sql, (id_rota,))
        # Usamos fetchall() ao invés de fetchone() porque agora retorna uma LISTA de ônibus
        veiculos = cursor.fetchall() 
        cursor.close()
        
        if veiculos:
            # Retorna a lista de veículos
            return {"frota": veiculos} 
        else:
            return {"mensagem": f"Nenhum veículo operando na rota {id_rota} no momento", "frota": []}
            
    except Exception as erro:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar frota no MySQL: {erro}")

class ReporteIn(BaseModel):
    id_rota: str
    tipo_problema: str
    comentario: str = None

@app.post("/reportes")
def criar_reporte(dados: ReporteIn):
    try:
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()
        
        sql = """
            INSERT INTO reportes_comunidade (id_rota, tipo_problema, comentario)
            VALUES (%s, %s, %s)
        """
        valores = (dados.id_rota, dados.tipo_problema, dados.comentario)
        
        cursor.execute(sql, valores)
        conn.commit()
        cursor.close()
        
        return {"status": "Sucesso", "mensagem": "Alerta da comunidade registrado com sucesso!"}
    except Exception as erro:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar reporte no MySQL: {erro}")