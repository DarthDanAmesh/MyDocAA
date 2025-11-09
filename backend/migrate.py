# backend/migrate_database.py
from sqlalchemy import text
from db import engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_database():
    """
    Add missing columns to the users table for email verification.
    """
    try:
        with engine.connect() as conn:
            # Start a transaction
            trans = conn.begin()
            
            try:
                # Check current columns
                result = conn.execute(text("PRAGMA table_info(users)"))
                existing_columns = [row[1] for row in result]
                logger.info(f"Existing columns: {existing_columns}")
                
                # Define columns to add
                columns_to_add = [
                    ('verified', 'BOOLEAN DEFAULT 0'),  # SQLite uses 0/1 for boolean
                    ('verification_token', 'TEXT'),
                    ('verification_token_expires', 'DATETIME'),
                    ('reset_token', 'TEXT'),
                    ('reset_token_expires', 'DATETIME'),
                    ('updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
                ]
                
                # Add missing columns
                for column_name, column_type in columns_to_add:
                    if column_name not in existing_columns:
                        logger.info(f"Adding column: {column_name}")
                        alter_sql = f"ALTER TABLE users ADD COLUMN {column_name} {column_type}"
                        conn.execute(text(alter_sql))
                        logger.info(f"✓ Added {column_name} column")
                    else:
                        logger.info(f"✓ Column {column_name} already exists")
                
                # Commit the transaction
                trans.commit()
                logger.info("✅ Database migration completed successfully!")
                
            except Exception as e:
                trans.rollback()
                logger.error(f"Migration failed, rolling back: {str(e)}")
                raise
                
    except Exception as e:
        logger.error(f"Migration error: {str(e)}")
        raise

if __name__ == "__main__":
    migrate_database()