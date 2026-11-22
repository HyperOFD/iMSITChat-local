"""Remember the most recent authenticated connection activity."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    # For pre-existing accounts, use only activity evidenced by stored records.
    op.execute("""
        UPDATE users SET last_seen_at = activity.seen
        FROM (
            SELECT uid, max(seen) AS seen
            FROM (
                SELECT sender_id AS uid, created_at AS seen FROM messages
                UNION ALL
                SELECT user_id, expires_at - interval '7 days' FROM sessions
            ) AS observations
            GROUP BY uid
        ) AS activity
        WHERE users.id = activity.uid
    """)


def downgrade():
    op.drop_column("users", "last_seen_at")
