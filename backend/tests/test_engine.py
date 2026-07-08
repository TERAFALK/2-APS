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

    # routing: op20 startar efter op10 i samma order
    assert by_id[2].start >= by_id[1].end
    assert by_id[4].start >= by_id[3].end

    # finite capacity: op1 och op3 delar maskin 1 → får inte överlappa
    a, b = by_id[1], by_id[3]
    assert a.end <= b.start or b.end <= a.start

    # prioriterad order (1, tightare due) bör inte bli sen
    assert by_id[2].end <= 200
