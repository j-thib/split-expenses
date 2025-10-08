import numpy as np

def share_expenses(spending_log: dict):
    """
    Takes a dictionary of expenses incurred {<name>: <amount>} and
    computes balances to be settled.
    """
    total_spent = sum(spending_log.values())
    total_per_person = np.round(total_spent / len(spending_log.keys()), 2)

    creditors = {}
    debtors = {}
    for name in spending_log.keys():
        if spending_log[name] > total_per_person:
            ar = np.round(spending_log[name] - total_per_person, 2)
            creditors[name] = ar
            print(f"{name} is owed {ar}")
        elif spending_log[name] < total_per_person:
            ap = np.round(np.abs(spending_log[name] - total_per_person), 2)
            debtors[name] = ap
            print(f"{name} owes {ap}")

    print("--------------Breakdown--------------")

    total_debt = sum(creditors.values())
    share_of_debt = {}
    for name in creditors.keys():
        share_of_debt[name] = creditors[name] / total_debt
    
    for name in debtors.keys():
        for owed in share_of_debt.keys():
            amount_owed = np.round(debtors[name] * share_of_debt[owed], 2)
            print(f"{name} owes {owed} {amount_owed}")
