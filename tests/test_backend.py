import sys, types, asyncio, tempfile, pathlib, json, importlib.util, shutil
import os
ROOT = str(pathlib.Path(__file__).resolve().parents[1]); os.chdir(ROOT)
sys.dont_write_bytecode = True
def mod(name, **attrs):
    m = types.ModuleType(name); m.__dict__.update(attrs); sys.modules[name] = m; return m
mod('voluptuous', Required=lambda k: k, Optional=lambda k: k, Schema=lambda d: d)
mod('homeassistant'); mod('homeassistant.components')
def websocket_command(schema):
    def deco(f): f._schema = schema; return f
    return deco
ws = mod('homeassistant.components.websocket_api', websocket_command=websocket_command, async_response=lambda f: f, async_register_command=lambda hass, f: None)
panel = {}
async def async_register_panel(hass, **kw): panel.update(kw)
pc = mod('homeassistant.components.panel_custom', async_register_panel=async_register_panel)
class HomeAssistantView:
    def json_message(self, msg, code=200): return ('json', code, msg)
    def json(self, d): return ('json', 200, d)
    def json_message(self, msg, code=200): return ('json', code, msg)
class StaticPathConfig:
    def __init__(self, *a): self.a = a
mod('homeassistant.components.http', HomeAssistantView=HomeAssistantView, StaticPathConfig=StaticPathConfig)
sys.modules['homeassistant.components'].websocket_api = ws; sys.modules['homeassistant.components'].panel_custom = pc
mod('homeassistant.core', HomeAssistant=object, callback=lambda f: f, ServiceCall=object, SupportsResponse=types.SimpleNamespace(ONLY='only'))
mod('homeassistant.helpers')
mod('homeassistant.helpers.config_validation', empty_config_schema=lambda d: {}, string=str)
class IntentHandler:
    def async_validate_slots(self, slots): return slots
class _Resp:
    def __init__(self): self.speech=None
    def async_set_speech(self, t): self.speech=t
class _Intent:
    def __init__(self, hass, slots): self.hass=hass; self.slots=slots
    def create_response(self): return _Resp()
registered=[]
intent_mod = mod('homeassistant.helpers.intent', IntentHandler=IntentHandler, Intent=_Intent, IntentResponse=_Resp, async_register=lambda hass, h: registered.append(h))
mod('homeassistant.helpers.event', async_track_time_interval=lambda hass, f, iv: None)
notes = []
pn = mod('homeassistant.components.persistent_notification', async_create=lambda hass, msg, title=None, notification_id=None: notes.append(('create', notification_id, msg)), async_dismiss=lambda hass, nid: notes.append(('dismiss', nid)))
sys.modules['homeassistant.components'].persistent_notification = pn
sys.modules['homeassistant.helpers'].intent = intent_mod
sys.modules['homeassistant.helpers'].config_validation = sys.modules['homeassistant.helpers.config_validation']
class Store:
    def __init__(self, hass, v, key): self.saved=None; self.version=v
    legacy=None; legacy_version=1
    async def _async_migrate_func(self, a, b, c): raise NotImplementedError
    async def async_load(self):
        # как в настоящем Home Assistant: данные другой версии проходят через _async_migrate_func
        if Store.legacy is not None and getattr(Store,'legacy_version',1) != self.version:
            return await self._async_migrate_func(Store.legacy_version, 1, Store.legacy)
        return Store.legacy
    async def async_save(self, d): self.saved = json.loads(json.dumps(d))
    def async_delay_save(self, f, delay=0): self.saved = json.loads(json.dumps(f()))
mod('homeassistant.helpers.storage', Store=Store); mod('homeassistant.helpers.typing', ConfigType=dict)
class Resp:
    def __init__(self, body=b'', content_type='', headers=None, status=200, charset=None): self.body=body; self.status=status; self.headers=headers or {}
web = types.SimpleNamespace(Response=Resp, Request=object); mod('aiohttp', web=web); sys.modules['aiohttp.web']=web
tmp = pathlib.Path(tempfile.mkdtemp()); svc = {}
class Bus:
    def __init__(self): self.events=[]
    def async_fire(self, n, d): self.events.append((n,d))
class Http:
    def __init__(self): self.views=[]; self.static=[]
    def register_view(self, v): self.views.append(v)
    async def async_register_static_paths(self, l): self.static += l
class Hass:
    def __init__(self):
        self.data={}; self.bus=Bus(); self.http=Http(); self.services=types.SimpleNamespace(async_register=lambda *a, **kw: svc.update({a[1]: a[2]}))
        self.config=types.SimpleNamespace(path=lambda *p: str(tmp.joinpath(*p)))
    async def async_add_executor_job(self, f, *a): return f(*a)
spec = importlib.util.spec_from_file_location('korobki', ROOT+'/custom_components/korobki/__init__.py', submodule_search_locations=[ROOT+'/custom_components/korobki'])
k = importlib.util.module_from_spec(spec); sys.modules['korobki']=k; spec.loader.exec_module(k)
V = sys.modules['korobki.voice']; G = sys.modules['korobki.gc']; M = sys.modules['korobki.model']
class Req:
    def __init__(self, body): self._b=body
    async def json(self): return self._b
Store.legacy={'rev':5,'root':{'id':'root','t':'home','n':'Мой дом','ch':[{'id':'p1','t':'place','n':'Кладовка','ph':[],'ch':[{'id':'b1','t':'box','n':'Инстр','ph':['0123456789abcdef'],'ch':[{'id':'i1','t':'item','n':'Молоток','q':2,'tg':['c1'],'note':'н','ph':[]}]}]}]},'settings':{'qr':'web','base':'x','cats':[{'id':'c1','n':'Инструмент','c':'#f00'}]}}
async def main():
    h = Hass(); assert await k.async_setup(h, {}) is True
    assert panel['module_url'].endswith('?v=0.10.0'), panel['module_url']
    d=h.data['korobki']['data']; R=d['recs']
    assert R['root']['n']=='Мой дом' and R['i1']['p']=='b1' and R['i1']['q']==2 and R['i1']['tg']==['c1'] and R['c1']['t']=='cat' and R['settings']['qr']=='web', R
    sv=[v for v in h.http.views if isinstance(v,k.SyncView)][0]
    import time as _t0; now=int(_t0.time()*1000)-60000
    def rec(i,u,n='x',d=False,t='item',p='b1'): return {'id':i,'p':p,'t':t,'n':n,'u':u,'d':d,'q':1}
    st,code,out=await sv.post(Req({'since':0,'records':[]})); assert out['version']=='0.10.0' and len(out['records'])==len(R)
    rev=out['rev']
    # новая запись принимается, возвращается эхом
    st,_,o=await sv.post(Req({'since':rev,'records':[rec('n1',now,'Новая')]})); assert [r['id'] for r in o['records']]==['n1'] and o['rev']==rev+1
    # более старая правка отклоняется, клиент получает серверную версию
    st,_,o=await sv.post(Req({'since':o['rev'],'records':[rec('n1',now-5,'Старая')]})); assert o['records'][0]['n']=='Новая' and o['rev']==rev+1
    # удаление (tombstone) новее: принимается
    st,_,o=await sv.post(Req({'since':o['rev'],'records':[rec('n1',now+5,'',True)]})); assert o['records'][0]['d'] is True
    # мусор отбрасывается
    st,_,o=await sv.post(Req({'since':0,'records':[{'id':5},{'id':'z','u':1,'t':'bad'}]})); assert all(r['id'] not in ('z',) for r in o['records'])
    st,code,_=await sv.post(Req([1])); assert code==400
    # фото PUT
    pv=[v for v in h.http.views if type(v).__name__=='PhotoView'][0]
    class B:
        async def read(self): return b'\xff\xd8\xff\xe0abc'
    r=await pv.put(B(),'0123456789abcdef'); assert r[2]=={'ok':True}
    r=await pv.put(B(),'bad'); assert r[1]==400
    av=[v for v in h.http.views if type(v).__name__=='AppView'][0]
    assert av.url=='/korobki_app/{filename}' and '/korobki_app/' in av.extra_urls and '/korobki_app' in av.extra_urls and av.requires_auth is False
    for fn in ('index.html','sw.js','manifest.json','icon-192.png'):
        rsp=await av.get(None,fn); assert rsp.status==200 and rsp.body, fn
    assert b'<title>' in (await av.get(None)).body
    assert (await av.get(None,'../__init__.py'))[1]==404 and (await av.get(None,'secret.txt'))[1]==404
    jv=[v for v in h.http.views if type(v).__name__=='PanelJsView'][0]
    body=(await jv.get(None)).body.decode()
    assert '__KOROBKI_VERSION__' not in body and "var VERSION = '0.10.0';" in body, body[:300]
    # поиск «где лежит»
    import os, time as _t
    R=h.data['korobki']['data']['recs']
    out=V.find_items(R,'где лежит молоток'); assert out['count']==1 and 'коробка Инстр' in out['answer'] and 'место Кладовка' in out['answer'], out
    out2=V.find_items(R,'Молотка'); assert out2['count']==1, out2
    assert V.find_items(R,'пылесос')['count']==0
    res=await svc['find'](types.SimpleNamespace(data={'query':'молоток'})); assert res['count']==1
    r=await registered[0].async_handle(_Intent(h,{'thing':{'value':'молоток'}})); assert 'Молоток' in r.speech, r.speech
    assert (tmp/'custom_sentences'/'ru'/'korobki.yaml').exists()
    # корзина: старая отметка теряет содержимое, свежая нет
    d=h.data['korobki']['data']
    old=int(_t.time()*1000)-40*86400000
    d['recs']['i1'].update(d=True,u=old); d['recs']['b1'].update(d=True,u=int(_t.time()*1000))
    assert G.compact(d) is True and d['recs']['i1']['n']=='' and d['recs']['b1']['n']=='Инстр'
    # фото: на фото i1 ссылка пропала, b1 держит свою
    pd=h.data['korobki']['photo_dir']
    (pd/'aaaaaaaaaaaaaaaa.jpg').write_bytes(b'\xff\xd8\xff1'); (pd/'aaaaaaaaaaaaaaaa_t.jpg').write_bytes(b'\xff\xd8\xff2')
    (pd/'0123456789abcdef.jpg').write_bytes(b'\xff\xd8\xff3')
    old_t=_t.time()-3*86400
    for f in pd.glob('*.jpg'): os.utime(f,(old_t,old_t))
    (pd/'bbbbbbbbbbbbbbbb.jpg').write_bytes(b'\xff\xd8\xff4')  # свежее: не трогать
    stv=[v for v in h.http.views if type(v).__name__=='StatsView'][0]
    _,_,sx=await stv.get(None); assert sx['orphans']==2 and sx['photos']>=3, sx
    cv_=[v for v in h.http.views if type(v).__name__=='CleanupView'][0]
    _,_,cx=await cv_.post(None); assert cx['removed']==2, cx
    assert not (pd/'aaaaaaaaaaaaaaaa.jpg').exists() and (pd/'0123456789abcdef.jpg').exists() and (pd/'bbbbbbbbbbbbbbbb.jpg').exists()
    print('PY_OK 0.10.0 recs', len(h.data['korobki']['data']['recs']))

async def main2():
    import time as T
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    sv=[v for v in h.http.views if type(v).__name__=='SyncView'][0]
    lv=[v for v in h.http.views if type(v).__name__=='LogView'][0]
    cvw=[v for v in h.http.views if type(v).__name__=='ConflictView'][0]
    d=h.data['korobki']['data']; now=int(T.time()*1000)
    def R(i,t,p,n='x',u=None,**kw):
        r={'id':i,'t':t,'p':p,'n':n,'u':u or now,'d':False,'q':1 if t=='item' else None}; r.update(kw); return r
    async def push(dev,recs,since=0):
        return (await sv.post(Req({'since':since,'device':dev,'label':'тест '+dev,'records':recs})))[2]
    base=[R('root','home',None,'Дом'),R('pl','place','root','Кладовка'),R('bx','box','pl','Коробка'),R('c1','cat',None,'К1'),R('it','item','bx','Шапка')]
    o=await push('A',[dict(r,dv='A',us=i+1) for i,r in enumerate(base)]); assert not o['conflicts'] and o['fixes']==0, o['conflicts']
    r0=[x for x in o['records'] if x['id']=='it'][0]['r']
    # 1) последовательная правка с отстающими часами принимается (устройство видело актуальную ревизию)
    o=await push('B',[R('it','item','bx','Шапка2',u=now-3600000,dv='B',us=1,br=r0)])
    it=[x for x in o['records'] if x['id']=='it'][0]; assert it['n']=='Шапка2' and it['u']>now, it; assert not o['conflicts']
    r1=it['r']
    # 2) одновременные правки: A и B оба основаны на r1
    o=await push('A',[R('it','item','bx','От A',u=now+1000,dv='A',us=10,br=r1)]); r2=[x for x in o['records'] if x['id']=='it'][0]['r']
    o=await push('B',[R('it','item','bx','От B',u=now+3000,dv='B',us=2,br=r1)])
    assert len(o['conflicts'])==1 and o['conflicts'][0]['win']=='device' and o['conflicts'][0]['lost']['n']=='От A' and o['conflicts'][0]['fields']==['n'], o['conflicts']
    assert [x for x in o['records'] if x['id']=='it'][0]['n']=='От B' and o['nconf']==1
    # то же, но правка слабее по времени: проигрывает, клиент получает серверную версию
    r3=[x for x in o['records'] if x['id']=='it'][0]['r']
    o=await push('A',[R('it','item','bx','Старая',u=now+500,dv='A',us=11,br=r1)])
    assert o['conflicts'][0]['win']=='server' and o['conflicts'][0]['lost']['n']=='Старая' and [x for x in o['records'] if x['id']=='it'][0]['n']=='От B' and o['nconf']==2
    # 3) повтор устаревшей пачки того же устройства игнорируется
    # (настоящий повтор несёт старую ревизию br; если устройство видело текущую версию, правка новее — см. PY7)
    o=await push('B',[R('it','item','bx','Повтор',u=now+9000,dv='B',us=1,br=r1)]); assert [x for x in o['records'] if x['id']=='it'][0]['n']=='От B' and o['stale']==['it']
    # 4) метка времени из будущего заменяется временем сервера
    o=await push('C',[R('fut','item','bx','Из будущего',u=now+86400000,dv='C',us=1)]); f=[x for x in o['records'] if x['id']=='fut'][0]; assert f['u']<now+60000, f['u']
    assert d['log'][-1]['clk']==1
    # 5) граф: родитель не существует, цикл, вещь в вещи, место в коробке, мусорные категории
    bad=[R('orph','item','nope','Сирота'),
         R('b1','box','b2','Ц1'),R('b2','box','b1','Ц2'),
         R('ii','item','it','Вещь в вещи'),
         R('pp','place','bx','Место в коробке'),
         R('tg','item','bx','Теги',tg=['c1','c1','нет'])]
    o=await push('A',[dict(r,dv='A',us=100+i) for i,r in enumerate(bad)])
    RC=d['recs']; assert o['fixes']>=5, o['fixlist']
    assert RC['lost']['t']=='place' and RC['lost']['p']=='root' and RC['orph']['p']=='lost' and RC['ii']['p']=='lost', (RC['orph'],RC['ii'])
    assert RC['pp']['p']=='root'
    assert (RC['b1']['p']=='lost') != (RC['b2']['p']=='lost') or 'lost' in (RC['b1']['p'],RC['b2']['p']), (RC['b1']['p'],RC['b2']['p'])
    assert RC['tg']['tg']==['c1']
    # все живые узлы достижимы от корня
    kids={}
    for r in RC.values():
        if not r['d'] and r['t'] in ('place','box','item'): kids.setdefault(r['p'],[]).append(r['id'])
    seen=set(); st=['root']
    while st:
        c=st.pop()
        if c in seen: continue
        seen.add(c); st+=kids.get(c,[])
    live=[r['id'] for r in RC.values() if not r['d'] and r['t'] in ('place','box','item')]
    assert all(i in seen for i in live), [i for i in live if i not in seen]
    # удалённый родитель с живым потомком (удаление на одном устройстве, добавление на другом)
    o=await push('A',[dict(R('bx','box','pl','Коробка',d=True,u=now+20000),dv='A',us=200)])
    assert RC['it']['p']=='lost' and RC['tg']['p']=='lost'
    # журнал и конфликты по HTTP
    _,_,lg=await lv.get(None); assert lg['log'] and lg['conflicts'] and 'A' in lg['devices'] and lg['log'][0]['t']>=lg['log'][-1]['t']
    cid=lg['conflicts'][0]['id']; _,_,rr=await cvw.post(None,cid); assert rr['nconf']==len(lg['conflicts'])-1
    # результат сохраняется в хранилище
    assert h.data['korobki']['store'].saved['conflicts'] is not None
    print('PY2_OK', len(d['log']), 'log entries,', len(d['conflicts']), 'conflicts')
async def main3():
    import time as T, hashlib, os, stat
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    sv=[v for v in h.http.views if type(v).__name__=='SyncView'][0]
    d=h.data['korobki']['data']; now=int(T.time()*1000)
    # пакетная синхронизация: сервер принимает не более MAX за запрос и говорит, сколько осталось
    CN=sys.modules['korobki.const']
    recs=[{'id':'root','t':'home','p':None,'n':'Дом','u':now,'d':False}]+[{'id':'p%d'%i,'t':'place','p':'root','n':'М%d'%i,'u':now,'d':False,'q':None} for i in range(CN.MAX_RECORDS_PER_SYNC+120)]
    o=(await sv.post(Req({'since':0,'device':'A','records':recs})))[2]
    assert o['rest']==len(recs)-CN.MAX_RECORDS_PER_SYNC, o['rest']
    assert len([r for r in d['recs'].values() if r['t']=='place'])==CN.MAX_RECORDS_PER_SYNC-1
    o=(await sv.post(Req({'since':0,'device':'A','records':recs[CN.MAX_RECORDS_PER_SYNC:]})))[2]; assert o['rest']==0
    # постраничное скачивание: курсор since идёт вперёд, ни одна запись не теряется и не дублируется
    got={}; since=0; pages=0
    while True:
        o=(await sv.post(Req({'since':since,'device':'B','records':[]})))[2]; pages+=1
        for r in o['records']: got[r['id']]=r
        assert o['rev']>=since
        if not o['more']: break
        assert o['rev']>since and len(o['records'])<=CN.PULL_LIMIT+200; since=o['rev']
        assert pages<50
    assert pages>=2 and set(got)==set(d['recs']), (pages, len(got), len(d['recs']))
    assert o['head']==d['rev']
    # фото: ETag вместо immutable, повтор с If-None-Match даёт 304
    PV=sys.modules['korobki.views_photo']
    class RQ:
        def __init__(self, h=None): self.headers=h or {}
    r1=PV._photo_response(RQ(), b'\xff\xd8\xffabc'); assert 'immutable' not in r1.headers['Cache-Control'] and r1.headers['ETag'] and r1.status==200
    r2=PV._photo_response(RQ({'If-None-Match': r1.headers['ETag']}), b'\xff\xd8\xffabc'); assert r2.status==304
    r3=PV._photo_response(RQ({'If-None-Match': r1.headers['ETag']}), b'\xff\xd8\xffchanged'); assert r3.status==200 and r3.headers['ETag']!=r1.headers['ETag']
    # автокопия: файл создан, проверка чтением, ротация, уведомление при ошибке
    B=sys.modules['korobki.backup']; notes.clear()
    st=await B.run_backup(h,'manual'); assert st['ok'] and st['recs']==len(d['recs']), st
    f=pathlib.Path(h.config.path(CN.BACKUP_DIR))/st['name']; j=json.loads(f.read_text('utf-8')); assert j['app']=='korobki' and len(j['recs'])==len(d['recs'])
    assert ('dismiss','korobki_backup_failed') in notes
    folder=pathlib.Path(h.config.path(CN.BACKUP_DIR))
    for i in range(CN.BACKUP_KEEP+5): (folder/('korobki-auto-2000-01-%02d_000000.json'%(i+1))).write_text('{}'); os.utime(folder/('korobki-auto-2000-01-%02d_000000.json'%(i+1)),(1000+i,1000+i))
    st=await B.run_backup(h,'manual'); files=B._list(folder); assert len(files)==CN.BACKUP_KEEP and files[0]['name']==st['name'], len(files)
    bv=[v for v in h.http.views if type(v).__name__=='BackupView'][0]; _,_,g=await bv.get(None); assert g['last']['ok'] and g['count']==CN.BACKUP_KEEP
    notes.clear(); folder2=folder
    # ошибка записи: папка занята файлом, уведомление и событие
    shutil_ = __import__('shutil'); shutil_.rmtree(folder); folder.write_text('занято')
    st=await B.run_backup(h,'schedule'); assert not st['ok'] and st['error'] and any(n[0]=='create' for n in notes), st
    assert any(e[0]=='korobki_backup_failed' for e in h.bus.events)
    folder.unlink()
    st=await B.run_backup(h,'schedule'); assert st['ok'] and ('dismiss','korobki_backup_failed') in notes
    print('PY3_OK paging', pages, 'pages')
async def main4():
    # п.1 безопасность: строгие id, цвет, родитель, категории, устройство, адрес; чистка при запуске
    import time as T
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    sv=[v for v in h.http.views if type(v).__name__=='SyncView'][0]
    d=h.data['korobki']['data']; now=int(T.time()*1000)
    BAD=['a"><img src=x onerror=alert(1)>','a b','привет','x'*65,"a'b",'a;b','',' ']
    recs=[{'id':'root','t':'home','p':None,'n':'Дом','u':now}]
    recs+=[{'id':b,'t':'place','p':'root','n':'bad','u':now} for b in BAD]
    recs+=[{'id':'ok1','t':'place','p':'root','n':'<b>ok</b>','c':'red;background:url(x)','u':now},
           {'id':'ok2','t':'place','p':'root','n':'ok2','c':'#FFA000','u':now,'dv':'x" onclick="1'},
           {'id':'cat1','t':'cat','p':None,'n':'К','c':'#12345','u':now},
           {'id':'bx','t':'box','p':'ok2"><script>','n':'b','u':now,'tg':['cat1','"><x','a b'],'ph':['0123456789abcdef','../../etc/passwd']},
           {'id':'settings','t':'settings','p':None,'n':'','u':now,'base':'javascript:alert(1)','qr':'web'}]
    o=(await sv.post(Req({'since':0,'device':'dev"1','label':'<img onerror=1>"x','records':recs})))[2]
    r=d['recs']
    assert not any(b in r for b in BAD), [b for b in BAD if b in r]
    assert r['ok1']['c'] is None and r['ok2']['c']=='#FFA000' and r['cat1']['c'] is None
    assert r['ok2']['dv']=='' or r['ok2']['dv']=='server', r['ok2']['dv']
    assert r['bx']['tg']==['cat1'] and r['bx']['ph']==['0123456789abcdef'], r['bx']
    assert r['bx']['p']!='ok2"><script>'
    assert r['settings']['base']==''
    assert not d['devices'] or all(__import__('re').match(r'^[A-Za-z0-9_-]{1,64}$',x) for x in d['devices']), d['devices']
    for e in d['log']: assert '<' not in str(e.get('lb','')) and '"' not in str(e.get('lb',''))
    # запись берёт id устройства только с запроса, а не из записи
    # чистка при запуске: испорченное хранилище исправляется
    Store.legacy={'rev':5,'recs':{'root':{'id':'root','t':'home','p':None,'n':'Дом','u':1,'d':False,'r':1,'c':None,'tg':[],'ph':[],'note':'','o':0,'qr':'','base':'','dv':'','q':None},
        'ev"il':{'id':'ev"il','t':'place','p':'root','n':'x','u':1,'d':False,'r':2,'c':None,'tg':[],'ph':[],'note':'','o':0,'qr':'','base':'','dv':'','q':None},
        'good':{'id':'good','t':'place','p':'root','n':'ok','u':1,'d':False,'r':3,'c':'url(javascript:1)','tg':['"><x'],'ph':[],'note':'','o':0,'qr':'','base':'','dv':'','q':None}}}
    h2=Hass(); assert await k.async_setup(h2,{}) is True
    d2=h2.data['korobki']['data']
    assert 'ev"il' not in d2['recs'] and d2['recs']['good']['c'] is None and d2['recs']['good']['tg']==[], d2['recs']
    print('PY4_OK xss')
async def main5():
    # п.4 уборка фото: в поток-исполнитель уходит неизменяемый снимок, а не живые записи
    import time as T, os
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    st=h.data['korobki']; d=st['data']; pd=st['photo_dir']; now=int(T.time()*1000)
    d['recs']['p1']={'id':'p1','t':'item','p':None,'n':'x','u':now,'d':False,'r':1,'ph':['aaaaaaaaaaaaaaaa'],'tg':[],'c':None,'note':'','o':0,'qr':'','base':'','dv':'','q':None}
    for pid in ('aaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbb'):
        f=pd/(pid+'.jpg'); f.write_bytes(b'x'); os.utime(f,(T.time()-10**6,)*2)
    seen=[]
    async def ex(f,*a):
        seen.append(a)
        # во время работы потока основной поток меняет записи и в итерируемом словаре
        d['recs']['p1']['ph']=[]; d['recs']['new']={'id':'new','ph':['cccccccccccccccc']}
        return f(*a)
    h.async_add_executor_job=ex
    res=await G.run_gc(h,0)
    assert not isinstance(seen[0][1],dict), 'в исполнитель ушёл живой словарь'
    assert (pd/'aaaaaaaaaaaaaaaa.jpg').exists() and not (pd/'bbbbbbbbbbbbbbbb.jpg').exists(), res
    assert G.used_photos(d['recs'])=={'cccccccccccccccc'}
    # потоковая гонка: запись меняется во время обхода
    import threading
    stop=threading.Event(); errs=[]
    def churn():
        i=0
        while not stop.is_set():
            d['recs']['z%d'%(i%50)]={'id':'z','ph':['dddddddddddddddd']}; d['recs'].pop('z%d'%((i+25)%50),None); i+=1
    t=threading.Thread(target=churn); t.start()
    try:
        for _ in range(200): G.used_photos(d['recs'])
    except RuntimeError as e: errs.append(e)
    stop.set(); t.join()
    print('PY5_OK gc snapshot')
async def main6():
    # п.5 id устройства ставит сервер, dv из записи игнорируется
    import time as T
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    sv=[v for v in h.http.views if type(v).__name__=='SyncView'][0]
    d=h.data['korobki']['data']; now=int(T.time()*1000)
    root={'id':'root','t':'home','p':None,'n':'Дом','u':now}
    await sv.post(Req({'since':0,'device':'A','label':'a','records':[root,{'id':'v1','t':'place','p':'root','n':'one','u':now,'dv':'A','us':1}]}))
    assert d['recs']['v1']['dv']=='A'
    # устройство B выдаёт себя за A и шлёт огромный счётчик, чтобы заблокировать правки A
    await sv.post(Req({'since':0,'device':'B','label':'b','records':[{'id':'v1','t':'place','p':'root','n':'evil','u':now+5,'dv':'A','us':10**9,'br':d['rev']}]}))
    assert d['recs']['v1']['dv']=='B' and d['recs']['v1']['n']=='evil', d['recs']['v1']
    # без device (старый клиент) dv из записи не принимается
    await sv.post(Req({'since':0,'records':[{'id':'v2','t':'place','p':'root','n':'old','u':now,'dv':'A','us':5}]}))
    assert d['recs']['v2']['dv']=='', d['recs']['v2']
    # A дальше спокойно правит со своим счётчиком, после подмены блокировки нет
    o=(await sv.post(Req({'since':0,'device':'A','label':'a','records':[{'id':'v1','t':'place','p':'root','n':'fixed','u':now+10,'dv':'A','us':2,'br':d['rev']}]})))[2]
    assert d['recs']['v1']['n']=='fixed' and d['recs']['v1']['dv']=='A'
    print('PY6_OK device id')
async def main7():
    # п.6 счётчик правок: повтор запроса идемпотентен, откат счётчика не теряет правку, сервер сообщает ushi
    import time as T
    Store.legacy=None
    h=Hass(); assert await k.async_setup(h,{}) is True
    sv=[v for v in h.http.views if type(v).__name__=='SyncView'][0]
    d=h.data['korobki']['data']; now=int(T.time()*1000)
    root={'id':'root','t':'home','p':None,'n':'Дом','u':now}
    batch=[root,{'id':'q1','t':'place','p':'root','n':'one','u':now,'us':5}]
    o1=(await sv.post(Req({'since':0,'device':'A','label':'a','records':batch})))[2]
    assert o1['ushi']==5 and not o1['stale'], o1
    rev1=d['rev']; r1=dict(d['recs']['q1'])
    o2=(await sv.post(Req({'since':0,'device':'A','label':'a','records':batch})))[2]   # тот же запрос ещё раз (обрыв связи, повтор)
    assert d['rev']==rev1 and d['recs']['q1']==r1 and not o2['stale'], 'повтор запроса изменил данные'
    for _ in range(3): await sv.post(Req({'since':0,'device':'A','label':'a','records':batch}))
    assert d['rev']==rev1
    # сбой на устройстве: счётчик откатился, новая правка пришла с номером 5 на старой ревизии
    edit2=[{'id':'q1','t':'place','p':'root','n':'two','u':now+10,'us':5,'br':0}]
    o3=(await sv.post(Req({'since':0,'device':'A','label':'a','records':edit2})))[2]
    assert o3['stale']==['q1'] and o3['ushi']>=5 and d['recs']['q1']['n']=='one', o3
    # клиент поднимает счётчик и шлёт заново поверх текущей версии
    edit2=[{'id':'q1','t':'place','p':'root','n':'two','u':now+10,'us':o3['ushi']+1,'br':d['recs']['q1']['r']}]
    o4=(await sv.post(Req({'since':0,'device':'A','label':'a','records':edit2})))[2]
    assert d['recs']['q1']['n']=='two' and not o4['stale'] and o4['ushi']==6, o4
    # счётчик откатился, но устройство видело текущую версию: правка принимается сразу
    edit3=[{'id':'q1','t':'place','p':'root','n':'three','u':now+20,'us':1,'br':d['recs']['q1']['r']}]
    o5=(await sv.post(Req({'since':0,'device':'A','label':'a','records':edit3})))[2]
    assert d['recs']['q1']['n']=='three' and not o5['stale'], o5
    # старый повтор (отстаёт и по счётчику, и по ревизии) правку не затирает
    old=[{'id':'q1','t':'place','p':'root','n':'two','u':now+10,'us':3,'br':0}]
    o6=(await sv.post(Req({'since':0,'device':'A','label':'a','records':old})))[2]
    assert d['recs']['q1']['n']=='three' and o6['stale']==['q1']
    assert d['devices']['A']['us']>=6
    print('PY7_OK useq')
asyncio.run(main()); asyncio.run(main2()); asyncio.run(main3()); asyncio.run(main4()); asyncio.run(main5()); asyncio.run(main6()); asyncio.run(main7())
