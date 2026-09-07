# 🚍 SPFF | CCO Sorocaba - Mobilidade Urbana Inteligente (Gêmeo Digital)

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![MySQL](https://img.shields.io/badge/MySQL-005C84?style=for-the-badge&logo=mysql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Cloud Native](https://img.shields.io/badge/Cloud_Native-000000?style=for-the-badge&logo=icloud&logoColor=white)

Um Sistema de Centro de Controle Operacional (CCO) em nuvem desenvolvido para a rede BRT de Sorocaba/SP. O projeto atua como um **Gêmeo Digital (Digital Twin)**, simulando a recepção de dados de telemetria IoT de frotas em tempo real, aliando predição de tráfego por satélite (TomTom API), algoritmos geoespaciais, Business Intelligence (BI) e participação comunitária (Crowdsourcing).

---

## ✨ Funcionalidades em Destaque

### 📱 Progressive Web App (PWA) e Acessibilidade
* **Instalação Nativa:** O painel pode ser instalado como um aplicativo nativo diretamente na tela inicial de smartphones (Android/iOS).
* **Alarme de Proximidade (Geofencing):** Algoritmo que cruza o GPS do celular com o do ônibus e emite alertas quando o veículo entra no raio de 1km.
* **Web Speech API (TTS):** Síntese de voz em português que lê o status da via e do tráfego para deficientes visuais.

### 🚥 Tráfego e Semáforos Inteligentes (IoT)
* **Onda Verde:** Cruzamentos mapeados no frontend mudam de status dinamicamente. Se um ônibus BRT emitir alerta de atraso, o semáforo concede prioridade e abre o sinal (Onda Verde).
* **Previsão de Chegada (ETA):** Estações físicas utilizam a Fórmula de Haversine + dados da TomTom Traffic para calcular a distância do veículo mais próximo e exibir os minutos exatos de espera.
* **Tráfego por Satélite:** Integração real com a API da TomTom para comparar a velocidade de via livre com a velocidade atual, gerando alertas matemáticos de lentidão.

### 📊 Business Intelligence (BI) e Gestão
* **Dashboard Executivo:** Painel desenvolvido com `Recharts` que consome as médias matemáticas do banco de dados para gerar gráficos duplos em tempo real (Lotação vs. Velocidade) cobrindo uma janela dos últimos 15 minutos.
* **Heatmap (Waze do Ônibus):** Cidadãos enviam ocorrências geolocalizadas (lotação, falhas, acidentes), que são renderizadas para a Prefeitura como um Mapa de Calor da cidade.
* **Motor IoT Autônomo:** Simulador *multithreading* em background que forja dados reais de telemetria, lotação (em %) e coordenadas 24/7 na nuvem.

---

## 🛠️ Arquitetura Cloud-Native e Tecnologias

A arquitetura do projeto foi desenhada para altíssima disponibilidade e escalabilidade, seguindo padrões corporativos de Engenharia de Dados.

* **Frontend (Vercel):** React.js + Vite, React-Leaflet (Mapas interativos com ícones nativos Unicode para performance), Recharts (Gráficos), CSS Glassmorphism.
* **Backend (Render):** Python 3.11 com FastAPI, Uvicorn, Multithreading para simulação autônoma, Pydantic (validação estrita de dados).
* **Banco de Dados (Aiven Cloud):** MySQL. Gerenciado via `mysql-connector-python` com implementação avançada de **Connection Pooling** (mantém portas abertas, prevenindo *cold starts* e quedas de conexão).
* **Integrações Externas:** TomTom Traffic Flow API, Open-Meteo API, Cron-job.org (Keep-alive de infraestrutura).

---

## 🚀 Como rodar o projeto localmente

Como o sistema foi migrado para a nuvem, a configuração local agora exige o arquivo `.env` com as credenciais do banco e APIs externas.

### Pré-requisitos
* [Node.js](https://nodejs.org/) (Para o Frontend)
* [Python 3.8+](https://www.python.org/) (Para o Backend)
* Conta no [Aiven](https://aiven.io/) (Para o MySQL em nuvem) ou servidor MySQL local (XAMPP).
* Chave de API da [TomTom Developers](https://developer.tomtom.com/).

Desenvolvido como Projeto Integrador Universitário.