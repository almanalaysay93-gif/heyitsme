import json, time, os
from pathlib import Path
from playwright.sync_api import sync_playwright
# Uses intercepted local API responses only. No account or database writes.
# Start Vite on port 5178, then run: uv run --with playwright python scripts/check-builder.py
CARD=dict(id=28,displayName='Builder Test',title='Designer',company='Test Studio',email='test@example.com',phone='',location='Old city',bio='Test biography',links='[]',portfolio='[]',channels='[]',theme='midnight',avatarUrl='',coverUrl='',backgroundUrl='',slug='builder-test',published=False,page=json.dumps(dict(template='business',address='12 Test Street',contactPersons=[dict(name='Test Officer',role='Manager')],links=[dict(title='SHARE Potential Multi Organ Donor notification and referral registration',url='https://docs.google.com/forms/d/e/'+('AbCd0123456789'*8)+'/viewform?usp=header')])))
def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True)
  context=browser.new_context(viewport=dict(width=1440,height=1000))
  context.add_init_script("Object.defineProperty(navigator, 'share', {value: undefined, configurable: true})")
  page=context.new_page()
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def api(route):
   names=route.request.url.split('/api/trpc/')[1].split('?')[0].split(',')
   results=[]
   for name in names:
    if name=='auth.me':
     time.sleep(0.7)
     data=dict(id=1,name='Test Owner',email='owner@example.com',role='user')
    elif name=='publicCard.bySlug': data={**CARD,'published':True,'references':[]}
    elif name=='cards.list':
     time.sleep(0.3)
     data=[CARD]
    elif name=='billing.me': data=dict(entitlements=dict(plan='free',canRemoveBranding=False),usage={})
    elif name=='contacts.list': data=dict(items=[],nextCursor=None)
    elif name=='insights.summary': data=dict(daily=[],totals={})
    elif name=='references.list': data=[]
    elif name=='cards.update':
     body=json.loads(route.request.post_data or '{}')
     patch=body.get('0',body).get('json',{})
     CARD.update(patch)
     data=CARD
    else: data=None
    results.append(dict(result=dict(data=dict(json=data))))
   route.fulfill(content_type='application/json',body=json.dumps(results if 'batch=1' in route.request.url else results[0]))
  context.route('**/api/trpc/**',api)
  page.goto('http://127.0.0.1:5178/app/cards/28/edit')
  page.wait_for_timeout(3500)
  assert page.url.endswith('/app/cards/28/edit'), 'Direct edit redirected: '+page.url
  page.locator('#field-displayName').wait_for()
  assert page.locator('#field-displayName').input_value()=='Builder Test'
  assert page.get_by_text('Card not found.',exact=True).count()==0
  print('PASS delayed authentication direct edit')
  assert page.locator('#field-email').locator('xpath=ancestor::div[contains(@class,"form-section")][1]').get_by_role('heading',name='Contact & links',exact=True).count()==1
  assert page.locator('.mobile-floating-preview-btn').count()==0
  assert page.locator('#field-location').input_value()=='12 Test Street'
  assert page.locator('.lx-section-contactPersons').count()==1
  assert page.locator('.lx-byline-roster').count()==0
  page.get_by_role('button',name='Show Contact persons on page',exact=True).click()
  assert page.locator('.lx-section-contactPersons').count()==0
  page.get_by_role('button',name='Show Contact persons on page',exact=True).click()
  assert page.locator('.lx-section-contactPersons').count()==1
  page.get_by_role('button',name='Move Resource links up',exact=True).click()
  order=page.locator('[class*="lx-section-"]').evaluate_all('(els)=>els.map(e=>e.className)')
  assert next(i for i,x in enumerate(order) if 'lx-section-resourceLinks' in x)<next(i for i,x in enumerate(order) if 'lx-section-contactPersons' in x)
  page.get_by_role('button',name='Show Resource links on page',exact=True).click()
  assert page.locator('.lx-section-resourceLinks').count()==0
  page.get_by_role('button',name='Show Resource links on page',exact=True).click()
  print('PASS business visibility, ordering, single directory')
  page.get_by_role('radio',name='Professional',exact=False).click()
  assert page.get_by_role('button',name='Add contact person',exact=True).is_visible()
  assert page.get_by_role('button',name='Add link',exact=True).is_visible()
  assert not page.get_by_role('button',name='Add service',exact=True).is_visible()
  page.get_by_role('radio',name='Services',exact=False).click()
  assert page.get_by_role('button',name='Add contact person',exact=True).is_visible()
  assert page.get_by_role('button',name='Add link',exact=True).is_visible()
  assert page.get_by_role('button',name='Add service',exact=True).is_visible()
  assert not page.get_by_role('button',name='Add highlight',exact=True).is_visible()
  assert not page.get_by_label('Client name',exact=True).is_visible()
  page.get_by_role('radio',name='Business',exact=False).click()
  assert page.get_by_label('Contact person 1 name',exact=True).input_value()=='Test Officer'
  print('PASS optional template fields and preserved business content')
  page.locator('#field-email').fill('bad-email')
  assert page.locator('#field-email-error').is_visible()
  page.locator('#field-email').fill('test@example.com')
  page.locator('#field-phone').fill('letters ABC')
  assert page.locator('#field-phone-error').is_visible()
  page.locator('#field-phone').fill('')
  page.get_by_label('Button link',exact=False).fill('not a url')
  page.get_by_role('button',name='Save draft',exact=False).click()
  assert page.get_by_text('Complete or remove unfinished page fields before saving.',exact=True).is_visible()
  page.get_by_label('Button link',exact=False).fill('')
  page.get_by_role('button',name='Add highlight',exact=True).click()
  page.get_by_label('Highlight 1 value',exact=True).fill('12')
  page.locator('#field-location').fill('34 New Street')
  assert page.get_by_label('Highlight 1 value',exact=True).input_value()=='12'
  page.get_by_label('Highlight 1 label',exact=True).fill('years')
  page.get_by_role('button',name='Save draft',exact=False).click()
  page.wait_for_timeout(700)
  assert CARD['location']=='34 New Street', CARD['location']
  assert json.loads(CARD['page'])['address']=='34 New Street'
  assert json.loads(CARD['page'])['stats'][0]['value']=='12'
  print('PASS single address save and incomplete row retention')
  # Return to editor if save navigated.
  if not page.url.endswith('/edit'): page.goto('http://127.0.0.1:5178/app/cards/28/edit'); page.locator('#field-displayName').wait_for()
  for width in [360,390,430,1440]:
   page.set_viewport_size(dict(width=width,height=900))
   page.wait_for_timeout(250)
   dimensions=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
   assert dimensions['scroll']<=dimensions['width'],dimensions
   if width < 760: page.get_by_role('tab',name='Preview',exact=True).click()
   overflow=page.locator('.lx-section-resourceLinks .lx-contact li').evaluate_all('''els => els.flatMap(tile => {
     const bounds=tile.getBoundingClientRect();
     return [...tile.querySelectorAll('strong, small, svg')].filter(el => {
       const r=el.getBoundingClientRect();
       return r.left < bounds.left - 1 || r.right > bounds.right + 1 || el.scrollWidth > el.clientWidth + 1;
     }).map(el => el.tagName);
   })''')
   assert not overflow, f'Resource content overflow at {width}px: {overflow}'
   if width==390:
    page.screenshot(path=str(Path(os.environ['TEMP'])/'heyitsme-builder-mobile.png'),full_page=True)
    page.get_by_role('tab',name='Preview',exact=True).click()
    assert page.locator('#builder-preview-panel').is_visible()
    page.get_by_role('tab',name='Edit',exact=True).click()
   if width < 760: page.get_by_role('tab',name='Edit',exact=True).click()
   if width==1440: page.screenshot(path=str(Path(os.environ['TEMP'])/'heyitsme-builder-desktop.png'),full_page=True)
  page.goto('http://127.0.0.1:5178/app/cards/999999/edit')
  page.get_by_role('heading',name='Card not found',exact=True).wait_for()
  assert page.url.endswith('/999999/edit')
  page.goto('http://127.0.0.1:5178/c/demo')
  page.locator('.lx-section-resourceLinks').wait_for()
  assert page.locator('.lx-hero a[href*="google.com/maps"]').count() > 0
  assert page.locator('.lx-nav-share:not(.lx-nav-copy)').inner_text() == 'Copy link'
  for width in [360,390,430,844,1440]:
   page.set_viewport_size(dict(width=width,height=900))
   page.wait_for_timeout(200)
   tile=page.locator('.lx-section-resourceLinks .lx-contact li')
   assert tile.count()==1
   assert tile.evaluate("el => el.scrollWidth <= el.clientWidth + 1"), f'Public resource overflow at {width}px'
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Public page overflow at {width}px'
   title=tile.locator('strong')
   assert title.evaluate("el => getComputedStyle(el).whiteSpace === 'normal' && el.scrollWidth <= el.clientWidth + 1")
   if width==390: page.locator('.lx-section-resourceLinks').screenshot(path=str(Path(os.environ['TEMP'])/'heyitsme-resource-mobile.png'))
  print('PASS public resource title and long URL at 360/390/430/844/1440px')
  page.goto('http://127.0.0.1:5178/app/cards/new')
  page.get_by_role('radio',name='Professional',exact=False).wait_for()
  for template in ['Professional','Services','Business']:
   page.get_by_role('radio',name=template,exact=False).click()
   assert page.get_by_role('button',name='Add contact person',exact=True).is_visible(), template
   assert page.get_by_role('button',name='Add link',exact=True).is_visible(), template
  print('PASS empty contact-person and resource editors on every template')
  assert not errors,errors
  print('PASS mobile 360/390/430, desktop 1440, preview tabs, no runtime errors')
  browser.close()
if __name__=='__main__': run()
