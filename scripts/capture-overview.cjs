// Run with Electron against a disposable demonstration database.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const [mode, scaleText, output] = process.argv.slice(2)
const scale = Number(scaleText)
app.commandLine.appendSwitch('force-device-scale-factor', String(scale))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: Math.round(1366/scale), height: Math.round(860/scale), useContentSize:true, show:true, webPreferences:{backgroundThrottling:false} })
  const base = 'http://127.0.0.1:34202'
  win.webContents.debugger.attach('1.3')
  const ses = win.webContents.session
  const login = await ses.fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})})
  if (!login.ok) throw Error('Demo login failed '+login.status)
  await win.loadURL(base+'/login')
  await win.webContents.executeJavaScript("sessionStorage.setItem('cert-reminder-shown','1')")
  await win.loadURL(base)
  for (const compact of mode==='after' && scale===1 ? [false,true] : [false]) {
    const width=compact?900:Math.round(1366/scale), height=compact?680:Math.round(860/scale)
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false})
    await new Promise(resolve=>setTimeout(resolve,1800))
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)')
    const check = await win.webContents.executeJavaScript(`(() => {
      const queue=document.querySelector('#queue'), action=document.querySelector('.duty-action')?.getBoundingClientRect()
      return {width:innerWidth, height:innerHeight, overflow:document.documentElement.scrollWidth-innerWidth,
        demo:document.body.textContent.includes('陈思远'), queue:!!queue, action: action && action.bottom<=innerHeight && action.right<=innerWidth}
    })()`)
    console.log(check)
    if (!check.demo || check.overflow>1 || (mode==='after' && !check.action)) throw Error('Overview layout check failed '+JSON.stringify(check))
    await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))')
    const shot=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}})
    const img=require('electron').nativeImage.createFromBuffer(Buffer.from(shot.data,'base64'))
    if(mode==='after'){
      const bitmap=img.toBitmap();let blue=0
      for(let i=0;i<bitmap.length;i+=4) if(bitmap[i]===102 && bitmap[i+1]===71 && bitmap[i+2]===24) blue++
      if(blue<4000) throw Error('Queue heading missing from captured pixels')
    }
    fs.writeFileSync(path.join(output,compact?'compact.png':scale===1?mode+'.png':'scale'+Math.round(scale*100)+'.png'),img.toPNG())
  }
  app.exit(0)
}).catch(e=>{console.error(e);app.exit(1)})
