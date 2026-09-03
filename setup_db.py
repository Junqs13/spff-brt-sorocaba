from database import db_manager

def criar_tabelas():
    try:
        # Tenta conectar na nuvem
        conn = db_manager.get_mysql_connection()
        cursor = conn.cursor()

        print("🔄 Conectado ao banco na nuvem! Construindo tabelas...")

        # 1. Cria a Tabela de Telemetria (Agora com 'sentido')
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetria (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_veiculo VARCHAR(50),
                id_rota VARCHAR(50),
                latitude FLOAT,
                longitude FLOAT,
                sentido VARCHAR(20) DEFAULT 'Centro',
                velocidade_atual_kmh INT,
                atraso_previsto_minutos INT,
                acessibilidade_ativa INT DEFAULT 1,
                data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅ Tabela 'telemetria' criada com sucesso.")

        # 2. Cria a Tabela de Reportes da Comunidade (Para o Heatmap)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reportes_comunidade (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_rota VARCHAR(50),
                tipo_problema VARCHAR(100),
                latitude FLOAT,
                longitude FLOAT,
                comentario TEXT,
                data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅ Tabela 'reportes_comunidade' criada com sucesso.")

        conn.commit()
        cursor.close()
        print("🚀 SUCESSO! O banco de dados no Aiven está 100% pronto para o CCO.")

    except Exception as e:
        print(f"❌ Erro ao configurar o banco de dados: {e}")

if __name__ == "__main__":
    criar_tabelas()