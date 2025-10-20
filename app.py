import streamlit as st
import pandas as pd
import numpy as np
from io import StringIO
from collections import defaultdict
import json
from supabase import create_client

from share_expenses import greedy_pairing, describe_initial_balances, describe_transfers

# ----------------------- CONFIG -----------------------
st.set_page_config(page_title="Share expenses", page_icon="💸", layout="wide")
st.markdown("<style>.block-container{padding-top:2rem;padding-bottom:2rem}</style>", unsafe_allow_html=True)
st.title("💸 Share expenses")

# ----------------------- SUPABASE CONNECTION -----------------------
supabase = create_client(st.secrets["supabase"]["url"], st.secrets["supabase"]["key"])

def load_expenses():
    """Load all expenses (persisted) from Supabase."""
    try:
        res = supabase.table("shared_expense_log").select("text").eq("id", "global").execute()
        if res.data and res.data[0]["text"]:
            data = json.loads(res.data[0]["text"])
            for e in data:
                e.setdefault("payer", "")
                e.setdefault("people", [])
            return data
    except Exception as e:
        st.warning(f"Could not load log: {e}")
    return []

def save_expenses(expenses):
    """Save expense list persistently."""
    try:
        supabase.table("shared_expense_log").upsert(
            {"id": "global", "text": json.dumps(expenses)}
        ).execute()
    except Exception as e:
        st.warning(f"Could not save log: {e}")

# ----------------------- PASSWORD GATE -----------------------
if "auth_ok" not in st.session_state:
    st.session_state.auth_ok = False

if not st.session_state.auth_ok:
    st.text_input("Enter group password", type="password", key="password")
    if st.button("Unlock"):
        if st.session_state.password == st.secrets["app"]["password"]:
            st.session_state.auth_ok = True
            st.rerun()
        else:
            st.error("Wrong password.")
    st.stop()

# ----------------------- LOAD DATA -----------------------
if "expenses" not in st.session_state:
    st.session_state.expenses = load_expenses()

# ----------------------- PARTICIPANT MANAGEMENT -----------------------
st.sidebar.header("👥 Trip Participants")

if "participants" not in st.session_state:
    known = set()
    for e in st.session_state.expenses:
        known.update(e.get("people", []))
        if e.get("payer"):
            known.add(e["payer"])
    st.session_state.participants = sorted(list(known))

if st.session_state.participants:
    st.sidebar.write(", ".join(st.session_state.participants))
else:
    st.sidebar.info("No participants yet. Add at least one below!")

with st.sidebar.form("add_person_form", clear_on_submit=True):
    new_person = st.text_input("Add a new person", placeholder="Name")
    add_person = st.form_submit_button("➕ Add person")
    if add_person and new_person.strip():
        p = new_person.strip()
        if p not in st.session_state.participants:
            st.session_state.participants.append(p)
            st.session_state.participants.sort()
            st.success(f"Added {p} to participants")
            st.rerun()
        else:
            st.warning(f"{p} already exists")

# ----------------------- EXPENSE ENTRY -----------------------
st.sidebar.markdown("---")
st.sidebar.header("🧾 Add an expense")

if not st.session_state.participants:
    st.sidebar.warning("Add participants before logging expenses.")
else:
    with st.sidebar.form("add_expense", clear_on_submit=True):
        desc = st.text_input("Description", placeholder="Dinner, Hotel, etc.")
        amount = st.number_input("Amount ($)", min_value=0.0, step=0.01)
        selected = st.multiselect(
            "Who was involved?",
            st.session_state.participants,
            default=st.session_state.participants,
        )
        payer = st.selectbox("Who paid?", st.session_state.participants)
        add = st.form_submit_button("➕ Add expense")

    if add and desc and amount > 0 and selected and payer:
        st.session_state.expenses.append(
            {"desc": desc, "amount": amount, "people": selected, "payer": payer}
        )
        save_expenses(st.session_state.expenses)
        st.success(f"Added {desc} (${amount:.2f}) paid by {payer} → {', '.join(selected)}")
        st.rerun()

# ----------------------- CURRENT EXPENSES (with delete buttons) -----------------------
if st.session_state.expenses:
    st.sidebar.markdown("### Current expenses")

    # create a copy to iterate safely
    to_delete = None
    for idx, e in enumerate(st.session_state.expenses):
        payer = e.get("payer", "unknown")
        desc = e.get("desc", "(no description)")
        participants = ", ".join(e.get("people", []))
        amount = e.get("amount", 0)

        # make tighter inline columns
        c1, c2 = st.sidebar.columns([9, 1])
        with c1:
            st.markdown(
                f"<span style='font-weight:600'>{desc}</span> — ${amount:.2f} "
                f"(paid by {payer}) → {participants}",
                unsafe_allow_html=True,
            )
        with c2:
            if st.button("❌", key=f"del_{idx}", help=f"Delete {desc}"):
                to_delete = idx


    if to_delete is not None:
        del st.session_state.expenses[to_delete]
        save_expenses(st.session_state.expenses)
        st.rerun()

    st.sidebar.markdown("---")
    if st.sidebar.button("🗑 Clear all"):
        st.session_state.expenses.clear()
        save_expenses([])
        st.rerun()
else:
    if st.session_state.participants:
        st.sidebar.info("No expenses yet. Add one above.")
    else:
        st.sidebar.info("Add participants first to begin logging expenses.")

# ----------------------- COMPUTE BALANCES -----------------------
def compute_balances(expenses):
    """Each participant's net (paid - share)."""
    balances = defaultdict(float)
    for e in expenses:
        amount = e["amount"]
        participants = e["people"]
        payer = e.get("payer", "")
        if not participants or not payer:
            continue
        share = amount / len(participants)
        for p in participants:
            balances[p] -= share
        balances[payer] += amount
    return dict(balances)

spending = compute_balances(st.session_state.expenses)

# ----------------------- RESULTS -----------------------
if spending:
    try:
        targets, transfers, balances_cents = greedy_pairing(spending)

        names = list(spending.keys())
        n = len(names)
        total_spent = sum(e["amount"] for e in st.session_state.expenses)
        nonzero_bal = sum(1 for b in balances_cents.values() if b != 0)
        min_edges = max(0, nonzero_bal - 1)
        per_person_avg = total_spent / n

        people_rows = []
        for name in names:
            bal = balances_cents[name] / 100.0
            paid = sum(e["amount"] for e in st.session_state.expenses if e.get("payer") == name)
            status = "is owed" if bal > 0 else ("owes" if bal < 0 else "settled")
            people_rows.append({"Name": name, "Paid": paid, "Balance": bal, "Status": status})
        people_df = pd.DataFrame(people_rows).sort_values(by=["Status", "Balance"])

        transfers_rows = [{"Payer": p, "Receiver": r, "Amount": amt} for (p, r, amt) in transfers]
        transfers_df = pd.DataFrame(transfers_rows)

        text = StringIO()
        text.write(f"Target spend per person: ${per_person_avg:,.2f}\n\n")
        text.write("Initial balances:\n")
        text.write(describe_initial_balances(balances_cents))
        text.write("\n\nWho pays whom:\n")
        text.write(describe_transfers(transfers))
        text_report = text.getvalue()

        left, right = st.columns([1, 2], gap="small")

        with left:
            st.subheader("📊 Summary")
            st.metric("Participants", n)
            st.metric("Total spent", f"${total_spent:,.2f}")
            st.metric("Per-person (avg)", f"${per_person_avg:,.2f}")
            st.metric("People who owe", sum(b < 0 for b in balances_cents.values()))
            st.metric("People owed", sum(b > 0 for b in balances_cents.values()))
            st.metric("Minimal transactions", min_edges)
            st.download_button(
                "⬇️ Download settlement instructions (.txt)",
                data=text_report,
                file_name="settlement_instructions.txt",
                mime="text/plain",
            )

        with right:
            st.subheader("🧾 Details")
            tabs = st.tabs(["Balances", "Transfers", "Text output"])
            with tabs[0]:
                st.caption("Positive balance → owed money; negative → owes money.")
                st.dataframe(
                    people_df.style.format({"Paid": "${:,.2f}", "Balance": "${:,.2f}"}),
                    width='stretch',
                    hide_index=True,
                )
            with tabs[1]:
                if transfers_df.empty:
                    st.info("No transfers needed.")
                else:
                    st.dataframe(
                        transfers_df.style.format({"Amount": "${:,.2f}"}),
                        width='stretch',
                        hide_index=True,
                    )
            with tabs[2]:
                st.code(text_report, language="text")

    except Exception as e:
        st.error(str(e))
else:
    st.info("Add participants and expenses on the left to begin.")
