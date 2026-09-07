import os
import mysql.connector
from mysql.connector import pooling
from dotenv import load_dotenv

# Garante que as variáveis do .env sejam carregadas
load_dotenv()

class DatabaseManager:
    def __init__(self):
        # Cria um Pool de conexões na inicialização do servidor
        try:
            self.connection_pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="spff_pool",
                pool_size=5,               # Mantém 5 conexões ativas prontas para uso
                pool_reset_session=True,   # Limpa a memória da conexão ao devolver pro pool
                host=os.getenv("DB_HOST"),
                port=int(os.getenv("DB_PORT", 3306)),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                database=os.getenv("DB_NAME"),
                connect_timeout=10         # Impede que a API trave se o banco demorar a responder
            )
            print("✅ Pool de conexões com Aiven criado com sucesso!")
        except Exception as e:
            print(f"❌ Erro ao criar Pool de Conexões: {e}")

    def get_mysql_connection(self):
        # Pega uma conexão "quente" do Pool em vez de criar uma do zero
        conn = self.connection_pool.get_connection()
        
        # Trava de Segurança: Se o Aiven derrubou a conexão por inatividade, ele reconecta sozinho
        if not conn.is_connected():
            conn.reconnect(attempts=3, delay=2)
            
        return conn

db_manager = DatabaseManager()