import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

print("1. Gerando base de dados histórica simulada...")
# Vamos criar 1000 registros fictícios de viagens
np.random.seed(42)

# Simulando a velocidade de via livre sempre perto de 50km/h
vel_via_livre = np.random.normal(50, 2, 1000)

# Simulando o trânsito atual (pode fluir bem ou ter engarrafamento)
vel_atual = np.random.uniform(5, 55, 1000)

# A Lógica do Atraso (O que o modelo vai ter que descobrir sozinho):
# Se a velocidade atual é muito menor que a via livre, o atraso aumenta.
atraso_minutos = (vel_via_livre - vel_atual) * 0.3 
# Tira atrasos negativos (adiantamentos)
atraso_minutos = np.where(atraso_minutos < 0, 0, atraso_minutos) 
# Adiciona um "ruído" aleatório porque no mundo real nada é exato
atraso_minutos += np.random.normal(0, 1, 1000)
atraso_minutos = np.where(atraso_minutos < 0, 0, atraso_minutos)

# Cria a tabela de dados (Dataframe)
df = pd.DataFrame({
    'velocidade_via_livre': vel_via_livre,
    'velocidade_atual': vel_atual,
    'atraso_minutos': atraso_minutos
})

print("2. Separando dados de treino e teste...")
# O que o modelo usa para prever (X) e o que ele quer adivinhar (y)
X = df[['velocidade_via_livre', 'velocidade_atual']]
y = df['atraso_minutos']

# Separa 80% dos dados para treinar e 20% para fazer a prova final
X_treino, X_teste, y_treino, y_teste = train_test_split(X, y, test_size=0.2, random_state=42)

print("3. Treinando o modelo XGBoost (Inteligência Artificial)...")
modelo = xgb.XGBRegressor(objective='reg:squarederror', n_estimators=100, learning_rate=0.1)
modelo.fit(X_treino, y_treino)

print("4. Avaliando o modelo...")
previsoes = modelo.predict(X_teste)
erro_medio = mean_absolute_error(y_teste, previsoes)
print(f"-> A margem de erro do nosso modelo é de apenas {erro_medio:.2f} minutos!")

print("5. Salvando o cérebro da IA no disco...")
joblib.dump(modelo, 'modelo_preditivo.pkl')
print("Modelo salvo como 'modelo_preditivo.pkl'. Pronto para uso na API!")