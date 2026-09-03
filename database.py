import os
import mysql.connector
from dotenv import load_dotenv

# Garante que as variáveis do .env sejam carregadas
load_dotenv()

class DatabaseManager:
    def get_mysql_connection(self):
        return mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306)), # Pega a porta do Aiven ou usa 3306 como fallback
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME")
        )

db_manager = DatabaseManager()