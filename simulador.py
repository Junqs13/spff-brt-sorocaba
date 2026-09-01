import time
import requests

URL_API = "http://127.0.0.1:8000/telemetria"

# TODAS AS ROTAS RESTAURADAS COM FROTAS (MÚLTIPLOS VEÍCULOS)
frotas_brt = {
    "BRT_NORTE_ITAVUVU": {
        "VEICULO_ITA_001": [{"lat": -23.4542, "lon": -47.4845}, {"lat": -23.4560, "lon": -47.4820}, {"lat": -23.4580, "lon": -47.4800}],
        "VEICULO_ITA_002": [{"lat": -23.4611, "lon": -47.4796}, {"lat": -23.4630, "lon": -47.4770}, {"lat": -23.4650, "lon": -47.4760}],
        "VEICULO_ITA_003": [{"lat": -23.4682, "lon": -47.4751}, {"lat": -23.4700, "lon": -47.4730}, {"lat": -23.4720, "lon": -47.4710}]
    },
    "BRT_NORTE_IPANEMA": {
        "VEICULO_IPA_001": [{"lat": -23.4630, "lon": -47.4915}, {"lat": -23.4650, "lon": -47.4895}, {"lat": -23.4670, "lon": -47.4875}],
        "VEICULO_IPA_002": [{"lat": -23.4705, "lon": -47.4855}, {"lat": -23.4725, "lon": -47.4835}, {"lat": -23.4745, "lon": -47.4815}]
    },
    "BRT_OESTE_GEN_CARNEIRO": {
        "VEICULO_GCA_001": [{"lat": -23.5065, "lon": -47.4725}, {"lat": -23.5055, "lon": -47.4700}, {"lat": -23.5045, "lon": -47.4670}],
        "VEICULO_GCA_002": [{"lat": -23.5045, "lon": -47.4655}, {"lat": -23.5035, "lon": -47.4625}, {"lat": -23.5025, "lon": -47.4600}]
    },
    "BRT_OESTE_PANNUNZIO": {
        "VEICULO_PAN_001": [{"lat": -23.5230, "lon": -47.4925}, {"lat": -23.5215, "lon": -47.4905}, {"lat": -23.5200, "lon": -47.4885}],
        "VEICULO_PAN_002": [{"lat": -23.5185, "lon": -47.4865}, {"lat": -23.5170, "lon": -47.4845}, {"lat": -23.5155, "lon": -47.4825}]
    },
    "BRT_LESTE_SAO_PAULO": {
        "VEICULO_SPA_001": [{"lat": -23.5015, "lon": -47.4395}, {"lat": -23.5025, "lon": -47.4365}, {"lat": -23.5035, "lon": -47.4335}],
        "VEICULO_SPA_002": [{"lat": -23.5035, "lon": -47.4325}, {"lat": -23.5045, "lon": -47.4295}, {"lat": -23.5055, "lon": -47.4265}]
    },
    "BRT_SUL_WASH_LUIS": {
        "VEICULO_WSL_001": [{"lat": -23.5175, "lon": -47.4600}, {"lat": -23.5190, "lon": -47.4590}, {"lat": -23.5200, "lon": -47.4580}],
        "VEICULO_WSL_002": [{"lat": -23.5215, "lon": -47.4585}, {"lat": -23.5230, "lon": -47.4575}, {"lat": -23.5245, "lon": -47.4565}]
    },
    "BRT_SUL_COMITRE": {
        "VEICULO_COM_001": [{"lat": -23.5355, "lon": -47.4625}, {"lat": -23.5375, "lon": -47.4635}, {"lat": -23.5395, "lon": -47.4645}],
        "VEICULO_COM_002": [{"lat": -23.5395, "lon": -47.4650}, {"lat": -23.5415, "lon": -47.4660}, {"lat": -23.5435, "lon": -47.4670}]
    }
}

def iniciar_simulacao():
    print("Iniciando simulador de FROTAS COMPLETAS para TODAS as 7 rotas do BRT Sorocaba...")
    
    for passo in range(3):
        print(f"--- PASSO DE TEMPO {passo + 1} ---")
        
        for nome_rota, veiculos in frotas_brt.items():
            for id_veiculo, coordenadas in veiculos.items():
                ponto = coordenadas[passo]
                
                payload = {
                    "id_veiculo": id_veiculo,
                    "id_rota": nome_rota,
                    "latitude": ponto["lat"],
                    "longitude": ponto["lon"]
                }
                
                try:
                    requests.post(URL_API, json=payload)
                    print(f"[{nome_rota}] {id_veiculo} - Enviado")
                except Exception as e:
                    print(f"Erro ao conectar com a API: {e}")
        
        time.sleep(5)
        
    print("Simulação concluída!")

if __name__ == "__main__":
    iniciar_simulacao()