import pandas as pd
import zipfile
import xml.etree.ElementTree as ET
import json
import sys
import traceback

with open("analysis_output.txt", "w", encoding="utf-8") as out:
    out.write("--- EXCEL DATASET ---\n")
    try:
        df = pd.read_excel('Merged_Woredas_All.xlsx', nrows=5)
        out.write(f"Shape: {df.shape}\n")
        out.write(f"Columns: {df.columns.tolist()}\n")
        out.write(f"Data types:\n{df.dtypes}\n")
    except Exception as e:
        out.write(f"Excel error: {e}\n")
        
    out.write("\n--- DOCX CONTENT ---\n")
    try:
        with zipfile.ZipFile('G-5 Deep Learning Assignment.docx') as docx:
            xml_content = docx.read('word/document.xml')
            tree = ET.fromstring(xml_content)
            text = []
            for node in tree.iter():
                if node.tag.endswith('}t') and node.text:
                    text.append(node.text)
            out.write(' '.join(text)[:3000] + "\n")
    except Exception as e:
        out.write(f"Docx error: {e}\n")
        
    out.write("\n--- NOTEBOOK INFO ---\n")
    try:
        with open('Early Detection of Soil Erosion.ipynb', 'r', encoding='utf-8') as f:
            nb = json.load(f)
            out.write(f"Number of cells: {len(nb.get('cells', []))}\n")
            md_cells = [c.get('source', '') for c in nb.get('cells', []) if c.get('cell_type') == 'markdown']
            out.write("Markdown cells (first 10):\n")
            for c in md_cells[:10]:
                out.write(''.join(c) + "\n---\n")
    except Exception as e:
        out.write(f"Notebook error: {traceback.format_exc()}\n")
