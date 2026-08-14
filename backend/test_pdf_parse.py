import sys
sys.path.insert(0, ".")
from app.services import data_parser

path = input("Paste the full path to the FY24 PDF: ").strip()
result = data_parser.parse_pdf_file(path)

print("=== numeric_summary keys ===")
print(list(result["numeric_summary"].keys()))
print("\n=== text_excerpt (first 1500 chars) ===")
print(result["text_excerpt"][:1500])
