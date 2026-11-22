from collections import deque
from time import monotonic


class SlidingWindow:
    def __init__(self):
        self.buckets = {}
        self.cleanup_at = 0.0

    def allow(self, key, limit):
        now = monotonic()
        if now >= self.cleanup_at:
            self.buckets = {k: v for k, v in self.buckets.items() if v and v[-1] > now - 60}
            self.cleanup_at = now + 60
        times = self.buckets.setdefault(key, deque())
        while times and times[0] <= now - 60:
            times.popleft()
        if len(times) >= limit:
            return False
        times.append(now)
        return True
