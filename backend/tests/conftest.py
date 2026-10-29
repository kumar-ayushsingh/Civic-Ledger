import os
import sys

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Isolate test database from running development server
data_dir = os.path.join(backend_dir, "data")
os.makedirs(data_dir, exist_ok=True)
test_db_path = os.path.join(data_dir, "test_civicledger.db")
os.environ["CIVICLEDGER_TEST"] = "1"
os.environ["CIVICLEDGER_DB_PATH"] = test_db_path
