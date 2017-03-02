import { Anticaptcha } from '.'

const ac = new Anticaptcha([{
  name: 'anti-captcha',
  host: 'http://anti-captcha.com',
  key: '12345'
}, {
  name: 'rucaptcha',
  host: 'http://rucaptcha.com',
  key: '12345'
}])

main()
async function main() {
  let id = await ac.recognize({ method: 'post', file: '/home/user/1.png' })
  console.log(id)
}
