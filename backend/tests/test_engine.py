from app.aps.engine import OpInput, OrderInput, ProblemInput, solve


def test_respects_routing_and_capacity():
    # Två order, varje med två operationer i sekvens; en maskin per typ.
    problem = ProblemInput(
        orders=[
            OrderInput(order_id=1, due=200, priority=10),
            OrderInput(order_id=2, due=400, priority=50),
        ],
        operations=[
            OpInput(op_id=1, order_id=1, seq=10, product_id=1, duration=60, eligible_machines=[1]),
            OpInput(op_id=2, order_id=1, seq=20, product_id=1, duration=30, eligible_machines=[2]),
            OpInput(op_id=3, order_id=2, seq=10, product_id=2, duration=60, eligible_machines=[1]),
            OpInput(op_id=4, order_id=2, seq=20, product_id=2, duration=30, eligible_machines=[2]),
        ],
        machines=[1, 2],
        horizon=1000,
        max_seconds=5.0,
    )
    sol = solve(problem)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    by_id = {s.op_id: s for s in sol.scheduled}

    assert by_id[2].start >= by_id[1].end          # routing
    assert by_id[4].start >= by_id[3].end
    a, b = by_id[1], by_id[3]
    assert a.end <= b.start or b.end <= a.start     # finite capacity på maskin 1
    assert by_id[2].end <= 200                       # prioriterad order i tid


def test_setup_time_between_different_products():
    # Två operationer, olika produkter, samma enda maskin → ställtid emellan.
    problem = ProblemInput(
        orders=[
            OrderInput(order_id=1, due=1000, priority=100),
            OrderInput(order_id=2, due=1000, priority=100),
        ],
        operations=[
            OpInput(op_id=1, order_id=1, seq=10, product_id=1, duration=60, eligible_machines=[1]),
            OpInput(op_id=2, order_id=2, seq=10, product_id=2, duration=60, eligible_machines=[1]),
        ],
        machines=[1],
        horizon=1000,
        setup_change_minutes=30,
        max_seconds=5.0,
    )
    sol = solve(problem)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    s = sorted(sol.scheduled, key=lambda x: x.start)
    # gapet mellan slutet på den första och starten på den andra >= 30 min ställtid
    assert s[1].start - s[0].end >= 30


def test_machine_downtime_is_respected():
    # Maskin 1 är nere 0–120 min; en 60-min-operation måste starta efter det.
    problem = ProblemInput(
        orders=[OrderInput(order_id=1, due=1000, priority=100)],
        operations=[
            OpInput(op_id=1, order_id=1, seq=10, product_id=1, duration=60, eligible_machines=[1]),
        ],
        machines=[1],
        horizon=1000,
        downtime={1: [(0, 120)]},
        max_seconds=5.0,
    )
    sol = solve(problem)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    op = sol.scheduled[0]
    assert op.start >= 120  # kan inte köra under underhåll
