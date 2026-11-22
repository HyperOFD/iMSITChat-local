"""Initial relational schema."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(32), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(5), nullable=False, server_default="user"),
        sa.CheckConstraint("username ~ '^[a-z0-9_]{3,32}$'", name="valid_username"),
        sa.CheckConstraint("role IN ('user', 'admin')", name="valid_role"),
    )
    op.create_table(
        "sessions",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "dialogs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("second_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("first_id", "second_id", name="dialog_pair"),
        sa.CheckConstraint("first_id < second_id", name="ordered_pair"),
    )
    op.create_index("ix_dialogs_second_id", "dialogs", ["second_id"])
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dialog_id", sa.Integer(), sa.ForeignKey("dialogs.id"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("char_length(body) BETWEEN 1 AND 4000", name="body_length"),
    )
    op.create_index("ix_messages_dialog_id_id", "messages", ["dialog_id", "id"])


def downgrade():
    for table in ("messages", "dialogs", "sessions", "users"):
        op.drop_table(table)
