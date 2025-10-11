import streamlit as st
import numpy as np
import pandas as pd
from io import StringIO
import json, os

from share_expenses import greedy_pairing, describe_initial_balances, describe_transfers

# ----------------------- Shared persistence -----------------------
DATA_FILE = "shared_expense_log.json"

def load_log() -> str:
    """Load the shared text from disk (or return empty)."""
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                return json.load(f).get("text", "")
        except Exception:
            return ""
    return ""

def save_log(text: str):
    """Save current text to disk so everyone sees the same."""
    with open(DATA_FILE, "w") as f:
        json.dump({"text": text}, f)

# ----------------------- Password gate -----------------------
st.set_page_config(page_title="Share expenses", page_icon="💸", layout="wide")
st.markdown("<style>.block-container{padding-top:2rem;padding-bottom:2rem}</style>", unsafe_allow_html=True)
st.title("💸 Share expenses")

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

# ----------------------- Input sidebar -----------------------
with st.sidebar:
    st.header("Spending input")
    st.caption("Paste one `name: amount` per line (commas or spaces also work).")

    # load last shared log as default
    default = load_log() or """
    Dopey: 150
    Sneezy: 209
    Doc: 766
    Grumpy: 475
    Happy: 291
    Bashful: 655
    Sleepy: 398
    Snow White: 444
    """

    with st.form("input_form", clear_on_submit=False):
        txt = st.text_area("Spending history", default, height=400, label_visibility="collapsed")
        submitted = st.form_submit_button("Compute", type="primary")

    # Always save any edits, even if not computed yet
    if txt.strip():
        save_log(txt)

# ----------------------- Parser -----------------------
def parse_lines(t: str):
    data = {}
    for raw in t.splitlines():
        line = raw.strip()
        if not line:
            continue
        if ":" in line:
            k, v = line.split(":", 1)
        elif "," in line:
            k, v = line.split(",", 1)
        else:
            parts = line.split()
            if len(parts) != 2:
                raise ValueError(f"Bad line: {line!r}. Expected 'name: amount'")
            k, v = parts
        k = k.strip()
        v = float(v.strip())
        data[k] = data.get(k, 0.0) + v
    if not data:
        raise ValueError("No valid entries found.")
    return data

# ----------------------- Results -----------------------
if submitted:
    try:
        spending = parse_lines(txt)
        neg_names = [k for k, v in spending.items() if v < 0]
        if neg_names:
            raise ValueError(f"Negative values for {neg_names}")

        targets, transfers, balances_cents = greedy_pairing(spending)

        # summary numbers
        names = list(spending.keys())
        n = len(names)
        total_spent = sum(spending.values())
        nonzero_bal = sum(1 for b in balances_cents.values() if b != 0)
        min_edges = max(0, nonzero_bal - 1)
        per_person_avg = total_spent / n

        target_vals = list(targets.values())
        tgt_min, tgt_max = min(target_vals), max(target_vals)

        # tables
        people_rows = []
        for name in names:
            paid = spending[name]
            target = targets[name]
            bal = balances_cents[name] / 100.0
            status = "is owed" if bal > 0 else ("owes" if bal < 0 else "settled")
            people_rows.append(
                {"Name": name, "Paid": paid, "Target": target, "Balance": bal, "Status": status}
            )
        people_df = pd.DataFrame(people_rows).sort_values(by=["Status", "Balance"])

        transfers_rows = [{"Payer": p, "Receiver": r, "Amount": amt} for (p, r, amt) in transfers]
        transfers_df = pd.DataFrame(transfers_rows)

        # text report
        text = StringIO()
        text.write("Target spend per person (average): ")
        text.write(f"${per_person_avg:,.2f}\n")
        if tgt_min != tgt_max:
            text.write(f"Targets range due to rounding: ${tgt_min:,.2f} .. ${tgt_max:,.2f}\n")
        text.write("\nInitial balances:\n")
        text.write(describe_initial_balances(balances_cents))
        text.write("\n\nWho pays whom:\n")
        text.write(describe_transfers(transfers))
        text_report = text.getvalue()

        # layout: left panel -> summary ; right panel -> details
        left, right = st.columns([1, 2], gap="small")

        with left:
            st.subheader("📊 Summary")
            st.metric("Participants", n)
            st.metric("Total spent", f"${total_spent:,.2f}")
            st.metric("Per-person (avg)", f"${per_person_avg:,.2f}")
            if tgt_min != tgt_max:
                st.caption(f"Targets range: ${tgt_min:,.2f} – ${tgt_max:,.2f} (pennies)")
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
            tabs = st.tabs(["Initial balances", "Transfers", "Text output"])
            with tabs[0]:
                st.caption("If your balance is positive, you're owed money. If your balance is negative, check the transfers tab!")
                st.dataframe(
                    people_df.drop(columns=['Target']).style.format(
                        {"Paid": "${:,.2f}", "Balance": "${:,.2f}"}
                    ),
                    width='content',
                    hide_index=True,
                )
            with tabs[1]:
                st.caption("Here's a good way for everyone to settle up!")
                if transfers_df.empty:
                    st.info("No transfers needed. Everyone is already settled.")
                else:
                    st.dataframe(
                        transfers_df.style.format({"Amount": "${:,.2f}"}),
                        width='content',
                        hide_index=True,
                    )
            with tabs[2]:
                st.code(text_report, language="text")

    except Exception as e:
        st.error(str(e))
else:
    st.info("Add entries on the left and click **Compute**.")
