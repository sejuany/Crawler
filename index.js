const { addExtra } = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const puppeteerCore = require('puppeteer-core')
const puppeteer = addExtra(puppeteerCore)

puppeteer.use(StealthPlugin())

const fs = require('fs')
const path = require('path')
const axios = require('axios')

async function downloadResource(resourceUrl, saveDir) {
  try {
    if (resourceUrl.startsWith('data:')) return
    const urlObj = new URL(resourceUrl)
    const savePath = path.join(saveDir, urlObj.pathname)
    await fs.promises.mkdir(path.dirname(savePath), { recursive: true })
    const resp = await axios.get(resourceUrl, { responseType: 'arraybuffer' })
    await fs.promises.writeFile(savePath, resp.data)
    console.log(`Downloaded: ${resourceUrl}`)
  } catch (err) {
    console.warn(`✖ Failed to download ${resourceUrl}: ${err.response?.status || err.code}`)
  }
}

async function crawl(page, targetUrl, saveDir, htmlOnly = false) {
  await fs.promises.mkdir(saveDir, { recursive: true })

  // HTML 저장
  const html = await page.content()
  const htmlPath = path.join(saveDir, 'index.html')
  await fs.promises.writeFile(htmlPath, html, 'utf8')
  console.log(`✔ Saved HTML → ${htmlPath}`)

  if (htmlOnly) {
    console.log('ℹ HTML 전용 모드: 리소스 다운로드 생략')
    return
  }

  // 리소스 URL 수집
  const resources = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src], link[href][rel="stylesheet"], script[src]'))
      .map(el => el.src || el.href)
      .filter(u => !u.startsWith('data:'))
  )

  console.log(`▶ Found ${resources.length} resources, downloading...`)
  for (const r of resources) {
    const fullUrl = new URL(r, targetUrl).href
    await downloadResource(fullUrl, saveDir)
  }
  console.log('✔ All resources downloaded.')
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  })
  const page = await browser.newPage()

  // Stealth 설정
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/115.0.0.0 Safari/537.36'
  )
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' })
  if (page.emulateTimezoneId) {
    await page.emulateTimezoneId('Asia/Seoul')
  } else if (page.emulateTimezone) {
    await page.emulateTimezone('Asia/Seoul')
  }
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  // 첫 페이지 열기 (로그인/조작)
  await page.goto('https://www.dacos.co.kr/index.do', { waitUntil: 'networkidle2' })
  console.log('\n✅ 페이지 열림. 로그인/조작 완료 후 명령을 입력하세요.')
  console.log('명령: [Enter] 전체 리소스, [1] HTML만, [exit] 종료\n')

  const saveRoot = path.resolve(__dirname, 'dacos_crawl')
  fs.existsSync(saveRoot) || fs.mkdirSync(saveRoot)

  let isNaming = false
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (chunk) => {
    const input = chunk.trim()

    if (isNaming) {
      const name = input || 'page'
      const filePath = path.join(saveRoot, `${name}.html`)
      const html = await page.content()
      await fs.promises.writeFile(filePath, html, 'utf8')
      console.log(`✔ Saved HTML only → ${filePath}`)
      console.log('\n다음 명령을 입력하세요: [Enter] 전체, [1] HTML만, [exit] 종료\n')
      isNaming = false
      return
    }

    if (input === 'exit') {
      console.log('👋 종료합니다.')
      await browser.close()
      process.exit(0)

    } else if (input === '1') {
      isNaming = true
      process.stdout.write('저장할 페이지명을 입력하세요 (확장자 제외): ')

    } else if (input === '') {
      console.log('\n▶ 전체 리소스 다운로드 시작')
      await crawl(page, page.url(), saveRoot, false)
      console.log('\n다음 명령을 입력하세요: [Enter] 전체, [1] HTML만, [exit] 종료\n')

    } else {
      console.log(`❓ 알 수 없는 명령: "${input}"`)
      console.log('\n다음 명령을 입력하세요: [Enter] 전체, [1] HTML만, [exit] 종료\n')
    }
  })
})().catch(err => {
  console.error('스크립트 오류:', err)
  process.exit(1)
})
