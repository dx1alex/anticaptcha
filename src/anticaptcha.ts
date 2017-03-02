import * as fs from 'fs'
import * as path from 'path'
import * as request from 'request'

export class Anticaptcha {
  pause = 3000
  service: AnticaptchaService
  services: AnticaptchaService[]

  constructor(options: AnticaptchaService | AnticaptchaService[], name?: string) {
    this.services = Array.isArray(options) ? options : [options]
    if (name) {
      this.use(name)
    } else {
      this.service = this.services[0]
    }
  }

  get key() {
    return this.service.key
  }

  get name() {
    return this.service.name
  }

  get host() {
    return this.service.host
  }

  use(name: string) {
    const service = this.services.find(v => v.name === name)
    if (!service) {
      throw new Error(`anticaptcha: service "${name}" not found`)
    }
    return this.service = service
  }

  next() {
    const i = this.services.findIndex(v => v.name === this.name)
    this.service = this.services[i == this.services.length - 1 ? 0 : i + 1]
    return this.service
  }

  addService(options: AnticaptchaService | AnticaptchaService[]) {
    const services = Array.isArray(options) ? options : [options]
    this.services = this.services.concat(services)
  }

  async send(options: CaptchaOptions, name?: string): Promise<string> {
    const service = name ? this.services.find(v => v.name === name) : this.service

    const formData: CaptchaOptions = Object.assign({}, { key: service.key }, options)

    if (typeof formData.file === 'string') {
      formData.file = fs.createReadStream(formData.file)
    }

    if (formData.body) {
      formData.body = encodeURIComponent(formData.body)
    }

    const res = await new Promise<string>((resolve, reject) => {
      request.post({ url: `${service.host}/in.php`, formData }, (err, response, body) => {
        if (err) {
          return reject(err)
        }
        resolve(body)
      })
    })

    const [, id] = res.match(/^OK\|(\d+)$/) || [, ,]

    if (!id) {
      const error = new Error(`anticaptcha: "${service.name}" ${res}`)
      error['code'] = res
      throw error
    }

    return id
  }

  /**
   * Запрос текста капчи
   * Запрос состояния капчи необходимо выполнять в течение 300 секунд после загрузки.
   * После 300 секунд API будет возвращать ошибку ERROR_NO_SUCH_CAPCHA_ID
   */
  async get(id: string, name?: string): Promise<string> {
    const service = name ? this.services.find(v => v.name === name) : this.service

    const res = await new Promise<string>((resolve, reject) => {
      request.get(`${service.host}/res.php?key=${service.key}&action=get&id=${id}`, (err, response, body) => {
        if (err) {
          return reject(err)
        }
        resolve(body)
      })
    })

    if (res === 'CAPCHA_NOT_READY') return null

    const [, code] = res.match(/^OK\|(.+)$/) || [, ,]

    if (!code) {
      const error = new Error(`anticaptcha: "${service.name}" ${res}`)
      error['code'] = res
      throw error
    }

    return code
  }

  async recognize(options: CaptchaOptions, name?: string): Promise<{ id: string, code: string, name: string, time: number }> {
    name = name || this.service.name
    const id = await this.send(options, name)
    const start = Date.now()

    for (let i = 0; i < 300000 / this.pause; i++) {
      await sleep(this.pause)
      let code = await this.get(id, name)
      if (code) return { id, code, name, time: Date.now() - start }
    }

    const res = 'CAPTCHA_NOT_RECOGNIZE'
    const error = new Error(`anticaptcha: "${name}" ${res}`)
    error['code'] = res
    throw error
  }

  bad(id: string, name?: string): Promise<string> {
    const service = name ? this.services.find(v => v.name === name) : this.service

    return new Promise<string>((resolve, reject) => {
      request.get(`${service.host}/res.php?key=${service.key}&action=reportbad&id=${id}`, (err, response, body) => {
        if (err) {
          return reject(err)
        }
        resolve(body)
      })
    })
  }

  ballance(name?: string): Promise<number> {
    const service = name ? this.services.find(v => v.name === name) : this.service

    return new Promise<number>((resolve, reject) => {
      request.get(`${service.host}/res.php?key=${service.key}&action=getbalance`, (err, response, body) => {
        if (err) {
          return reject(err)
        }
        resolve(+body)
      })
    })
  }

}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface AnticaptchaService {
  name?: string
  host: string
  key: string
}

export interface CaptchaOptions extends UploadOptions, RecognizeOptions {
}

export interface UploadOptions {
  method?: 'post' | 'base64'
  file?: string | NodeJS.ReadableStream
  body?: string
  key?: string
}

export interface RecognizeOptions {
  /**
   * 0 = дефолтное значение
   * 1 = капча имеет 2-3 слова
   */
  phrase?: number
  /**
   * 0 = дефолтное значение
   * 1 = капча чувствительна к регистру
   */
  regsense?: number
  /**
   * 0 = дефолтное значение
   * 1 = капча состоит только из цифр
   * 2 = капча не содержит ни одной цифры
   */
  numeric?: number
  /**
   * 0 = дефолтное значение
   * 1 = необходимо выполнить математическое действие
   */
  calc?: number
  /**
   * 0 = дефолтное значение
   * 1..20 = минимальная длина ответа
   */
  min_len?: number
  /**
   * 0 = дефолтное значение
   * 1..20 = мaxимальная длина ответа
   */
  max_len?: number
  /**
   * 0 = дефолтное значение
   * 1 = отправить капчу в русскоязычную очередь
   */
  is_russian?: number
  /**
   * ID приложения из AppCenter, необходимо для получения комиссии
   */
  soft_id?: number
  /**
   * 0 = дефолтное значение
   * 1 = API отправляет в заголовке параметр Access-Control-Allow-Origin: *.
   * (Требуется для кросс-доменных AJAX запросов для приложений в браузерах).
   */
  header_acao?: number
  /**
   * пусто = дефолтное значение
   * recaptcha2 = Используйте это значение для капч Recaptcha2. Изображение должно иметь соотношение сторон 1х1,
   * иметь минимальную высоту 200 пикселей и сопровождаться непустым значением параметра "comment".
   * В нем вы должны указать на английском языке название объекта, который необходимо выбрать на капче (cat, road sign, burger, etc.).
   * See workers interface screenshot: https://anti-captcha.com/files/screenshots/recaptcha_interface.png
   * recaptcha2_44 = Тоже самое что и "recaptcha2", только поймет что на капче сетка из 16 изображений (4 х 4).
   * recaptcha2_24 = Recaptcha2 с маской из 8 клеток (2 х 4).
   * Очень важно слать только сами картинки с 9 изображениями, без голубых заголовков, поясняющих текстов на картинке.
   * Для этого есть поле comment.. Примеры того, как некоторые клиенты не понимают этого можно посмотреть
   * здесь: https://anti-captcha.com/images/example_captcha/recaptcha_bad_1.png и здесь: https://anti-captcha.com/images/example_captcha/recaptcha_bad_2.png
   */
  type?: 'recaptcha2' | 'recaptcha2_44' | 'recaptcha2_24'
  /**
   * пусто = дефолтное значение
   * Опция 1. Прислать вместе с капчей пояснительный текст.
   * Опция 2. Прислать без капчи если вы просто хотите задать вопрос (напр. "What color is the sky?")
   * максимум 100 байт
   */
  comment?: string
  /**
   * 0 = параметр не задействован (значение по умолчанию )
   * 1 = на изображении задан вопрос, работник должен написать ответ
   */
  question?: number
  /**
   * 0 = параметр не задействован (значение по умолчанию)
   * 1 = на капче только кириллические буквы
   * 2 = на капче только латинские буквы 
   */
  language?: number

  [key: string]: any
}
