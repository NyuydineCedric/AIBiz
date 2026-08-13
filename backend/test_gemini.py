import os
from dotenv import load_dotenv
load_dotenv()

key = os.getenv("GEMINI_API_KEY", "")
print("Key loaded:", bool(key), "| length:", len(key))

try:
    import google.generativeai as genai
    print("google-generativeai import: OK")
except Exception as e:
    print("IMPORT FAILED:", repr(e))
    raise SystemExit(1)

try:
    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    print("Model init: OK")
except Exception as e:
    print("MODEL INIT FAILED:", repr(e))
    raise SystemExit(1)

try:
    resp = model.generate_content("Say hello in one sentence.")
    print("GENERATE CONTENT OK:", resp.text)
except Exception as e:
    print("GENERATE CONTENT FAILED:", repr(e))
