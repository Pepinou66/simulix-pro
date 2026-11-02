import re, os, shutil
src='src'; html=open(f'{src}/index.html').read()
def inl(m):
    return '<script>\n'+open(f'{src}/'+m.group(1)).read()+'\n</script>'
out=re.sub(r'<script src="([^"]+)"></script>', inl, html)
os.makedirs('dist',exist_ok=True); open('dist/index.html','w').write(out)
os.makedirs('desktop/app',exist_ok=True); shutil.copy('dist/index.html','desktop/app/index.html')
print(len(out))
