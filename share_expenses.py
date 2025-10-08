import numpy as np

def share_expenses(spending_history: dict):
    """
    Takes a dictionary of expenses incurred {<name>: <amount>} and
    computes balances to be settled.
    """
    total_spent = sum(spending_history.values())
    total_per_person = np.round(total_spent / len(spending_history.keys()), 2)

    debt_collectors = {}
    indebted = {}
    for name in spending_history.keys():
        if spending_history[name] > total_per_person:
            ar = np.round(spending_history[name] - total_per_person, 2)
            debt_collectors[name] = ar
            print(f"{name} is owed {ar}")
        elif spending_history[name] < total_per_person:
            ap = np.round(np.abs(spending_history[name] - total_per_person), 2)
            indebted[name] = ap
            print(f"{name} owes {ap}")

    print("--------------Breakdown--------------")

    total_debt = sum(debt_collectors.values())
    share_of_debt = {}
    for name in debt_collectors.keys():
        share_of_debt[name] = debt_collectors[name] / total_debt
    
    for name in indebted.keys():
        for owed in share_of_debt.keys():
            amount_owed = np.round(indebted[name] * share_of_debt[owed], 2)
            print(f"{name} owes {owed} {amount_owed}")
