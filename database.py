import os
import mysql.connector
from mysql.connector import pooling
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

class DatabaseManager:
    def __init__(self):
        try:
            self.connection_pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="spff_pool",
                pool_size=10,               # Aumentado para suportar o polling simultâneo
                pool_reset_session=True,   
                host=os.getenv("DB_HOST"),
                port=int(os.getenv("DB_PORT", 3306)),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                database=os.getenv("DB_NAME"),
                connect_timeout=10
            )
            print("✅ Pool de conexões com Aiven criado com sucesso!")
        except Exception as e:
            print(f"❌ Erro ao criar Pool de Conexões: {e}")

    @contextmanager
    def get_connection(self):
        """Context manager que garante a devolução automática da conexão ao pool."""
        conn = self.connection_pool.get_connection()
        try:
            if not conn.is_connected():
                conn.reconnect(attempts=3, delay=2)
            yield conn
        finally:
            conn.close()  # Devolve a conexão ao pool com segurança

db_manager = DatabaseManager()