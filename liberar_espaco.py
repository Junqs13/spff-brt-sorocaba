"""
LIBERAR ESPAÇO NO AIVEN (rodar no seu computador)

Quando o disco do Aiven passa de 97%, o MySQL entra em modo somente leitura.
Apagar linhas com DELETE não devolve espaço ao disco no InnoDB, e criar uma
tabela nova precisa de espaço livre que não existe. Por isso este script:

  1. LÊ do banco (leitura funciona mesmo com o disco cheio) só os últimos
     DIAS_RETENCAO dias, com um ponto a cada 2 minutos por ônibus, e salva
     uma cópia num arquivo CSV nesta pasta;
  2. libera a gravação no Aiven por uns 15 minutos e espera ela valer;
  3. esvazia a tabela telemetria com TRUNCATE, o que devolve o disco na hora;
  4. grava de volta a amostra salva.

Se algo der errado depois do passo 3, a amostra continua no CSV e pode ser
gravada de novo com:
  python liberar_espaco.py --restaurar telemetria_amostra_AAAAMMDD_HHMMSS.csv

Os reportes da comunidade não são tocados.

Precisa no .env (além dos dados do banco):
  AIVEN_TOKEN=...      (Aiven Console > User information > Tokens > Generate token)
  AIVEN_PROJETO=...    (nome do projeto no Aiven)
  AIVEN_SERVICO=...    (nome do serviço MySQL)
"""
import csv
import os
import sys
import time
from datetime import datetime

import requests
from dotenv import load_dotenv
from database import db_manager

load_dotenv()

DIAS_RETENCAO = int(os.getenv("DIAS_RETENCAO", "7"))
AMOSTRA_SEGUNDOS = int(os.getenv("HISTORICO_A_CADA_SEGUNDOS", "120"))
COLUNAS = [
    "id_veiculo", "id_rota", "latitude", "longitude", "sentido",
    "velocidade_atual_kmh", "atraso_previsto_minutos", "acessibilidade_ativa",
    "lotacao", "data_hora",
]


def liberar_gravacao_no_aiven() -> bool:
    token = os.getenv("AIVEN_TOKEN")
    projeto = os.getenv("AIVEN_PROJETO")
    servico = os.getenv("AIVEN_SERVICO")
    if not (token and projeto and servico):
        print("Faltam AIVEN_TOKEN, AIVEN_PROJETO ou AIVEN_SERVICO no .env.")
        return False
    url = f"https://api.aiven.io/v1/project/{projeto}/service/{servico}/enable-writes"
    resposta = requests.post(url, headers={"Authorization": f"aivenv1 {token}"}, timeout=30)
    print(f"Aiven respondeu {resposta.status_code}: {resposta.text[:200]}")
    return resposta.ok


def somente_leitura() -> bool:
    # conexão nova a cada consulta, para ver o valor atual do servidor
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT @@GLOBAL.read_only")
        valor = cursor.fetchone()[0]
        cursor.close()
    return int(valor) == 1


def garantir_gravacao() -> bool:
    if not somente_leitura():
        return True
    print("O banco está em modo somente leitura (disco cheio).")
    if not liberar_gravacao_no_aiven():
        return False
    print("Esperando a liberação valer no servidor", end="", flush=True)
    for _ in range(36):  # até 3 minutos
        time.sleep(5)
        print(".", end="", flush=True)
        if not somente_leitura():
            print(" liberado.")
            return True
    print("\nO Aiven ainda não liberou a gravação. Espere alguns minutos e rode de novo.")
    return False


def ler_amostra():
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT {", ".join("t." + c for c in COLUNAS)}
            FROM telemetria t
            JOIN (
                SELECT MIN(id) AS id FROM telemetria
                WHERE data_hora >= NOW() - INTERVAL %s DAY
                GROUP BY id_veiculo, FLOOR(UNIX_TIMESTAMP(data_hora) / %s)
            ) amostra ON amostra.id = t.id
            ORDER BY t.id
            """,
            (DIAS_RETENCAO, AMOSTRA_SEGUNDOS),
        )
        linhas = cursor.fetchall()
        cursor.close()
    return linhas


def salvar_csv(linhas) -> str:
    nome = f"telemetria_amostra_{datetime.now():%Y%m%d_%H%M%S}.csv"
    with open(nome, "w", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow(COLUNAS)
        for linha in linhas:
            escritor.writerow([v.isoformat(sep=" ") if isinstance(v, datetime) else v for v in linha])
    return nome


def ler_csv(nome):
    with open(nome, newline="", encoding="utf-8") as f:
        leitor = csv.reader(f)
        next(leitor)
        return [tuple(None if v == "" else v for v in linha) for linha in leitor]


def gravar_amostra(linhas):
    sql = f"INSERT INTO telemetria ({', '.join(COLUNAS)}) VALUES ({', '.join(['%s'] * len(COLUNAS))})"
    lote = 2000
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        for i in range(0, len(linhas), lote):
            cursor.executemany(sql, linhas[i:i + lote])
            conn.commit()
        cursor.close()


def criar_indice():
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() "
            "AND table_name = 'telemetria' AND index_name = 'idx_telemetria_data_hora'"
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("CREATE INDEX idx_telemetria_data_hora ON telemetria (data_hora)")
        cursor.close()


def resumo():
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM telemetria")
        total = cursor.fetchone()[0]
        cursor.close()
    return total


def restaurar(nome):
    linhas = ler_csv(nome)
    print(f"{len(linhas)} linhas no arquivo {nome}.")
    if not garantir_gravacao():
        sys.exit(1)
    gravar_amostra(linhas)
    print(f"Pronto. Tabela telemetria agora tem {resumo()} linhas.")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--restaurar":
        restaurar(sys.argv[2])
        return

    print(f"Lendo os últimos {DIAS_RETENCAO} dias (um ponto a cada {AMOSTRA_SEGUNDOS // 60} min por ônibus)...")
    linhas = ler_amostra()
    nome = salvar_csv(linhas)
    print(f"{len(linhas)} linhas salvas em {nome}.")
    print("Agora a tabela telemetria vai ser esvaziada e receber de volta só essa amostra.")
    if input("Digite SIM para continuar: ").strip().upper() != "SIM":
        print("Nada foi alterado no banco.")
        return

    if not garantir_gravacao():
        sys.exit(1)

    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("TRUNCATE TABLE telemetria")
        cursor.close()
    print("Tabela esvaziada, disco liberado.")

    criar_indice()
    gravar_amostra(linhas)
    print(f"Pronto. Tabela telemetria agora tem {resumo()} linhas.")
    print(f"Pode apagar {nome} quando quiser. O Aiven deve sair do modo somente leitura em alguns minutos.")


if __name__ == "__main__":
    main()
