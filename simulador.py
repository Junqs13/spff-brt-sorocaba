import time
import requests
import random

URL_API = "https://api-cco-sorocaba.onrender.com/telemetria"
TOMTOM_API_KEY = "LYWb0mBk1hukhsQVafDKAIYV7VJoMjv9" # <--- SUA CHAVE AQUI

cache_transito = {}

# FROTA CONFIGURADA: 4 ônibus por via (2 Sentido Centro, 2 Sentido Bairro)
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

def consultar_transito_tomtom(lat, lon):
    if TOMTOM_API_KEY == "LYWb0mBk1hukhsQVafDKAIYV7VJoMjv9": return random.randint(35, 50), 0
    chave = f"{lat:.4f},{lon:.4f}"
    if chave in cache_transito: return cache_transito[chave]
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={TOMTOM_API_KEY}"
    try:
        resposta = requests.get(url, timeout=3)
        if resposta.status_code == 200:
            dados = resposta.json()["flowSegmentData"]
            vel_atual = dados.get("currentSpeed", 40)
            vel_livre = dados.get("freeFlowSpeed", 50)
            atraso = max(1, int((vel_livre - vel_atual) / 3)) if vel_atual < (vel_livre * 0.75) else 0
            cache_transito[chave] = (vel_atual, atraso)
            return vel_atual, atraso
    except Exception: pass
    return random.randint(30, 45), 0

def iniciar_simulacao():
    print("Iniciando Gêmeo Digital com 4 Veículos por Rota e Direção...")
    while True:
        for passo in range(3):
            print(f"--- ATUALIZAÇÃO GPS (Passo {passo + 1}) ---")
            for nome_rota, veiculos in frotas_brt.items():
                for id_veiculo, dados_veiculo in veiculos.items():
                    ponto = dados_veiculo["coords"][passo]
                    vel_real, atraso_real = consultar_transito_tomtom(ponto["lat"], ponto["lon"])
                    
                    payload = {
                        "id_veiculo": id_veiculo,
                        "id_rota": nome_rota,
                        "latitude": ponto["lat"],
                        "longitude": ponto["lon"],
                        "sentido": dados_veiculo["sentido"],
                        "velocidade_atual_kmh": vel_real,
                        "atraso_previsto_minutos": atraso_real,
                        "acessibilidade_ativa": random.choices([1, 0], weights=[90, 10])[0]
                    }
                    try: requests.post(URL_API, json=payload)
                    except Exception: pass
            print("Dados enviados...")
            time.sleep(8)

if __name__ == "__main__":
    iniciar_simulacao()