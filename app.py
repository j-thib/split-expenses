import streamlit as st
import numpy as np
from io import StringIO
from contextlib import redirect_stdout
from share_expenses import share_expenses

st.set_page_config(page_title="Share expenses", page_icon="💸", layout="centered")
st.title("💸 Share expenses")

st.markdown("Paste one `name: amount` per line (commas or spaces also work).")

default = """person 1: 1000
person 2: 100
person 3: 650
"""
txt = st.text_area("Spending history", default, height=180)

def parse_lines(t: str) -> dict[str, float]:
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

if st.button("Compute"):
    try:
        spending = parse_lines(txt)
        neg_names = [k for k, v in spending.items() if v < 0]
        if neg_names:
            raise ValueError(f"Negative values for {neg_names}")
        buf = StringIO()
        with redirect_stdout(buf):
            share_expenses(spending)
        st.code(buf.getvalue() or "(no output)", language="text")
    except Exception as e:
        st.error(str(e))
