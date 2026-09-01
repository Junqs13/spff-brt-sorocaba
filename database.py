import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

class DatabaseManager:
    def __init__(self):
        self.mysql_conn = None

    def get_mysql_connection(self):
        # Cria ou retorna a conexão ativa com o MySQL
        if not self.mysql_conn or not self.mysql_conn.is_connected():
            self.mysql_conn = mysql.connector.connect(
                host=os.getenv("MYSQL_HOST"),
                user=os.getenv("MYSQL_USER"),
                password=os.getenv("MYSQL_PASSWORD"),
                database=os.getenv("MYSQL_DATABASE")
            )
        return self.mysql_conn

db_manager = DatabaseManager()