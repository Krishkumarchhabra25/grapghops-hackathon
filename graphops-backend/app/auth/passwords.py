"""Password hashing using bcrypt directly.

Why not passlib? Passlib is unmaintained and breaks on bcrypt 4.1+ because
it tries to read `bcrypt.__about__.__version__`, which no longer exists.
Using bcrypt directly is simpler, faster, and version-safe.

bcrypt has a hard 72-byte limit on passwords. We truncate explicitly to
avoid the surprising ValueError that newer bcrypt raises.
"""
from __future__ import annotations

import logging

import bcrypt

log = logging.getLogger('graphops.auth.passwords')

# bcrypt rounds. 12 is the modern sweet spot (~250ms/hash on a laptop).
# Increase to 13/14 in production if you have CPU headroom.
_ROUNDS = 12

# bcrypt truncates passwords at 72 bytes. We do it explicitly so behavior is
# predictable across bcrypt versions.
_MAX_BYTES = 72

# A pre-computed hash used to burn CPU time on missing-user lookups.
# Prevents email enumeration via response timing.
_DUMMY_HASH = bcrypt.hashpw(b'dummy-password', bcrypt.gensalt(rounds=_ROUNDS))


def _prepare(plain: str) -> bytes:
    """Encode to bytes and truncate to bcrypt's 72-byte limit."""
    return plain.encode('utf-8')[:_MAX_BYTES]


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (as a UTF-8 string) suitable for storage."""
    if not isinstance(plain, str) or not plain:
        raise ValueError('password must be a non-empty string')
    hashed = bcrypt.hashpw(_prepare(plain), bcrypt.gensalt(rounds=_ROUNDS))
    return hashed.decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time verify. Returns False on any error, never raises."""
    if not plain or not hashed:
        # Still burn time so timing is consistent.
        bcrypt.checkpw(b'dummy', _DUMMY_HASH)
        return False
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode('utf-8'))
    except (ValueError, TypeError) as e:
        log.warning('password verify failed: %s', e)
        return False


def burn_time() -> None:
    """Explicit timing-attack mitigation for the 'user not found' case."""
    bcrypt.checkpw(b'dummy', _DUMMY_HASH)


def needs_rehash(hashed: str) -> bool:
    """True if the hash was created with weaker params and should be upgraded."""
    try:
        # Extract the cost factor from the hash (format: $2b$12$...)
        parts = hashed.split('$')
        if len(parts) < 4:
            return True
        current_rounds = int(parts[2])
        return current_rounds < _ROUNDS
    except (ValueError, IndexError):
        return True