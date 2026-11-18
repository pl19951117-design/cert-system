// Run with Electron against a disposable demonstration database.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const [mode, scaleText, output] = process.argv.slice(2)
const scale = Number(scaleText)
app.commandLine.appendSwitch('force-device-scale-factor', String(scale))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: Math.round(1366/scale), height: Math.round(860/scale), useContentSize:true, show:false, webPreferences:{backgroundThrottling:false} })
  const base = 'http://127.0.0.1:34202'
  const ses = win.webContents.session
  const login = await ses.fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})})
  if (!login.ok) throw Error('Demo login failed '+login.status)
  const cookie = login.headers.get('set-cookie')?.match(/cert-session=([^;]+)/)
  if(cookie) await ses.cookies.set({url:base,name:'cert-session',value:cookie[1]})
  await win.loadURL(base+'/login')
  await win.webContents.executeJavaScript("sessionStorage.setItem('cert-reminder-shown','1')")
  await win.loadURL(base)
  for (const compact of mode==='after' && scale===1 ? [false,true] : [false]) {
    if (compact) win.setContentSize(900,680)
    await new Promise(resolve=>setTimeout(resolve,1800))
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)')
    const check = await win.webContents.executeJavaScript(`(() => {
      const queue=document.querySelector('#queue'), action=document.querySelector('.duty-action')?.getBoundingClientRect()
      return {width:innerWidth, height:innerHeight, overflow:document.documentElement.scrollWidth-innerWidth,
        demo:document.body.textContent.includes('陈思远'), queue:!!queue, action: action && action.bottom<=innerHeight && action.right<=innerWidth}
    })()`)
    console.log(check)
    if (!check.demo || check.overflow>1 || (mode==='after' && !check.action)) throw Error('Overview layout check failed '+JSON.stringify(check))
    const img=await win.webContents.capturePage()
    fs.writeFileSync(path.join(output,compact?'compact.png':scale===1?mode+'.png':'scale'+Math.round(scale*100)+'.png'),img.toPNG())
  }
  app.exit(0)
}).catch(e=>{console.error(e);app.exit(1)})
