import re, os, shutil, json
src = 'src'
ver = json.load(open('desktop/package.json', encoding='utf-8'))['version']
html = open(f'{src}/index.html', encoding='utf-8').read()
def inl(m):
    return '<script>\n' + open(f'{src}/' + m.group(1), encoding='utf-8').read() + '\n</script>'
out = re.sub(r'<script src="([^"]+)"></script>', inl, html).replace('__VERSION__', ver)
os.makedirs('dist', exist_ok=True)
open('dist/index.html', 'w', encoding='utf-8').write(out)
# version web installable (PWA) : manifeste, icônes, service worker
for f in os.listdir(f'{src}/pwa'):
    if f == 'sw.js':
        open('dist/sw.js', 'w', encoding='utf-8').write(open(f'{src}/pwa/sw.js', encoding='utf-8').read().replace('__VERSION__', ver))
    else:
        shutil.copy(f'{src}/pwa/{f}', f'dist/{f}')
os.makedirs('desktop/app', exist_ok=True)
shutil.copy('dist/index.html', 'desktop/app/index.html')
# application mobile (Capacitor)
os.makedirs('mobile/www', exist_ok=True)
shutil.copy('dist/index.html', 'mobile/www/index.html')
for f in ('icon-192.png', 'icon-512.png'):
    shutil.copy(f'dist/{f}', f'mobile/www/{f}')
print(len(out), ver)
