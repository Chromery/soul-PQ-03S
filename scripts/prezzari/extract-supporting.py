"""Read XLSX without executing macros, formulas or external links; preserve cached cells only."""
import hashlib, json, os, pathlib, zipfile, xml.etree.ElementTree as ET
root = pathlib.Path(os.environ.get('PRICE_SOURCE_DIR', '00_prezzari2026'))
cache = pathlib.Path(os.environ.get('PRICE_CACHE_DIR', '.cache/prezzari'))
inventory = json.loads((cache / 'inventory.json').read_text())
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for file in sorted(root.rglob('*')):
    if file.suffix.lower() not in ('.xlsx', '.txt'): continue
    raw = file.read_bytes(); sha = hashlib.sha256(raw).hexdigest()
    relative = str(file.relative_to(root)); pages = []
    if file.suffix.lower() == '.xlsx':
        with zipfile.ZipFile(file) as z:
            strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                strings = [''.join(t.text or '' for t in item.findall('.//s:t', ns)) for item in ET.fromstring(z.read('xl/sharedStrings.xml'))]
            wb = ET.fromstring(z.read('xl/workbook.xml'))
            rel = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            links = {r.attrib['Id']: r.attrib['Target'] for r in rel}
            for sheet in wb.findall('.//s:sheet', ns):
                target = links[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
                target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
                rows = []
                for row in ET.fromstring(z.read(target)).findall('.//s:row', ns):
                    cells = []
                    for c in row.findall('s:c', ns):
                        v = c.find('s:v', ns); value = v.text if v is not None else ''
                        if c.attrib.get('t') == 's' and value: value = strings[int(value)]
                        elif c.attrib.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in c.findall('.//s:t', ns))
                        formula = c.find('s:f', ns)
                        if formula is not None: value = '[formula, non prezzo autonomo] ' + (value or '')
                        if value: cells.append(c.attrib.get('r', '') + ': ' + value)
                    if cells: rows.append(' | '.join(cells))
                for n in range(0, len(rows), 40):
                    pages.append({'page': len(pages)+1, 'label': 'Foglio ' + sheet.attrib['name'] + ' · blocco ' + str(n//40+1), 'text': '\n'.join(rows[n:n+40]), 'method': 'spreadsheet'})
    else:
        pages = [{'page': 1, 'label': 'Documento di supporto', 'text': raw.decode('utf-8', errors='replace'), 'method': 'text'}]
    doc = {'sha256': sha, 'pageCount': len(pages), 'format': file.suffix.lower()[1:], 'pages': pages}
    (cache / (sha + '.json')).write_text(json.dumps(doc))
    inventory = [d for d in inventory if d['file'] != relative]
    inventory.append({'file': relative, 'sha256': sha, 'pageCount': len(pages), 'format': doc['format'], 'textPages': len(pages), 'chars': sum(len(p['text']) for p in pages)})
    print(relative, len(pages), 'blocks')
(cache / 'inventory.json').write_text(json.dumps(inventory, indent=2))
