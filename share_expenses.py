from typing import Dict, List

def greedy_pairing(spending_log: Dict):
    """
    Takes a dictionary of expenses incurred {<name>: <amount>} and
    computes precise balances to be settled in the fewest number
    of transactions.
    """
    names = list(spending_log.keys())
    paid_cents = {u: int(round(spending_log[u] * 100)) for u in names}
    total = sum(paid_cents.values())
    n = len(names)

    avg, r = divmod(total, n)
    order = sorted(names, key=lambda u: paid_cents[u], reverse=True)
    target_cents = {u: avg for u in names}
    for u in order[:r]:
        target_cents[u] += 1

    balance_cents = {u: paid_cents[u] - target_cents[u] for u in names}

    # build lists of creditors and debtors
    creditors = [(u, balance_cents[u]) for u in names if balance_cents[u] > 0]
    debtors   = [(u, -balance_cents[u]) for u in names if balance_cents[u] < 0]

    # greedy pairing
    transfers = []
    i = j = 0
    creditors.sort(key=lambda x: x[1])
    debtors.sort(key=lambda x: x[1])

    while i < len(debtors) and j < len(creditors):
        debtor_name, debtor_amount = debtors[i]
        creditor_name, creditor_amount = creditors[j]
        x = min(debtor_amount, creditor_amount)
        if x > 0:
            transfers.append((debtor_name, creditor_name, x / 100.0))
        debtor_amount -= x
        creditor_amount -= x
        if debtor_amount == 0:
            i += 1
        else:
            debtors[i] = (debtor_name, debtor_amount)
        if creditor_amount == 0:
            j += 1
        else:
            creditors[j] = (creditor_name, creditor_amount)

    targets = {u: target_cents[u] / 100.0 for u in names}
    return targets, transfers, balance_cents


def describe_initial_balances(balances_cents: Dict):
    """
    print lines like:
      'Alice is owed $123.45'
      'Bob owes $67.89'
      'Cara is settled $0.00'
    """
    lines = []
    for name, b in balances_cents.items():
        if b > 0:
            lines.append(f"{name} is owed ${b/100:,.2f}")
        elif b < 0:
            lines.append(f"{name} owes ${-b/100:,.2f}")
        else:
            lines.append(f"{name} is settled $0.00")
    return "\n".join(lines)


def describe_transfers(transfers: List):
    """
    print lines like:
    'Alice owes Bob $65.87'
    'Hugo owes Ben $127.50' 
    """
    if not transfers:
        return "Everyone is already settled!"
    return "\n".join(f"{payer} pays {receiver} ${amount:,.2f}" for payer, receiver, amount in transfers)
