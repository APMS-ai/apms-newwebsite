"""Regenerate DEPLOY.txt from what is actually in the site root.

The hand-kept version had drifted: five stylesheets that pages load were not
listed, so anyone following it would have uploaded a site with broken styling.
This derives the list instead, and records how to re-derive it.
"""
import io, os

os.chdir(os.environ['SITE'])

SKIP_DIRS = {'.git', '_standalone', 'docs', '.hallmark', 'node_modules', '.claude',
             '_snapshot_pre-restyle_20260724_122719', 'apms-enquiries'}
NEVER = ['.gitignore', '.gitattributes', 'CLAUDE.md', 'netlify.toml',
         'DEPLOY.txt', 'apms-site.zip', 'config.php', 'schema.sql']

upload = []
for root, dirs, files in os.walk('.'):
    dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
    for f in sorted(files):
        p = os.path.relpath(os.path.join(root, f), '.').replace(os.sep, '/')
        if p in NEVER or p.endswith('.csv'):
            continue
        top = p.split('/')[0]
        if top in ('css', 'js', 'assets') or p.endswith(('.html', '.php')) or p == '.htaccess':
            upload.append(p)

# referenced-asset sanity check: every css/js a page links must be in the list
refs = set()
for p in upload:
    if not p.endswith('.html'):
        continue
    s = io.open(p, encoding='utf-8').read()
    import re
    for m in re.finditer(r'(?:href|src)="((?:css|js|assets)/[^"?]+)', s):
        refs.add(m.group(1))
missing = sorted(refs - set(upload))

out = []
out.append('APMS.ai - what to upload over FTP')
out.append('=' * 40)
out.append('')
out.append('Host is Hostinger (LiteSpeed + PHP). There is no build step: the')
out.append('repository root IS the site, so this is a straight copy.')
out.append('')
out.append('Upload to the web root (public_html), keeping the folder structure.')
out.append('')
out.append('  .htaccess is a dotfile. Most FTP clients hide it by default, and')
out.append('  without it you lose HTTPS redirects, the old WordPress URL')
out.append('  redirects, the 404 page, caching and the security headers. Turn on')
out.append('  "show hidden files" or it will look like it uploaded and it will')
out.append('  not be there.')
out.append('')
out.append('  config.php is NOT in this list and is NOT in the repository. Copy')
out.append('  config.sample.php to config.php on the server and fill in the')
out.append('  database details. Without it the form still works and still keeps')
out.append('  every enquiry in the CSV, it just does not write to MySQL.')
out.append('')
out.append('This list is generated, not hand-kept. To refresh it after adding or')
out.append('removing files, re-run the generator in the scratchpad rather than')
out.append('editing here: the hand-kept version drifted and left five')
out.append('stylesheets off, which shipped a site with broken styling.')
out.append('')
out.append('-' * 40)
out.append('%d files' % len(upload))
out.append('-' * 40)
out.append('')
for p in upload:
    out.append('  ' + p)
out.append('')
out.append('Never upload these:')
out.append('')
for p in NEVER:
    out.append('  ' + p)
# Only warn about directories that are actually here. _standalone/ was listed
# unconditionally and stayed in the manifest after the previews were deleted,
# which is the same drift that made the hand-kept version wrong: a manifest
# nobody can trust is worse than no manifest.
for d, note in [('_standalone', '(unlinked previews, one pulls React from a CDN)'),
                ('docs', '(notes)'),
                ('apms-enquiries', '(the enquiry CSV, if it is ever inside the project)')]:
    if os.path.isdir(d):
        out.append('  %-21s %s' % (d + '/', note))
out.append('')
out.append('Run once on the server, in hPanel > Databases > phpMyAdmin > SQL:')
out.append('  the contents of schema.sql, which creates the enquiries table.')
out.append('')

io.open('DEPLOY.txt', 'w', encoding='utf-8', newline='').write('\n'.join(out))
print('DEPLOY.txt regenerated: %d files listed' % len(upload))
if missing:
    print('*** referenced but NOT in the upload list:')
    for m in missing:
        print('   ', m)
else:
    print('every css/js/asset referenced by a page is in the list: OK')
