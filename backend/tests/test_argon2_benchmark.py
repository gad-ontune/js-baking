"""Regression tests for the Argon2 parameter benchmark helpers."""

from backend.scripts.benchmark_argon2 import (
    Candidate,
    Measurement,
    default_candidate,
    measure,
    recommend,
    verify_stored_hash_type,
)


def test_password_hasher_uses_argon2id():
    assert verify_stored_hash_type() == 'ID'


def test_default_candidate_matches_configuration():
    candidate = default_candidate()
    assert candidate.time_cost >= 2
    assert candidate.memory_cost_kib >= 9728
    assert candidate.parallelism >= 1
    assert 'KiB' in candidate.label()


def test_measure_returns_positive_timings():
    result = measure(Candidate(memory_cost_kib=1024, time_cost=1), samples=1)
    assert result.hash_ms > 0
    assert result.verify_ms > 0
    assert result.p95_hash_ms >= result.hash_ms


def test_recommend_picks_strongest_candidate_within_target():
    weak = Candidate(memory_cost_kib=9728, time_cost=2)
    strong = Candidate(memory_cost_kib=19456, time_cost=2)
    too_slow = Candidate(memory_cost_kib=38912, time_cost=3)
    results = [
        Measurement(weak, 20, 20, 25),
        Measurement(strong, 60, 60, 70),
        Measurement(too_slow, 900, 900, 950),
    ]
    assert recommend(results, target_ms=100) == results[1]
    assert recommend(results, target_ms=10) is None
