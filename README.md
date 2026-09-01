# 🚍 SPFF | CCO Sorocaba - Mobilidade Urbana Inteligente

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![MySQL](https://img.shields.io/badge/MySQL-005C84?style=for-the-badge&logo=mysql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

Um Sistema de Centro de Controle Operacional (CCO) completo desenvolvido para a rede BRT de Sorocaba/SP. O projeto simula a recepção de dados de telemetria IoT de frotas em tempo real, aliando predição de tráfego por Inteligência Artificial, acessibilidade e participação comunitária (Crowdsourcing).

## ✨ Funcionalidades em Destaque

### 📡 Rastreamento de Frotas e IoT
* **Múltiplos Veículos (Real-time):** Monitoramento simultâneo de frotas espalhadas pelos corredores BRT (Norte, Sul, Leste, Oeste).
* **Cálculo de Distância:** Algoritmo de Haversine integrado para calcular a distância exata em metros entre o usuário e o veículo mais próximo.

### 🧠 Inteligência Artificial e Dados
* **Predição de Fluxo:** IA que analisa os dados da via e alerta sobre lentidão ou atrasos previstos na rota.
* **Dashboard Municipal (Heatmap):** Visão de gestão tática que substitui a frota por um Mapa de Calor de ocorrências, permitindo ao poder público visualizar gargalos da cidade.

### ♿ Acessibilidade e UX/UI (Glassmorphism)
* **Interface Dark Mode:** Mapa em alto contraste com elementos flutuantes translúcidos e marcadores em neon.
* **Web Speech API (TTS):** Síntese de voz em português que lê o status da via para deficientes visuais.
* **Alarme de Proximidade:** "Despertador" inteligente que emite alertas visuais e sonoros quando o ônibus entra no raio de 1km do passageiro.
* **Indicadores Visuais:** Monitoramento do nível de lotação (0 a 100%) e status operacional da plataforma elevatória para cadeirantes.

### 🤝 Crowdsourcing (Comunidade)
* **Reporte Waze-style:** Usuários podem reportar problemas reais da via (lotação máxima, ar-condicionado quebrado, acidentes), alimentando o banco de dados e o mapa de calor em tempo real.

---

## 🛠️ Arquitetura e Tecnologias

* **Frontend:** React (Vite), React-Leaflet (Mapas interativos), CSS nativo (Design responsivo e Media Queries).
* **Backend:** Python com FastAPI (Alta performance, rotas assíncronas), Uvicorn.
* **Banco de Dados:** MySQL (Arquitetura relacional para telemetria e reportes).
* **APIs Externas:** Open-Meteo (Clima em tempo real), HTML5 Geolocation API.
* **Simulador:** Script Python desenvolvido sob medida para simular envio massivo de requisições POST HTTP de dispositivos IoT embarcados nos veículos.

---

## 🚀 Como rodar o projeto localmente

### Pré-requisitos
* [XAMPP](https://www.apachefriends.org/) (Apache e MySQL)
* [Python 3.8+](https://www.python.org/)
* [Node.js](https://nodejs.org/)

### 1. Banco de Dados
1. Inicie o Apache e o MySQL pelo painel do XAMPP.
2. Crie um banco de dados chamado `spff_brt`.
3. As tabelas `telemetria` e `reportes_comunidade` serão gerenciadas pelo backend.

### 2. Backend (API)
Abra um terminal na pasta do backend/raiz do projeto: