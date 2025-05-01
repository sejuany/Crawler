// index.js
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const fs = require('fs')
const path = require('path')
const axios = require('axios')
const readline = require('readline')

async function downloadResource(resourceUrl, saveDir) {
  if (resourceUrl.startsWith('data:')) return 
  try {
    const urlObj = new URL(resourceUrl)
    const savePath = path.join(saveDir, urlObj.pathname)
    await fs.promises.mkdir(path.dirname(savePath), { recursive: true })
    const resp = await axios.get(resourceUrl, { responseType: 'arraybuffer' })
    await fs.promises.writeFile(savePath, resp.data)
    console.log(`✔ Downloaded: ${resourceUrl}`)
  } catch (e) {
    console.warn(`✖ Failed ${resourceUrl}: ${e.response?.status || e.code}`)
  }
}

async function crawl(page, saveDir) {
  await fs.promises.mkdir(saveDir, { recursive: true })
  // await page.waitFor(500)
  const html = await page.content()
  await fs.promises.writeFile(path.join(saveDir, 'index.html'), html, 'utf8')
  console.log(`✔ Saved HTML → ${path.join(saveDir, 'index.html')}`)

  const resources = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src], link[rel="stylesheet"][href], script[src]'))
      .map(el => el.src || el.href)
      .filter(u => !u.startsWith('data:'))
  )
  console.log(`▶ Found ${resources.length} resources, downloading...`)
  for (const r of resources) await downloadResource(r, saveDir)
  console.log('✔ All resources downloaded.')
}

;(async () => {
  // Stealth 모드로 브라우저 실행
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  })
  const page = await browser.newPage()

  // Stealth 플러그인이 처리해 주지만, 추가로 navigator.webdriver 지우기
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  // (옵션) User-Agent, 언어, 타임존 설정
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/115.0.0.0 Safari/537.36'
  )
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' })
  if (page.emulateTimezone) await page.emulateTimezone('Asia/Seoul')

  // 1) 초기 페이지 열기 (수동 로그인/조작)
  await page.goto('https://www.dacos.co.kr/index.do', { waitUntil: 'networkidle2' })
  console.log('\n✅ 브라우저에서 로그인/조작을 완료하세요.')
  console.log('   완료되면 터미널에서 Enter를 누르세요.\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = q => new Promise(res => rl.question(q, res))

  // 로그인/조작 완료 대기
  await ask('▶ 로그인/조작 완료 후 Enter\n')

  const saveDir = path.resolve(__dirname, 'cpage')
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir)

  // 2) 명령 루프
  while (true) {
    const cmd = (await ask('\n명령 ▶ [Enter] 전체 크롤링, [1] HTML만 저장, [exit] 종료\n')).trim()
    if (cmd === 'exit') break

    if (cmd === '') {
      console.log('▶ 전체 크롤링 시작')
      await crawl(page, saveDir)
      continue
    }

    if (cmd === '1') {
      const name = (await ask('저장할 파일명 (확장자 제외): ')).trim() || 'page'
      // await page.waitFor(500);
     // 페이지가 완전히 로드될 때까지 대기
     await page.waitForFunction(() => document.readyState === 'complete');
     // 짧게 추가 대기(필요시)
    //  await page.waitFor(300);
      const html = await page.content()
      const filePath = path.join(saveDir, `${name}.html`)
      await fs.promises.writeFile(filePath, html, 'utf8')
      console.log(`✔ Saved HTML only → ${filePath}`)
      continue
    }

    console.log(`❓ 알 수 없는 명령: "${cmd}"`)
  }

  rl.close()
  await browser.close()
  process.exit(0)
})().catch(err => {
  console.error('스크립트 오류:', err)
  process.exit(1)
})
