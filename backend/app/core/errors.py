class Problem(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def unauthorized():
    return Problem(401, "unauthenticated", "Войдите в аккаунт, чтобы продолжить.")


def unavailable():
    return Problem(404, "not_found", "Диалог не найден.")
