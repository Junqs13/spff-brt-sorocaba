"""
LIBERAR ESPAÇO NO AIVEN (rodar uma vez, no seu computador)

Quando o disco do Aiven passa de 97%, o MySQL entra em modo somente leitura
e para de aceitar gravações. Apagar linhas com DELETE não devolve espaço ao
disco no InnoDB, então este script:

  1. copia para uma tabela nova só os últimos DIAS_RETENCAO dias,
     com um ponto a cada 2 minutos por ônibus (o mesmo ritmo que a API grava agora);
  2. troca a tabela antiga pela nova;
  3. apaga a tabela antiga, o que libera o disco na hora.

Os reportes da comunidade não são tocados.

Como usar:
  python liberar_espaco.py

Se o banco estiver em modo somente leitura, o script pode liberar a gravação
por uns 15 minutos pela API do Aiven. Para isso, coloque no .env:
  AIVEN_TOKEN=...      (Aiven Console > User information > Tokens)
  AIVEN_PROJETO=...    (nome do projeto no Aiven)
  AIVEN_SERVICO=...    (nome do serviço MySQL)
"""
import os
import sys
import requests
from dotenv import load_dotenv
from database import db_manager

load_dotenv()

DIAS_RETENCAO = int(os.getenv("DIAS_RETENCAO", "7"))
AMOSTRA_SEGUNDOS = int(os.getenv("HISTORICO_A_CADA_SEGUNDOS", "120"))


def liberar_gravacao_no_aiven() -> bool:
    token = os.getenv("AIVEN_TOKEN")
    projeto = os.getenv("AIVEN_PROJETO")
    servico = os.getenv("AIVEN_SERVICO")
    if not (token and projeto and servico):
        return False
    url = f"https://api.aiven.io/v1/project/{projeto}/service/{servico}/enable-writes"
    resposta = requests.post(url, headers={"Authorization": f"aivenv1 {token}"}, timeout=30)
    print(f"Aiven respondeu {resposta.status_code}: {resposta.text[:200]}")
    return resposta.ok


def tamanho_tabela(cursor, tabela):
    cursor.execute(
        "SELECT ROUND((data_length + index_length) / 1024 / 1024, 1), table_rows "
        "FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s",
        (tabela,),
    )
    linha = cursor.fetchone()
    return (linha[0], linha[1]) if linha else (0, 0)


def main():
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        mb, linhas = tamanho_tabela(cursor, "telemetria")
        print(f"Tabela telemetria hoje: cerca de {mb} MB e {linhas} linhas.")
        print(f"Vou manter só os últimos {DIAS_RETENCAO} dias, com um ponto a cada "
              f"{AMOSTRA_SEGUNDOS // 60} min por ônibus, e apagar o resto.")
        if input("Digite SIM para continuar: ").strip().upper() != "SIM":
            print("Nada foi alterado.")
            return

        cursor.execute("SELECT @@GLOBAL.read_only")
        if cursor.fetchone()[0] == 1:
            print("O banco está em modo somente leitura (disco cheio).")
            if not liberar_gravacao_no_aiven():
                print("Defina AIVEN_TOKEN, AIVEN_PROJETO e AIVEN_SERVICO no .env e rode de novo.")
                sys.exit(1)

        cursor.execute("DROP TABLE IF EXISTS telemetria_nova")
        cursor.execute("CREATE TABLE telemetria_nova LIKE telemetria")
        cursor.execute(
            """
            INSERT INTO telemetria_nova
            SELECT t.* FROM telemetria t
            JOIN (
                SELECT MIN(id) AS id FROM telemetria
                WHERE data_hora >= NOW() - INTERVAL %s DAY
                GROUP BY id_veiculo, FLOOR(UNIX_TIMESTAMP(data_hora) / %s)
            ) amostra ON amostra.id = t.id
            """,
            (DIAS_RETENCAO, AMOSTRA_SEGUNDOS),
        )
        copiadas = cursor.rowcount
        conn.commit()
        print(f"{copiadas} linhas copiadas para a tabela nova.")

        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() "
            "AND table_name = 'telemetria_nova' AND index_name = 'idx_telemetria_data_hora'"
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("CREATE INDEX idx_telemetria_data_hora ON telemetria_nova (data_hora)")

        cursor.execute("RENAME TABLE telemetria TO telemetria_antiga, telemetria_nova TO telemetria")
        cursor.execute("DROP TABLE telemetria_antiga")
        conn.commit()

        cursor.execute("ANALYZE TABLE telemetria")
        cursor.fetchall()
        mb, _ = tamanho_tabela(cursor, "telemetria")
        cursor.execute("SELECT COUNT(*) FROM telemetria")
        print(f"Pronto. Tabela telemetria agora: cerca de {mb} MB e {cursor.fetchone()[0]} linhas.")
        print("O Aiven pode levar alguns minutos para sair do modo somente leitura.")
        cursor.close()


if __name__ == "__main__":
    main()
