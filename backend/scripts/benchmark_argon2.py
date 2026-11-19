"""Benchmark Argon2id parameters on the hardware that will run the API.

The shipped defaults (m=19456 KiB, t=2, p=1) follow the OWASP Password Storage
Cheat Sheet baseline. Password hashing cost is hardware-dependent, so operators
should re-run this benchmark on the real deployment host and adjust
ARGON2_TIME_COST / ARGON2_MEMORY_COST_KIB / ARGON2_PARALLELISM only if the
measured login latency is unacceptable. Never lower the cost just to make the
benchmark look faster; instead scale the number of API workers or use a larger
instance.

Usage:

    python backend/scripts/benchmark_argon2.py
    python backend/scripts/benchmark_argon2.py --samples 7 --target-ms 500
"""

from __future__ import annotations

import argparse
import math
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from argon2 import Type, extract_parameters  # noqa: E402
from argon2 import PasswordHasher  # noqa: E402

from backend.app.config import settings  # noqa: E402

PASSWORD = 'Correct-Horse-Battery-Staple-2026!'  # nosec B105 - benchmark fixture, not a credential


@dataclass(frozen=True)
class Candidate:
    time_cost: int
    memory_cost_kib: int
    parallelism: int = 1

    def label(self) -> str:
        return f'm={self.memory_cost_kib} KiB, t={self.time_cost}, p={self.parallelism}'


@dataclass(frozen=True)
class Measurement:
    candidate: Candidate
    hash_ms: float
    verify_ms: float
    p95_hash_ms: float


def _hasher(candidate: Candidate) -> PasswordHasher:
    return PasswordHasher(
        time_cost=candidate.time_cost,
        memory_cost=candidate.memory_cost_kib,
        parallelism=candidate.parallelism,
        hash_len=32,
        salt_len=16,
        type=Type.ID,
    )


def measure(candidate: Candidate, samples: int = 5) -> Measurement:
    """Measure hash and verify latency; return medians and hash p95 in ms."""
    if samples < 1:
        raise ValueError('samples must be at least 1')
    hasher = _hasher(candidate)
    hash_times: list[float] = []
    verify_times: list[float] = []
    for _ in range(samples):
        start = time.perf_counter()
        encoded = hasher.hash(PASSWORD)
        hash_times.append((time.perf_counter() - start) * 1000)

        start = time.perf_counter()
        if not hasher.verify(encoded, PASSWORD):
            raise AssertionError('Argon2 verification failed during benchmark')
        verify_times.append((time.perf_counter() - start) * 1000)

    return Measurement(
        candidate=candidate,
        hash_ms=statistics.median(hash_times),
        verify_ms=statistics.median(verify_times),
        p95_hash_ms=sorted(hash_times)[min(len(hash_times) - 1, math.ceil(len(hash_times) * 0.95) - 1)],
    )


def default_candidate() -> Candidate:
    return Candidate(
        time_cost=settings.argon2_time_cost,
        memory_cost_kib=settings.argon2_memory_cost_kib,
        parallelism=settings.argon2_parallelism,
    )


def recommended_candidates(current: Candidate) -> list[Candidate]:
    """A small comparison set anchored on the configured production default."""
    candidates = [
        Candidate(memory_cost_kib=9728, time_cost=2),
        Candidate(memory_cost_kib=19456, time_cost=2),
        Candidate(memory_cost_kib=19456, time_cost=3),
        Candidate(memory_cost_kib=38912, time_cost=2),
        current,
    ]
    # Preserve order while removing duplicates.
    return list(dict.fromkeys(candidates))


def recommend(results: list[Measurement], target_ms: float) -> Measurement | None:
    """Pick the strongest candidate whose p95 hash latency fits the target."""
    acceptable = [r for r in results if r.p95_hash_ms <= target_ms]
    if not acceptable:
        return None
    return max(acceptable, key=lambda r: (r.candidate.memory_cost_kib, r.candidate.time_cost))


def verify_stored_hash_type() -> str:
    """Confirm hashes produced by the API use Argon2id, not Argon2i or Argon2d."""
    hasher = _hasher(default_candidate())
    params = extract_parameters(hasher.hash(PASSWORD))
    return str(params.type).split('.')[-1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=5, help='hashes per candidate (default: 5)')
    parser.add_argument('--target-ms', type=float, default=500.0,
                        help='maximum acceptable p95 hash latency (default: 500 ms)')
    args = parser.parse_args()

    current = default_candidate()
    print(f'Argon2 type used by the API: {verify_stored_hash_type()}')
    print(f'Configured default: {current.label()}')
    print(f'Target p95 hash latency: {args.target_ms:.0f} ms\n')

    results = []
    for candidate in recommended_candidates(current):
        result = measure(candidate, args.samples)
        results.append(result)
        marker = ' (current)' if candidate == current else ''
        print(
            f'{candidate.label():<34} hash {result.hash_ms:7.1f} ms '
            f'(p95 {result.p95_hash_ms:7.1f})  verify {result.verify_ms:7.1f} ms{marker}'
        )

    chosen = recommend(results, args.target_ms)
    print()
    if chosen is None:
        print('No candidate met the target on this hardware. Keep the defaults and '
              'investigate host capacity before tuning password hashing.')
    elif chosen.candidate == current:
        print('The configured default is appropriate for this host; no change needed.')
    else:
        print(f'Consider changing to {chosen.candidate.label()} (set ARGON2_MEMORY_COST_KIB, '
              'ARGON2_TIME_COST and ARGON2_PARALLELISM). Re-run after any change.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
