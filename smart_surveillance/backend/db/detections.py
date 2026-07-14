from db.database import get_db_connection

def log_detection(camera_id, obj, confidence):
    conn = next(get_db_connection())
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO detections (camera_id, object_type, confidence)
        VALUES (%s, %s, %s)
        """,
        (camera_id, obj, confidence),
    )

    conn.commit()
    cur.close()